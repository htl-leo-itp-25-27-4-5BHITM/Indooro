package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.service.CatalogBulkResult;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class ProductResourceBulkTest {
    private static final String TWO = "[{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"},"
            + "{\"id\":102,\"name\":\"Pear\",\"price\":1.3,\"layoutCode\":\"310/1/1/2\"}]";

    @InjectMock OpenSearchService products;
    @InjectMock AdminAccessService access;

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void partialResultIsReportedPerRow() throws IOException {
        when(products.indexProducts(anyList())).thenReturn(new CatalogBulkResult("Import requires review", 2, 1, 1, 0,
                List.of(new CatalogBulkResult.Row(1, "101", "saved", null),
                        new CatalogBulkResult.Row(2, "102", "failed", "bad price"))));

        given().contentType("application/json").body(TWO).post("/api/products/bulk").then()
                .statusCode(200).body("saved", equalTo(1), "failed", equalTo(1),
                        "rows[1].id", equalTo("102"), "rows[1].status", equalTo("failed"));
        verify(access).requireAdmin();
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void transportFailureReportsUnknownInsteadOfSuccess() throws IOException {
        when(products.indexProducts(anyList())).thenThrow(new IOException("lost response"));

        given().contentType("application/json").body(TWO).post("/api/products/bulk").then()
                .statusCode(503).body("saved", equalTo(0), "unknown", equalTo(2),
                        "rows[0].status", equalTo("unknown"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void duplicateIdsAreRejectedBeforeBulkWrite() throws IOException {
        given().contentType("application/json").body(TWO.replace("\"id\":102", "\"id\":101"))
                .post("/api/products/bulk").then().statusCode(400);
        verify(products, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCannotBulkWrite() throws IOException {
        given().contentType("application/json").body(TWO).post("/api/products/bulk").then().statusCode(403);
        verify(products, never()).indexProducts(anyList());
    }
}
