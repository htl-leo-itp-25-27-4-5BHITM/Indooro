package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.model.Product;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class ProductResourceBulkTest {
    private static final String TWO = "[{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"},"
            + "{\"id\":102,\"name\":\"Pear\",\"price\":1.3,\"layoutCode\":\"310/1/1/2\"}]";
    private static final String PILOT_CODE = "SPAR-Leonding-001";
    private static final UUID PILOT_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000001");
    private static final ResolvedStore PILOT = new ResolvedStore(PILOT_ID, PILOT_CODE);
    private static final String ONE_SINGLE = "{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"}";

    @InjectMock OpenSearchService products;
    @InjectMock AdminAccessService access;
    @InjectMock CatalogStoreResolver storeResolver;

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void partialResultIsReportedPerRow() throws IOException {
        stubPilotParameter();
        when(products.indexProducts(anyList())).thenReturn(new CatalogBulkResult("Import requires review", 2, 1, 1, 0,
                List.of(new CatalogBulkResult.Row(1, "101", "saved", null),
                        new CatalogBulkResult.Row(2, "102", "failed", "bad price"))));

        given().contentType("application/json").body(TWO).queryParam("storeCode", PILOT_CODE)
                .post("/api/products/bulk").then()
                .statusCode(200).body("saved", equalTo(1), "failed", equalTo(1),
                        "rows[1].id", equalTo("102"), "rows[1].status", equalTo("failed"));
        verify(access).requireAdmin();
        verify(products).indexProducts(argThat(list -> list.size() == 2
                && list.stream().allMatch(p -> PILOT_CODE.equals(p.getStoreCode()) && PILOT_ID.toString().equals(p.getStoreId()))));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void transportFailureReportsUnknownInsteadOfSuccess() throws IOException {
        stubPilotParameter();
        when(products.indexProducts(anyList())).thenThrow(new IOException("lost response"));

        given().contentType("application/json").body(TWO).queryParam("storeCode", PILOT_CODE)
                .post("/api/products/bulk").then()
                .statusCode(503).body("saved", equalTo(0), "unknown", equalTo(2),
                        "rows[0].status", equalTo("unknown"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void duplicateIdsAreRejectedBeforeBulkWrite() throws IOException {
        stubPilotParameter();
        given().contentType("application/json").body(TWO.replace("\"id\":102", "\"id\":101"))
                .queryParam("storeCode", PILOT_CODE)
                .post("/api/products/bulk").then().statusCode(400);
        verify(products, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCannotBulkWrite() throws IOException {
        given().contentType("application/json").body(TWO).queryParam("storeCode", PILOT_CODE)
                .post("/api/products/bulk").then().statusCode(403);
        verify(products, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void bulkWithoutAnyStoreIsRejectedAsWholeRequest() throws IOException {
        given().contentType("application/json").body(TWO)
                .post("/api/products/bulk").then()
                .statusCode(400)
                .body("error", equalTo("Markt fehlt: storeId oder storeCode angeben."));
        verify(products, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void bulkWithUnknownStoreParameterIsRejected() throws IOException {
        when(storeResolver.resolveOptional(isNull(), eq("unbekannt")))
                .thenThrow(new CatalogStoreException("Unbekannter Markt."));

        given().contentType("application/json").body(TWO).queryParam("storeCode", "unbekannt")
                .post("/api/products/bulk").then()
                .statusCode(400)
                .body("error", equalTo("Unbekannter Markt."));
        verify(products, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void itemFromOtherStoreConflictsWithParameterAndIsReportedAsRow() throws IOException {
        stubPilotParameter();
        when(storeResolver.resolveOptional(isNull(), eq("demo-store")))
                .thenReturn(new ResolvedStore(UUID.fromString("6f1c2a5e-0000-4000-8000-000000000002"), "demo-store"));
        when(products.indexProducts(anyList())).thenReturn(new CatalogBulkResult("Import requires review", 1, 1, 0, 0,
                List.of(new CatalogBulkResult.Row(1, "102", "saved", null))));
        String body = "[{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\",\"storeCode\":\"demo-store\"},"
                + "{\"id\":102,\"name\":\"Pear\",\"price\":1.3,\"layoutCode\":\"310/1/1/2\"}]";

        given().contentType("application/json").body(body).queryParam("storeCode", PILOT_CODE)
                .post("/api/products/bulk").then()
                .statusCode(200)
                .body("saved", equalTo(1), "failed", equalTo(1),
                        "rows[0].status", equalTo("failed"), "rows[1].status", equalTo("saved"));
        verify(products).indexProducts(argThat(list -> list.size() == 1 && "102".equals(String.valueOf(list.get(0).getId()))));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void singleProductWithoutStoreIsRejectedInGerman() throws IOException {
        when(storeResolver.require(any(), any()))
                .thenThrow(new CatalogStoreException("Markt fehlt: storeId oder storeCode angeben."));

        given().contentType("application/json").body(ONE_SINGLE)
                .post("/api/products").then()
                .statusCode(400)
                .body("error", equalTo("Markt fehlt: storeId oder storeCode angeben."));
        verify(products, never()).indexProduct(any(Product.class));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void singleProductGetsStoreFromDatabaseRecord() throws IOException {
        when(storeResolver.require(any(), eq(PILOT_CODE))).thenReturn(PILOT);

        given().contentType("application/json").body(ONE_SINGLE.replace("}", ",\"storeCode\":\"" + PILOT_CODE + "\"}"))
                .post("/api/products").then()
                .statusCode(200);
        verify(products).indexProduct(argThat(product -> PILOT_CODE.equals(product.getStoreCode())
                && PILOT_ID.toString().equals(product.getStoreId())));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void bulkWithMoreThan500ProductsIsRejectedBeforeWrite() throws IOException {
        stubPilotParameter();
        StringBuilder items = new StringBuilder("[");
        for (int id = 1; id <= 501; id++) {
            items.append(id > 1 ? "," : "").append("{\"id\":").append(id)
                    .append(",\"name\":\"Ware\",\"price\":1.0,\"layoutCode\":\"310/1/1/1\"}");
        }
        items.append("]");

        given().contentType("application/json").body(items.toString()).queryParam("storeCode", PILOT_CODE)
                .post("/api/products/bulk").then()
                .statusCode(400)
                .body("error", equalTo("Maximal 500 Produkte pro Anfrage."));
        verify(products, never()).indexProducts(anyList());
    }

    private void stubPilotParameter() {
        when(storeResolver.resolveOptional(isNull(), eq(PILOT_CODE))).thenReturn(PILOT);
    }
}
