package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import at.htl.service.LayoutService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class LayoutResourceTest {

    @InjectMock
    LayoutService layoutService;

    @InjectMock
    AdminAccessService adminAccessService;

    @Test
    void anonymousUserCanReadCurrentLayout() throws IOException {
        when(layoutService.getCurrentLayout()).thenReturn(new ObjectMapper().readTree("{\"shopName\":\"Indooro\"}"));

        given()
                .when().get("/api/layout/current")
                .then()
                .statusCode(200)
                .body("shopName", equalTo("Indooro"));
    }

    @Test
    void anonymousUserCanReadLayoutHistory() throws IOException {
        when(layoutService.getRecentLayouts(5)).thenReturn(List.of(
                new LayoutService.LayoutHistoryEntry("layout-1", "Indooro", "2026-10-11T00:00:00Z", "2026-10-11T00:00:00Z", 1)
        ));

        given()
                .queryParam("limit", 5)
                .when().get("/api/layout/history")
                .then()
                .statusCode(200)
                .body("[0].layoutId", equalTo("layout-1"));
    }

    @Test
    void anonymousUserCanReadLayoutVersion() throws IOException {
        when(layoutService.getLayoutVersion("layout-1"))
                .thenReturn(new ObjectMapper().readTree("{\"layoutId\":\"layout-1\"}"));

        given()
                .when().get("/api/layout/versions/layout-1")
                .then()
                .statusCode(200)
                .body("layoutId", equalTo("layout-1"));
    }

    @Test
    void anonymousUserCannotSaveCurrentLayout() throws IOException {
        given()
                .contentType("application/json")
                .body("{\"shopName\":\"Injected\",\"elements\":[]}")
                .when().post("/api/layout/current")
                .then()
                .statusCode(401);

        verify(layoutService, never()).saveCurrentLayout(any());
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCannotSaveCurrentLayout() throws IOException {
        given()
                .contentType("application/json")
                .body("{\"shopName\":\"Injected\",\"elements\":[]}")
                .when().post("/api/layout/current")
                .then()
                .statusCode(403);

        verify(layoutService, never()).saveCurrentLayout(any());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminCanSaveCurrentLayout() throws IOException {
        when(layoutService.saveCurrentLayout(any())).thenReturn(
                new LayoutService.LayoutHistoryEntry("layout-1", "Indooro", "2026-10-11T00:00:00Z", "2026-10-11T00:00:00Z", 0)
        );

        given()
                .contentType("application/json")
                .body("{\"shopName\":\"Indooro\",\"elements\":[]}")
                .when().post("/api/layout/current")
                .then()
                .statusCode(200)
                .body("layoutId", equalTo("layout-1"));

        verify(adminAccessService).requireAdmin();
        verify(layoutService).saveCurrentLayout(any());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void malformedJsonNeverReachesLegacyLayoutService() throws IOException {
        given()
                .contentType("application/json")
                .body("{\"gridSize\":")
                .when().post("/api/layout/current")
                .then()
                .statusCode(400);

        verify(layoutService, never()).saveCurrentLayout(any());
    }
}
