package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.model.Category;
import at.htl.service.CategoryService;
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
        given().contentType("application/json")
                .body("{\"categoryCode\":310,\"categoryName\":\"Obst\"}")
                .post("/api/categories").then().statusCode(200)
                .body("categoryName", equalTo("Obst"));
        verify(access).requireAdmin();
        verify(categories).bulkInsert(anyList());
    }
}
