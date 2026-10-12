package at.htl.resource.admin;

import at.htl.admin.dto.CommonDtos;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.ErrorLogService;
import at.htl.model.Product;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;

@QuarkusTest
class AdminProductResourceTest {

    @InjectMock
    OpenSearchService openSearchService;

    @InjectMock
    AdminAccessService adminAccessService;

    @InjectMock
    ErrorLogService errorLogService;

    @Test
    void rejectsAnonymousAdminProductAccess() {
        given().when().get("/api/admin/products?page=0").then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void returnsPagedProductSearchAndClampsSizeToMaximum() throws Exception {
        doNothing().when(adminAccessService).requireAdmin();
        when(openSearchService.searchAdminProductsPage("pear", 2, 100))
                .thenReturn(new CommonDtos.PageResponse<>(List.of(product(17, "Pear")), 2, 100, 201));

        given()
                .queryParam("page", 2)
                .queryParam("size", 500)
                .queryParam("q", "pear")
                .when().get("/api/admin/products")
                .then()
                .statusCode(200)
                .body("content[0].id", equalTo(17))
                .body("page", equalTo(2))
                .body("size", equalTo(100))
                .body("totalElements", equalTo(201));

        verify(openSearchService).searchAdminProductsPage("pear", 2, 100);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void pagedSearchUsesDefaultsAndClampsNegativePage() throws Exception {
        doNothing().when(adminAccessService).requireAdmin();
        when(openSearchService.searchAdminProductsPage(null, 0, 20))
                .thenReturn(new CommonDtos.PageResponse<>(List.of(), 0, 20, 0));

        given()
                .queryParam("page", -9)
                .when().get("/api/admin/products")
                .then()
                .statusCode(200)
                .body("page", equalTo(0))
                .body("size", equalTo(20))
                .body("totalElements", equalTo(0));

        verify(openSearchService).searchAdminProductsPage(null, 0, 20);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void keepsLegacyArrayResponseForUnpagedCallAndUsesSearchWhenQueryIsProvided() throws Exception {
        doNothing().when(adminAccessService).requireAdmin();
        when(openSearchService.searchProducts("pear", 40)).thenReturn(List.of(product(17, "Pear")));

        given()
                .queryParam("q", "pear")
                .queryParam("size", 40)
                .when().get("/api/admin/products")
                .then()
                .statusCode(200)
                .body("[0].id", equalTo(17));

        verify(openSearchService).searchProducts("pear", 40);
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
