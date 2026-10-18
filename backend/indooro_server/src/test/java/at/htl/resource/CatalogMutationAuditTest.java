package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AuditLogService;
import at.htl.admin.util.AuditEntityIds;
import at.htl.model.Category;
import at.htl.service.CategoryService;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CatalogStoreResolver;
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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Audit-Eintraege fuer Produkt- und Kategorie-Schreibvorgaenge (Akteur wird ueber logByAdmin uebergeben). */
@QuarkusTest
class CatalogMutationAuditTest {

    private static final String STORE_CODE = "SPAR-Leonding-001";
    private static final ResolvedStore STORE = new ResolvedStore(UUID.fromString("6f1c2a5e-0000-4000-8000-000000000001"), STORE_CODE);
    private static final String PRODUCT = "{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"}";

    @InjectMock AuditLogService audit;
    @InjectMock OpenSearchService products;
    @InjectMock CatalogStoreResolver storeResolver;
    @InjectMock CategoryService categories;
    @InjectMock AdminAccessService access;

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void singleProductUpsertIsAuditedAsProductEntry() {
        when(storeResolver.require(any(), eq(STORE_CODE))).thenReturn(STORE);

        given().contentType("application/json").body(PRODUCT.replace("}", ",\"storeCode\":\"" + STORE_CODE + "\"}"))
                .post("/api/products").then().statusCode(200);

        verify(audit).logByAdmin(any(), eq("PRODUCT"), eq(AuditEntityIds.product(101)), eq("UPSERT"), anyString(), isNull(), any());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void legacyProductBulkIsAuditedOnceWithCountsOnly() throws IOException {
        when(storeResolver.resolveOptional(isNull(), eq(STORE_CODE))).thenReturn(STORE);
        when(products.indexProducts(anyList())).thenReturn(new CatalogBulkResult("Import requires review", 2, 2, 0, 0,
                List.of(new CatalogBulkResult.Row(1, "101", "saved", null),
                        new CatalogBulkResult.Row(2, "102", "saved", null))));
        String body = "[" + PRODUCT + ",{\"id\":102,\"name\":\"Pear\",\"price\":1.3,\"layoutCode\":\"310/1/1/2\"}]";

        given().contentType("application/json").body(body).queryParam("storeCode", STORE_CODE)
                .post("/api/products/bulk").then().statusCode(200);

        verify(audit).logByAdmin(any(), eq("PRODUCT"), eq(AuditEntityIds.productBulk(STORE_CODE)), eq("BULK_UPSERT"),
                anyString(), isNull(), argThatCounts(2, 2));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminProductDeleteIsAuditedAsProductEntry() throws IOException {
        when(storeResolver.require(any(), any())).thenReturn(STORE);
        when(products.deleteProduct(101, STORE_CODE)).thenReturn(true);

        given().queryParam("storeCode", STORE_CODE)
                .delete("/api/admin/products/101").then().statusCode(204);

        verify(audit).logByAdmin(any(), eq("PRODUCT"), eq(AuditEntityIds.product(101)), eq("DELETE"), anyString(), any(), isNull());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void categoryCreateIsAuditedAsCategoryEntry() throws IOException {
        when(categories.create(any(Category.class))).thenAnswer(invocation -> invocation.getArgument(0));

        given().contentType("application/json").body("{\"categoryCode\":310,\"categoryName\":\"Obst\"}")
                .queryParam("createOnly", true)
                .post("/api/categories").then().statusCode(200)
                .body("categoryName", equalTo("Obst"));

        verify(audit).logByAdmin(any(), eq("CATEGORY"), eq(AuditEntityIds.category(310)), eq("CREATE"), anyString(), isNull(), any());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void categoryBulkIsAuditedOnceWithCounts() throws IOException {
        when(categories.bulkInsert(anyList())).thenReturn(new CatalogBulkResult("All rows indexed", 1, 1, 0, 0,
                List.of(new CatalogBulkResult.Row(1, "310", "saved", null))));

        given().contentType("application/json").body("[{\"categoryCode\":310,\"categoryName\":\"Obst\"}]")
                .post("/api/categories/bulk").then().statusCode(200);

        verify(audit).logByAdmin(any(), eq("CATEGORY"), eq(AuditEntityIds.categoryBulk()), eq("BULK_UPSERT"),
                anyString(), isNull(), argThatCounts(1, 1));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void auditFailureDoesNotChangeTheProductWriteResponse() {
        when(storeResolver.require(any(), eq(STORE_CODE))).thenReturn(STORE);
        doThrow(new RuntimeException("audit store down"))
                .when(audit).logByAdmin(any(), any(), any(), any(), any(), any(), any());

        given().contentType("application/json").body(PRODUCT.replace("}", ",\"storeCode\":\"" + STORE_CODE + "\"}"))
                .post("/api/products").then().statusCode(200);
    }

    /** Bulk-Eintraege enthalten nur Zaehler, keine Produkt-Payloads. */
    private static Object argThatCounts(int saved, int count) {
        return org.mockito.ArgumentMatchers.argThat((Object after) -> after instanceof java.util.Map<?, ?> map
                && map.containsKey("count") && map.get("count").equals(count)
                && map.get("saved").equals(saved)
                && !map.containsKey("rows"));
    }
}
