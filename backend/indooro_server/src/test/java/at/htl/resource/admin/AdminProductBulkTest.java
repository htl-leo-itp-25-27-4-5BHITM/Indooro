package at.htl.resource.admin;

import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AuditLogService;
import at.htl.admin.service.ErrorLogService;
import at.htl.service.CatalogBulkResult;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.response.ValidatableResponse;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Role/scope matrix, batch rules, idempotency and audit for POST /api/admin/products/bulk. */
@QuarkusTest
class AdminProductBulkTest {

    private static final UUID PILOT_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000001");
    private static final UUID DEMO_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000002");
    private static final String PILOT_CODE = "SPAR-Leonding-001";
    private static final String DEMO_CODE = "demo-store";
    private static final ResolvedStore PILOT = new ResolvedStore(PILOT_ID, PILOT_CODE);
    private static final ResolvedStore DEMO = new ResolvedStore(DEMO_ID, DEMO_CODE);
    private static final String TWO = "[{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"},"
            + "{\"id\":102,\"name\":\"Pear\",\"price\":1.3,\"layoutCode\":\"310/1/1/2\"}]";
    private static final String ONE = "[{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"}]";
    private static final String ONE_OTHER_NAME = "[{\"id\":101,\"name\":\"Birne\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"}]";

    @InjectMock AdminAccessService access;
    @InjectMock OpenSearchService openSearchService;
    @InjectMock CatalogStoreResolver storeResolver;
    @InjectMock AuditLogService audit;
    @InjectMock ErrorLogService errorLogService;

    @Test
    void anonymousIsRejected() {
        given().contentType("application/json").body(TWO).queryParam("storeCode", PILOT_CODE)
                .when().post("/api/admin/products/bulk").then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminWritesAnyStore() throws IOException {
        stubStores();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(2));

        post(TWO, PILOT_CODE, null).statusCode(200).body("saved", equalTo(2), "failed", equalTo(0));
        verify(access).requireStoreAccess(PILOT_ID);
        verify(openSearchService).indexProducts(argThat(list -> list.size() == 2
                && list.stream().allMatch(p -> PILOT_CODE.equals(p.getStoreCode()) && PILOT_ID.toString().equals(p.getStoreId()))));
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerWritesOwnStore() throws IOException {
        stubStores();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(2));

        post(TWO, PILOT_CODE, null).statusCode(200).body("saved", equalTo(2));
        verify(access).requireStoreAccess(PILOT_ID);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerForeignStoreIsForbiddenAndNothingIsWritten() throws IOException {
        stubStores();
        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(DEMO_ID);

        post(TWO, DEMO_CODE, null).statusCode(403);
        verify(openSearchService, never()).indexProducts(anyList());
        verify(audit, never()).logByAdmin(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @TestSecurity(user = "region", roles = "region-manager")
    void regionManagerOwnRegionAllowedForeignRegionForbidden() throws IOException {
        stubStores();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(2));

        post(TWO, PILOT_CODE, null).statusCode(200);

        doThrow(new ForbiddenException("Kein Zugriff auf diese Region.")).when(access).requireStoreAccess(DEMO_ID);
        post(TWO, DEMO_CODE, null).statusCode(403);
        verify(openSearchService, times(1)).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void missingStoreIsRejectedInGerman() throws IOException {
        stubStores();

        post(TWO, null, null).statusCode(400).body("error", equalTo(CatalogStoreResolver.MISSING_STORE));
        verify(openSearchService, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void unknownStoreIsRejectedInGerman() throws IOException {
        when(storeResolver.require(isNull(), eq("unbekannt")))
                .thenThrow(new CatalogStoreException("Unbekannter Markt."));

        post(TWO, "unbekannt", null).statusCode(400).body("error", equalTo("Unbekannter Markt."));
        verify(openSearchService, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void moreThan500ProductsIsRejectedBeforeWrite() throws IOException {
        stubStores();

        post(productsJson(501), PILOT_CODE, null).statusCode(400)
                .body("error", equalTo("Maximal 500 Produkte pro Anfrage."));
        verify(openSearchService, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void exactly500ProductsAreAccepted() throws IOException {
        stubStores();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(500));

        post(productsJson(500), PILOT_CODE, null).statusCode(200).body("saved", equalTo(500));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void itemFromOtherStoreIsReportedAsFailedRowAndNotWritten() throws IOException {
        stubStores();
        when(openSearchService.indexProducts(anyList())).thenReturn(new CatalogBulkResult("Import requires review", 1, 1, 0, 0,
                List.of(new CatalogBulkResult.Row(1, "101", "saved", null))));
        String body = "[{\"id\":101,\"name\":\"Apple\",\"price\":1.2,\"layoutCode\":\"310/1/1/1\"},"
                + "{\"id\":102,\"name\":\"Pear\",\"price\":1.3,\"layoutCode\":\"310/1/1/2\",\"storeCode\":\"" + DEMO_CODE + "\"}]";

        post(body, PILOT_CODE, null).statusCode(200)
                .body("saved", equalTo(1), "failed", equalTo(1),
                        "rows[0].status", equalTo("saved"), "rows[1].status", equalTo("failed"));
        verify(openSearchService).indexProducts(argThat(list -> list.size() == 1 && "101".equals(String.valueOf(list.get(0).getId()))));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void transportFailureReturns503WithUnknownRowsAndIsNotCached() throws IOException {
        stubStores();
        String key = uniqueKey();
        when(openSearchService.indexProducts(anyList())).thenThrow(new IOException("lost response"))
                .thenReturn(savedResult(2));

        post(TWO, PILOT_CODE, key).statusCode(503)
                .body("saved", equalTo(0), "unknown", equalTo(2), "rows[0].status", equalTo("unknown"));

        // The retry with the same key must really write, not replay the 503.
        post(TWO, PILOT_CODE, key).statusCode(200)
                .header("Idempotent-Replay", org.hamcrest.Matchers.nullValue())
                .body("saved", equalTo(2));
        verify(openSearchService, times(2)).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void sameKeyAndBodyReplaysWithoutSecondWrite() throws IOException {
        stubStores();
        String key = uniqueKey();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(2));

        post(TWO, PILOT_CODE, key).statusCode(200).header("Idempotent-Replay", org.hamcrest.Matchers.nullValue());
        post(TWO, PILOT_CODE, key).statusCode(200)
                .header("Idempotent-Replay", "true")
                .body("saved", equalTo(2), "rows[1].id", equalTo("102"));

        verify(openSearchService, times(1)).indexProducts(anyList());
        verify(audit, times(1)).logByAdmin(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void sameKeyWithOtherBodyIsConflict() throws IOException {
        stubStores();
        String key = uniqueKey();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(2));

        post(TWO, PILOT_CODE, key).statusCode(200);
        post(ONE_OTHER_NAME, PILOT_CODE, key).statusCode(409)
                .body("error", equalTo("Idempotency-Key wurde bereits fuer eine andere Anfrage (anderer Body oder Markt) verwendet."));
        verify(openSearchService, times(1)).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void sameKeyAndBodyForOtherStoreIsConflict() throws IOException {
        stubStores();
        String key = uniqueKey();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(2));

        post(TWO, PILOT_CODE, key).statusCode(200);
        post(TWO, DEMO_CODE, key).statusCode(409);
        verify(openSearchService, times(1)).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void invalidIdempotencyKeyIsRejected() throws IOException {
        stubStores();

        post(TWO, PILOT_CODE, "bad key!").statusCode(400);
        post(TWO, PILOT_CODE, "x".repeat(101)).statusCode(400);
        post(TWO, PILOT_CODE, "").statusCode(400);
        verify(openSearchService, never()).indexProducts(anyList());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void successfulBatchWritesOneAuditEntry() throws IOException {
        stubStores();
        String key = uniqueKey();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(1));

        post(ONE, PILOT_CODE, key).statusCode(200);
        verify(audit, times(1)).logByAdmin(any(), eq("PRODUCT_CATALOG"), eq(PILOT_ID), eq("BULK_IMPORT"),
                eq("1 gespeichert, 0 fehlgeschlagen"), isNull(), argThat(after -> after != null
                        && after.toString().contains(PILOT_CODE) && after.toString().contains(key)));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void auditFailureDoesNotChangeTheResponse() throws IOException {
        stubStores();
        when(openSearchService.indexProducts(anyList())).thenReturn(savedResult(2));
        doThrow(new RuntimeException("audit store down")).when(audit)
                .logByAdmin(any(), any(), any(), any(), any(), any(), any());

        post(TWO, PILOT_CODE, null).statusCode(200).body("saved", equalTo(2));
    }

    private ValidatableResponse post(String body, String storeCode, String idempotencyKey) {
        var request = given().contentType("application/json").body(body);
        if (storeCode != null) {
            request = request.queryParam("storeCode", storeCode);
        }
        if (idempotencyKey != null) {
            request = request.header("Idempotency-Key", idempotencyKey);
        }
        return request.when().post("/api/admin/products/bulk").then();
    }

    private static String uniqueKey() {
        return "test-" + UUID.randomUUID();
    }

    private static String productsJson(int count) {
        List<String> items = new ArrayList<>(count);
        for (int id = 1; id <= count; id++) {
            items.add("{\"id\":" + id + ",\"name\":\"Ware " + id + "\",\"price\":1.0,\"layoutCode\":\"310/1/1/1\"}");
        }
        return "[" + String.join(",", items) + "]";
    }

    private static CatalogBulkResult savedResult(int count) {
        List<CatalogBulkResult.Row> rows = new ArrayList<>(count);
        for (int i = 1; i <= count; i++) {
            rows.add(new CatalogBulkResult.Row(i, String.valueOf(i), "saved", null));
        }
        return new CatalogBulkResult("All rows indexed", count, count, 0, 0, rows);
    }

    private void stubStores() throws IOException {
        when(storeResolver.require(isNull(), eq(PILOT_CODE))).thenReturn(PILOT);
        when(storeResolver.require(isNull(), eq(DEMO_CODE))).thenReturn(DEMO);
        when(storeResolver.require(isNull(), isNull()))
                .thenThrow(new CatalogStoreException(CatalogStoreResolver.MISSING_STORE));
        when(storeResolver.resolveOptional(isNull(), eq(DEMO_CODE))).thenReturn(DEMO);
    }
}
