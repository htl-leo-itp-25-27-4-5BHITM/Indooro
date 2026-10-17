package at.htl.resource.admin;

import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.ErrorLogService;
import at.htl.model.Product;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Role and store-scope matrix for /api/admin/products (anonymous, admin, region-manager, store-manager). */
@QuarkusTest
class AdminProductStoreScopeTest {

    private static final UUID PILOT_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000001");
    private static final UUID DEMO_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000002");
    private static final String PILOT_CODE = "SPAR-Leonding-001";
    private static final String DEMO_CODE = "demo-store";
    private static final String PRODUCT_JSON_DEMO = "{\"id\":101,\"name\":\"Backpulver\",\"price\":0.89,"
            + "\"layoutCode\":\"310/1/1/1\",\"storeCode\":\"" + DEMO_CODE + "\"}";
    private static final String PRODUCT_JSON_PILOT = "{\"id\":101,\"name\":\"Backpulver\",\"price\":0.89,"
            + "\"layoutCode\":\"310/1/1/1\",\"storeCode\":\"" + PILOT_CODE + "\"}";

    @InjectMock AdminAccessService access;
    @InjectMock OpenSearchService openSearchService;
    @InjectMock CatalogStoreResolver storeResolver;
    @InjectMock ErrorLogService errorLogService;

    @Test
    void anonymousIsRejectedForListWriteAndDelete() {
        given().queryParam("storeCode", PILOT_CODE).when().get("/api/admin/products").then().statusCode(401);
        given().contentType("application/json").body(PRODUCT_JSON_PILOT).when().post("/api/admin/products").then().statusCode(401);
        given().queryParam("storeCode", PILOT_CODE).when().delete("/api/admin/products/101").then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminListsAnyStore() throws Exception {
        stubStores();
        when(openSearchService.searchAdminProductsPage(null, 0, 20, "id", null, DEMO_ID.toString(), DEMO_CODE))
                .thenReturn(new at.htl.admin.dto.CommonDtos.PageResponse<>(List.of(), 0, 20, 0));

        given().queryParam("page", 0).queryParam("storeCode", DEMO_CODE)
                .when().get("/api/admin/products").then().statusCode(200);

        verify(access).requireStoreAccess(DEMO_ID);
        verify(openSearchService).searchAdminProductsPage(null, 0, 20, "id", null, DEMO_ID.toString(), DEMO_CODE);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerListsOwnStore() throws Exception {
        stubStores();
        given().queryParam("page", 0).queryParam("storeCode", PILOT_CODE)
                .when().get("/api/admin/products").then().statusCode(200);
        verify(access).requireStoreAccess(PILOT_ID);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerListingForeignStoreIsForbidden() throws Exception {
        stubStores();
        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(DEMO_ID);

        given().queryParam("page", 0).queryParam("storeCode", DEMO_CODE)
                .when().get("/api/admin/products").then().statusCode(403);
        verify(openSearchService, never()).searchAdminProductsPage(any(), anyInt(), anyInt(), any(), any(), any(), any());
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerUpdatingDemoProductIsForbidden() throws Exception {
        // Szenario S2: store manager of the pilot store updates a product of the demo store.
        stubStores();
        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(DEMO_ID);

        given().contentType("application/json").body(PRODUCT_JSON_DEMO)
                .when().post("/api/admin/products").then().statusCode(403);
        verify(openSearchService, never()).indexProduct(any(Product.class));
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerWritesOwnStoreWithDatabaseScope() throws Exception {
        stubStores();

        given().contentType("application/json").body(PRODUCT_JSON_PILOT)
                .when().post("/api/admin/products").then().statusCode(200)
                .body("storeCode", equalTo(PILOT_CODE));
        verify(openSearchService).indexProduct(org.mockito.ArgumentMatchers.argThat(product ->
                PILOT_ID.toString().equals(product.getStoreId()) && PILOT_CODE.equals(product.getStoreCode())));
    }

    @Test
    @TestSecurity(user = "region", roles = "region-manager")
    void regionManagerOwnRegionAllowedForeignRegionForbidden() throws Exception {
        stubStores();
        given().queryParam("page", 0).queryParam("storeCode", PILOT_CODE)
                .when().get("/api/admin/products").then().statusCode(200);

        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(DEMO_ID);
        given().queryParam("page", 0).queryParam("storeCode", DEMO_CODE)
                .when().get("/api/admin/products").then().statusCode(403);
        given().contentType("application/json").body(PRODUCT_JSON_DEMO)
                .when().post("/api/admin/products").then().statusCode(403);
        verify(openSearchService, never()).indexProduct(any(Product.class));
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void listWithoutStoreIsRejectedInGerman() throws Exception {
        stubStores();
        given().queryParam("page", 0)
                .when().get("/api/admin/products").then().statusCode(400)
                .body("error", equalTo(CatalogStoreResolver.MISSING_STORE));
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void deleteWithinOwnStoreRemovesStoreScopedDocument() throws Exception {
        stubStores();
        when(openSearchService.deleteProduct(101, PILOT_CODE)).thenReturn(true);

        given().queryParam("storeCode", PILOT_CODE)
                .when().delete("/api/admin/products/101").then().statusCode(204);
        verify(openSearchService).deleteProduct(101, PILOT_CODE);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void deleteForeignStoreProductIsForbiddenAndNothingIsDeleted() throws Exception {
        stubStores();
        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(DEMO_ID);

        given().queryParam("storeCode", DEMO_CODE)
                .when().delete("/api/admin/products/101").then().statusCode(403);
        verify(openSearchService, never()).deleteProduct(any(Integer.class), any());
    }

    private void stubStores() throws Exception {
        when(openSearchService.searchAdminProductsPage(any(), anyInt(), anyInt(), any(), any(), any(), any()))
                .thenReturn(new at.htl.admin.dto.CommonDtos.PageResponse<>(List.of(), 0, 20, 0));
        when(storeResolver.require(isNull(), eq(PILOT_CODE))).thenReturn(new ResolvedStore(PILOT_ID, PILOT_CODE));
        when(storeResolver.require(isNull(), eq(DEMO_CODE))).thenReturn(new ResolvedStore(DEMO_ID, DEMO_CODE));
        when(storeResolver.require(isNull(), isNull()))
                .thenThrow(new CatalogStoreResolver.CatalogStoreException(CatalogStoreResolver.MISSING_STORE));
    }
}
