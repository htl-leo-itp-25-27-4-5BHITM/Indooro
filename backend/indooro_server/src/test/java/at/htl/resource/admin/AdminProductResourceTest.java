package at.htl.resource.admin;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.ErrorLogService;
import at.htl.model.Product;
import at.htl.service.CatalogStoreResolver;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class AdminProductResourceTest {

    @InjectMock
    OpenSearchService openSearchService;

    @InjectMock
    AdminAccessService adminAccessService;

    @InjectMock
    ErrorLogService errorLogService;

    @InjectMock
    CatalogStoreResolver storeResolver;

    static final UUID STORE_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000001");
    static final String STORE_CODE = "SPAR-Leonding-001";

    private void stubStore() {
        when(storeResolver.require(any(), any())).thenReturn(new ResolvedStore(STORE_ID, STORE_CODE));
    }

    @Test
    void rejectsAnonymousAdminProductAccess() {
        given().when().get("/api/admin/products?page=0").then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsPagedProductSearchAndClampsSizeToMaximum() throws Exception {
        stubStore();
        when(openSearchService.searchAdminProductsPage("pear", 2, 100, "id", null, STORE_ID.toString(), STORE_CODE))
                .thenReturn(new CommonDtos.PageResponse<>(List.of(product(17, "Pear")), 2, 100, 201));

        given()
                .queryParam("page", 2)
                .queryParam("size", 500)
                .queryParam("q", "pear")
                .queryParam("storeCode", STORE_CODE)
                .when().get("/api/admin/products")
                .then()
                .statusCode(200)
                .body("content[0].id", equalTo(17))
                .body("page", equalTo(2))
                .body("size", equalTo(100))
                .body("totalElements", equalTo(201));

        verify(openSearchService).searchAdminProductsPage("pear", 2, 100, "id", null, STORE_ID.toString(), STORE_CODE);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void pagedSearchUsesDefaultsAndClampsNegativePage() throws Exception {
        stubStore();
        when(openSearchService.searchAdminProductsPage(null, 0, 20, "id", null, STORE_ID.toString(), STORE_CODE))
                .thenReturn(new CommonDtos.PageResponse<>(List.of(), 0, 20, 0));

        given()
                .queryParam("page", -9)
                .queryParam("storeCode", STORE_CODE)
                .when().get("/api/admin/products")
                .then()
                .statusCode(200)
                .body("page", equalTo(0))
                .body("size", equalTo(20))
                .body("totalElements", equalTo(0));

        verify(openSearchService).searchAdminProductsPage(null, 0, 20, "id", null, STORE_ID.toString(), STORE_CODE);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void passesSortAndRoutableFilterToPagedSearch() throws Exception {
        stubStore();
        when(openSearchService.searchAdminProductsPage(null, 1, 20, "layoutCode", false, STORE_ID.toString(), STORE_CODE))
                .thenReturn(new CommonDtos.PageResponse<>(List.of(), 1, 20, 0));
        given().queryParam("page", 1).queryParam("sort", "layoutCode").queryParam("routable", false)
                .queryParam("storeCode", STORE_CODE)
                .when().get("/api/admin/products").then().statusCode(200);
        verify(openSearchService).searchAdminProductsPage(null, 1, 20, "layoutCode", false, STORE_ID.toString(), STORE_CODE);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void rejectsUnknownSortValue() {
        stubStore();
        given().queryParam("page", 0).queryParam("sort", "price").queryParam("storeCode", STORE_CODE)
                .when().get("/api/admin/products").then().statusCode(400);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void keepsLegacyArrayResponseForUnpagedCallAndUsesSearchWhenQueryIsProvided() throws Exception {
        stubStore();
        when(openSearchService.searchProducts("pear", 40, STORE_ID.toString(), STORE_CODE)).thenReturn(List.of(product(17, "Pear")));

        given()
                .queryParam("q", "pear")
                .queryParam("size", 40)
                .queryParam("storeCode", STORE_CODE)
                .when().get("/api/admin/products")
                .then()
                .statusCode(200)
                .body("[0].id", equalTo(17));

        verify(openSearchService).searchProducts("pear", 40, STORE_ID.toString(), STORE_CODE);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void storeScopedUpsertReturns409WhileLegacyDocumentsExist() throws Exception {
        stubStore();
        when(openSearchService.countLegacyProducts()).thenReturn(153L);

        given()
                .contentType("application/json")
                .body("{\"id\":17,\"name\":\"Pear\",\"price\":1.0,\"layoutCode\":\"310/1/1/1\",\"storeCode\":\"" + STORE_CODE + "\"}")
                .when().post("/api/admin/products")
                .then()
                .statusCode(409)
                .body("error", equalTo("Legacy products without storeCode still exist (153). "
                        + "Run the catalog migration (docs/pilot-readiness/operations/CATALOG_MIGRATION.md) "
                        + "before writing store-scoped products."));

        verify(openSearchService, never()).indexProduct(any());
    }

    private static Product product(int id, String name) {
        Product product = new Product();
        product.setId(id);
        product.setName(name);
        product.setPrice(1.0);
        product.setLayoutCode("310/1/1/1");
        return product;
    }
}
