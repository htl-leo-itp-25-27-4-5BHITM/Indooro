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

import static io.restassured.RestAssured.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

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
}
