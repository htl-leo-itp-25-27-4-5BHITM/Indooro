package at.htl.openapi;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;

import static io.restassured.RestAssured.given;

/**
 * Writes the generated OpenAPI document of the test profile to target/openapi/openapi.json.
 * Run by scripts/contract/export-generated.mjs; the contract parity check reads that file.
 */
@QuarkusTest
class OpenApiExportTest {

    @Test
    void exportGeneratedOpenApiDocument() throws Exception {
        String document = given()
                .accept("application/json")
                .when().get("/q/openapi?format=json")
                .then().statusCode(200)
                .extract().asString();

        Path target = Path.of("target", "openapi", "openapi.json");
        Files.createDirectories(target.getParent());
        Files.writeString(target, document);
    }
}
