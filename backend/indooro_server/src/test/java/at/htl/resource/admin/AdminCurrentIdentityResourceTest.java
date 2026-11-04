package at.htl.resource.admin;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

/**
 * /api/admin/me/identity answers every signed-in user from the token, also without a role or access
 * assignment, so the forbidden page can show the Keycloak subject an admin needs.
 */
@QuarkusTest
class AdminCurrentIdentityResourceTest {

    @Test
    void anonymousIsUnauthorized() {
        given().get("/api/admin/me/identity").then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "4f1c2d3e-0000-4000-8000-000000000042")
    void signedInUserWithoutRoleSeesOwnSubject() {
        given().get("/api/admin/me/identity").then().statusCode(200)
                .body("subject", equalTo("4f1c2d3e-0000-4000-8000-000000000042"))
                .body("username", equalTo("4f1c2d3e-0000-4000-8000-000000000042"));
    }

    @Test
    @TestSecurity(user = "4f1c2d3e-0000-4000-8000-000000000042")
    void signedInUserWithoutRoleIsStillForbiddenOnMe() {
        given().get("/api/admin/me").then().statusCode(403);
    }
}
