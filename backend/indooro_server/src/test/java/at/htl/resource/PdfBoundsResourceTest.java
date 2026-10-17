package at.htl.resource;

import at.htl.admin.service.AdminAccessService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.notNullValue;

@QuarkusTest
@TestSecurity(user = "admin", roles = "admin")
class PdfBoundsResourceTest {

    @InjectMock
    AdminAccessService adminAccessService;

    @Test
    void oversizedLayoutCodeIsRejectedWithJsonError() {
        given().contentType("application/json")
                .body("[{\"id\":1,\"name\":\"x\",\"layoutCode\":\"1/1/2000000000/1\"}]")
                .post("/api/export/pdf")
                .then()
                .statusCode(400)
                .contentType(containsString("application/json"))
                .body("error", notNullValue())
                .body("error", containsString("Level"));
    }

    @Test
    void validRequestReturnsPdf() {
        given().contentType("application/json")
                .body("[{\"id\":1,\"name\":\"Apfel 🍎\",\"layoutCode\":\"310/1/1/1\"}]")
                .post("/api/export/pdf")
                .then()
                .statusCode(200)
                .contentType(containsString("application/pdf"));
    }
}
