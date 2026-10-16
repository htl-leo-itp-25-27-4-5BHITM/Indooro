package at.htl.resource.admin;

import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.AdminRole;
import at.htl.admin.service.CurrentAdminUser;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.inject.Inject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.util.Base64;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.when;

/** Run explicitly against an isolated PostgreSQL database with Flyway enabled. */
@QuarkusTest
class UnderlayPostgresIT {
    private static final UUID REGION = UUID.fromString("71717171-7171-7171-7171-717171717171");
    private static final UUID STORE = UUID.fromString("72727272-7272-7272-7272-727272727272");

    @Inject DataSource dataSource;
    @InjectMock AdminAccessService access;

    @BeforeEach
    void seedStore() throws Exception {
        when(access.currentUser()).thenReturn(new CurrentAdminUser("local-underlay-test", "test", null, AdminRole.ADMIN, null));
        try (Connection connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            statement.executeUpdate("INSERT INTO regions (id, code, name, status, created_at, updated_at) VALUES ('" + REGION + "', 'underlay-test', 'Underlay Test', 'ACTIVE', now(), now())");
            statement.executeUpdate("INSERT INTO stores (id, region_id, store_code, name, street, zip_code, city, country, status, created_at, updated_at) VALUES ('" + STORE + "', '" + REGION + "', 'underlay-store', 'Underlay Store', 'Testgasse 1', '4020', 'Linz', 'AT', 'ACTIVE', now(), now())");
        }
    }

    @AfterEach
    void clearStore() throws Exception {
        try (Connection connection = dataSource.getConnection(); var statement = connection.createStatement()) {
            statement.executeUpdate("DELETE FROM layout_underlays WHERE store_id = '" + STORE + "'");
            statement.executeUpdate("DELETE FROM audit_logs WHERE entity_id = '" + STORE + "'");
            statement.executeUpdate("DELETE FROM stores WHERE id = '" + STORE + "'");
            statement.executeUpdate("DELETE FROM regions WHERE id = '" + REGION + "'");
        }
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void uploadRoundTripsThroughByteaAndCalibration() throws Exception {
        byte[] image = Files.readAllBytes(Path.of("..", "..", "admin-ui", "tests", "fixtures", "underlay-grid.png"));
        String base64 = Base64.getEncoder().encodeToString(image);
        String path = "/api/stores/" + STORE + "/layout/underlay";
        given().contentType("application/json")
                .body("{\"contentType\":\"image/png\",\"imageBase64\":\"" + base64 + "\",\"scaleMPerPx\":0.1,\"opacity\":0.6}")
                .put(path).then().statusCode(200).body("widthPx", equalTo(100), "heightPx", equalTo(60));
        given().get(path).then().statusCode(200).body("imageBase64", equalTo(base64));
        String mobile = given().get("/api/mobile/stores/" + STORE + "/layout/current")
                .then().statusCode(200).extract().asString();
        assertFalse(mobile.contains("imageBase64"));
        assertFalse(mobile.contains(base64));
        try (Connection connection = dataSource.getConnection(); var statement = connection.createStatement();
             var rows = statement.executeQuery("SELECT octet_length(bytes), scale_m_per_px FROM layout_underlays WHERE store_id = '" + STORE + "'")) {
            rows.next();
            assertEquals(image.length, rows.getInt(1));
            assertEquals(0, rows.getBigDecimal(2).compareTo(new java.math.BigDecimal("0.1")));
        }
        try (Connection connection = dataSource.getConnection(); var statement = connection.createStatement();
             var rows = statement.executeQuery("SELECT after_json::text FROM audit_logs WHERE entity_id = '" + STORE + "' AND action = 'CREATE'")) {
            rows.next();
            assertFalse(rows.getString(1).contains(base64));
        }
        given().delete(path).then().statusCode(204);
        given().get(path).then().statusCode(404);
    }
}
