package at.htl.resource;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;

@QuarkusTest
class CorsPolicyTest {

    @Test
    void allowedDevOriginReceivesCorsHeader() {
        given()
                .header("Origin", "http://localhost:5173")
                .header("Access-Control-Request-Method", "GET")
                .when().options("/api/categories")
                .then()
                .header("Access-Control-Allow-Origin", equalTo("http://localhost:5173"));
    }

    @Test
    void unknownOriginReceivesNoCorsHeader() {
        given()
                .header("Origin", "https://evil.example")
                .header("Access-Control-Request-Method", "GET")
                .when().options("/api/categories")
                .then()
                .header("Access-Control-Allow-Origin", nullValue());
    }
}
