package at.htl.config;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.hasItem;

/** Health endpoints are reachable anonymously. The test profile does not prepare OpenSearch, so readiness is DOWN. */
@QuarkusTest
class HealthEndpointTest {

    @Test
    void livenessIsAnonymouslyUp() {
        given().get("/q/health/live").then().statusCode(200);
    }

    @Test
    void readinessIsAnonymouslyReachableAndReportsOpenSearchIndices() {
        given().get("/q/health/ready").then()
                .statusCode(503)
                .body("checks.name", hasItem("opensearch-indices"));
    }
}
