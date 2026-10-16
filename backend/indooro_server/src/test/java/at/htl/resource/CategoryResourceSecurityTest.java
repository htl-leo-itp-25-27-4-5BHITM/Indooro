package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.model.Category;
import at.htl.service.CategoryService;
import at.htl.service.CatalogBulkResult;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.opensearch.client.opensearch._types.OpenSearchException;
import org.opensearch.client.ResponseException;
import org.apache.http.RequestLine;
import org.apache.http.StatusLine;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class CategoryResourceSecurityTest {

    @InjectMock
    CategoryService categories;

    @InjectMock
    AdminAccessService access;

    @Test
    void anonymousCatalogReadRemainsPublic() throws IOException {
        when(categories.getAllCategories(5)).thenReturn(List.of(new Category(310, "Obst")));
        given().queryParam("size", 5).get("/api/categories").then()
                .statusCode(200).body("[0].categoryCode", equalTo(310));
    }

    @Test
    void anonymousCannotWriteCategory() throws IOException {
        given().contentType("application/json")
                .body("{\"categoryCode\":310,\"categoryName\":\"Obst\"}")
                .post("/api/categories").then().statusCode(401);
        verify(categories, never()).bulkInsert(anyList());
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCannotWriteCategory() throws IOException {
        given().contentType("application/json")
                .body("{\"categoryCode\":310,\"categoryName\":\"Obst\"}")
                .post("/api/categories").then().statusCode(403);
        verify(categories, never()).bulkInsert(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminCanWriteCategory() throws IOException {
        when(categories.bulkInsert(anyList())).thenReturn(new CatalogBulkResult("All rows indexed", 1, 1, 0, 0,
                List.of(new CatalogBulkResult.Row(1, "310", "saved", null))));
        given().contentType("application/json")
                .body("{\"categoryCode\":310,\"categoryName\":\"Obst\"}")
                .post("/api/categories").then().statusCode(200)
                .body("categoryName", equalTo("Obst"));
        verify(access).requireAdmin();
        verify(categories).bulkInsert(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void createOnlyUsesAtomicWrite() throws IOException {
        when(categories.create(any(Category.class))).thenReturn(new Category(312, "Neu"));
        given().contentType("application/json").queryParam("createOnly", true)
                .body("{\"categoryCode\":312,\"categoryName\":\"Neu\"}")
                .post("/api/categories").then().statusCode(200)
                .body("categoryCode", equalTo(312));
        verify(categories).create(any(Category.class));
        verify(categories, never()).bulkInsert(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void createOnlyConflictDoesNotFallBackToUpsert() throws IOException {
        OpenSearchException conflict = mock(OpenSearchException.class);
        when(conflict.status()).thenReturn(409);
        when(categories.create(any(Category.class))).thenThrow(conflict);
        given().contentType("application/json").queryParam("createOnly", true)
                .body("{\"categoryCode\":310,\"categoryName\":\"Ersetzen\"}")
                .post("/api/categories").then().statusCode(409)
                .body("error", equalTo("Kategorie-Code existiert bereits."));
        verify(categories, never()).bulkInsert(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void lowLevelOpenSearchConflictIsAlsoMappedTo409() throws IOException {
        org.opensearch.client.Response response = mock(org.opensearch.client.Response.class);
        RequestLine requestLine = mock(RequestLine.class);
        StatusLine statusLine = mock(StatusLine.class);
        when(response.getRequestLine()).thenReturn(requestLine);
        when(requestLine.getMethod()).thenReturn("PUT");
        when(requestLine.getUri()).thenReturn("/categories/_create/310");
        when(response.getStatusLine()).thenReturn(statusLine);
        when(statusLine.getStatusCode()).thenReturn(409);
        ResponseException conflict = new ResponseException(response);
        when(categories.create(any(Category.class))).thenThrow(conflict);
        given().contentType("application/json").queryParam("createOnly", true)
                .body("{\"categoryCode\":310,\"categoryName\":\"Ersetzen\"}")
                .post("/api/categories").then().statusCode(409)
                .body("error", equalTo("Kategorie-Code existiert bereits."));
        verify(categories, never()).bulkInsert(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void bulkCategoryPartialResultIsNotReportedAsFullSuccess() throws IOException {
        when(categories.bulkInsert(anyList())).thenReturn(new CatalogBulkResult("Import requires review", 2, 1, 1, 0,
                List.of(new CatalogBulkResult.Row(1, "310", "saved", null),
                        new CatalogBulkResult.Row(2, "311", "failed", "mapping failed"))));
        given().contentType("application/json")
                .body("[{\"categoryCode\":310,\"categoryName\":\"Obst\"},{\"categoryCode\":311,\"categoryName\":\"Gemüse\"}]")
                .post("/api/categories/bulk").then().statusCode(200)
                .body("saved", equalTo(1), "failed", equalTo(1), "rows[1].status", equalTo("failed"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void bulkCategoryTransportFailureIsUnknown() throws IOException {
        when(categories.bulkInsert(anyList())).thenThrow(new IOException("lost response"));
        given().contentType("application/json")
                .body("[{\"categoryCode\":310,\"categoryName\":\"Obst\"}]")
                .post("/api/categories/bulk").then().statusCode(503)
                .body("saved", equalTo(0), "unknown", equalTo(1), "rows[0].status", equalTo("unknown"));
    }
}
