package at.htl.resource;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * The pilot showcase is a static bundle that CI builds into META-INF/resources/showcase/
 * (npm run package:backend in pilot-showcase). Without that bundle the test is skipped,
 * so a plain local "mvn test" still works.
 */
@QuarkusTest
class ShowcaseStaticResourceTest {

    private static boolean bundlePresent() {
        return ShowcaseStaticResourceTest.class.getResource("/META-INF/resources/showcase/index.html") != null;
    }

    @Test
    void servesShowcaseWithoutLoginAndWithSecurityHeaders() {
        assumeTrue(bundlePresent(), "pilot showcase bundle not built");
        given().redirects().follow(false).when().get("/showcase/").then()
                .statusCode(200)
                .contentType(containsString("text/html"))
                .body(containsString("./assets/index-"))
                .header("Content-Security-Policy", containsString("script-src 'self'"))
                .header("X-Content-Type-Options", "nosniff");
    }

    @Test
    void overviewPageLinksToShowcase() {
        given().when().get("/").then()
                .statusCode(200)
                .body(containsString("href=\"/showcase/\""));
    }
}
