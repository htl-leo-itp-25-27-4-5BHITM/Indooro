package at.htl.resource;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
class SecurityHeadersTest {

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void sendsSecurityHeadersOnPublicAndAdminPages() {
        for (String path : new String[] {"/", "/customer/", "/admin/"}) {
            given().when().get(path).then()
                    .statusCode(200)
                    .header("Content-Security-Policy", containsString("script-src 'self'"))
                    .header("Content-Security-Policy", containsString("frame-ancestors 'none'"))
                    .header("X-Content-Type-Options", equalTo("nosniff"))
                    .header("Referrer-Policy", equalTo("same-origin"));
        }
    }
}
