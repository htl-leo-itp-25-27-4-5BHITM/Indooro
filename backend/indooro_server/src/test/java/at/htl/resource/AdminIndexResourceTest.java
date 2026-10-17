package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class AdminIndexResourceTest {

    @InjectMock
    OpenSearchService openSearchService;

    @InjectMock
    AdminAccessService adminAccessService;

    @Test
    void anonymousCannotMutateProductIndex() throws IOException {
        given().contentType("application/json").body("{}").post("/api/admin/index/create").then().statusCode(401);
        given().contentType("application/json").delete("/api/admin/index").then().statusCode(401);
        verify(openSearchService, never()).createIndex();
        verify(openSearchService, never()).deleteIndex();
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCannotMutateProductIndex() throws IOException {
        given().contentType("application/json").body("{}").post("/api/admin/index/create").then().statusCode(403);
        given().contentType("application/json").delete("/api/admin/index").then().statusCode(403);
        verify(openSearchService, never()).createIndex();
        verify(openSearchService, never()).deleteIndex();
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminCanInitializeProductIndex() throws IOException {
        given().contentType("application/json").body("{}").post("/api/admin/index/create").then().statusCode(200);
        verify(adminAccessService).requireAdmin();
        verify(openSearchService).createIndex();
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void existingProductIndexReportsConflict() throws IOException {
        doThrow(new WebApplicationException("Produktindex existiert bereits.", Response.Status.CONFLICT))
                .when(openSearchService).createIndex();

        given().contentType("application/json").body("{}")
                .post("/api/admin/index/create").then()
                .statusCode(409)
                .contentType("application/json")
                .body("status", org.hamcrest.Matchers.equalTo(409))
                .body("error", org.hamcrest.Matchers.containsString("Produktindex existiert bereits"));
    }

    @Test
    void anonymousCannotReindexOrActivate() throws IOException {
        given().contentType("application/json").body("{}").post("/api/admin/index/reindex").then().statusCode(401);
        given().contentType("application/json").post("/api/admin/index/activate?index=products_v1").then().statusCode(401);
        verify(openSearchService, never()).reindexProducts();
        verify(openSearchService, never()).activateIndex(any());
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCannotReindexOrActivate() throws IOException {
        given().contentType("application/json").body("{}").post("/api/admin/index/reindex").then().statusCode(403);
        given().contentType("application/json").post("/api/admin/index/activate?index=products_v1").then().statusCode(403);
        verify(openSearchService, never()).reindexProducts();
        verify(openSearchService, never()).activateIndex(any());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminCanReindexAndActivate() throws IOException {
        when(openSearchService.reindexProducts()).thenReturn(
                new OpenSearchService.ReindexResult("products", "products_v1", 5, 5, "OK"));
        when(openSearchService.activateIndex("products_v1")).thenReturn(
                new OpenSearchService.ActivateResult("products_live", "products_v1", List.of()));

        given().contentType("application/json").body("{}")
                .post("/api/admin/index/reindex").then()
                .statusCode(200)
                .body("target", org.hamcrest.Matchers.equalTo("products_v1"))
                .body("sourceCount", org.hamcrest.Matchers.equalTo(5))
                .body("status", org.hamcrest.Matchers.equalTo("OK"));
        given().contentType("application/json")
                .post("/api/admin/index/activate?index=products_v1").then()
                .statusCode(200)
                .body("alias", org.hamcrest.Matchers.equalTo("products_live"))
                .body("index", org.hamcrest.Matchers.equalTo("products_v1"));

        verify(adminAccessService, atLeastOnce()).requireAdmin();
        verify(openSearchService).reindexProducts();
        verify(openSearchService).activateIndex("products_v1");
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void invalidActivateTargetReportsBadRequest() throws IOException {
        doThrow(new WebApplicationException("Ungültiger Indexname \"products\": erwartet products_v<Nummer>.",
                Response.Status.BAD_REQUEST))
                .when(openSearchService).activateIndex("products");

        given().contentType("application/json")
                .post("/api/admin/index/activate?index=products").then()
                .statusCode(400)
                .contentType("application/json")
                .body("status", org.hamcrest.Matchers.equalTo(400))
                .body("error", org.hamcrest.Matchers.containsString("Ungültiger Indexname"));
    }
}
