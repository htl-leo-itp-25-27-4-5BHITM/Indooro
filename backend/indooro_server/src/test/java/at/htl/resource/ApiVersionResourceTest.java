package at.htl.resource;

import at.htl.admin.dto.MobileDtos.MobileStoreSummary;
import at.htl.admin.service.MobileStoreService;
import at.htl.service.OpenSearchService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

@QuarkusTest
@TestProfile(ApiVersionResourceTest.AuthenticatedAdminPaths.class)
class ApiVersionResourceTest {

    public static class AuthenticatedAdminPaths implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of("quarkus.http.auth.permission.admin.policy", "authenticated",
                    "indooro.api.deprecation.since", "2026-01-01",
                    "indooro.api.deprecation.sunset", "2026-07-01");
        }
    }

    @InjectMock
    MobileStoreService mobileStoreService;

    @InjectMock
    OpenSearchService openSearchService;

    @Test
    void bothPublicStorePathsReturnTheSameNonEmptyResponse() {
        when(mobileStoreService.listStores()).thenReturn(List.of(new MobileStoreSummary(
                UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"),
                "demo-store", "Demo", "Leonding", null, null, null)));

        var unversioned = given().get("/api/mobile/stores").then()
                .statusCode(200).header("Indooro-Api-Version", "1")
                .body("[0].storeCode", equalTo("demo-store")).extract();
        given().get("/api/v1/mobile/stores").then()
                .statusCode(200).header("Indooro-Api-Version", "1")
                .contentType(unversioned.contentType())
                .body(equalTo(unversioned.asString()));
    }

    @Test
    void versionedSearchPreservesEncodedQueryParameters() throws Exception {
        when(openSearchService.searchProducts("Käse + Brot", 7, null, null)).thenReturn(List.of());

        given().queryParam("q", "Käse + Brot").queryParam("size", 7)
                .get("/api/v1/products/search").then()
                .statusCode(200).body(equalTo("[]"));
    }

    @Test
    void productSearchWithoutQueryUsesTheSharedErrorEnvelope() {
        for (String path : List.of("/api/products/search", "/api/v1/products/search")) {
            given().get(path).then()
                    .statusCode(400).contentType("application/json")
                    .header("Indooro-Api-Version", "1")
                    .body("status", equalTo(400), "error", equalTo("Query parameter 'q' is required"),
                            "method", equalTo("GET"), "timestamp", notNullValue());
        }
    }

    @Test
    void bothProtectedStorePathsChallengeAnonymousCallers() {
        assertProtectedStoreResponses(401);
    }

    @Test
    @TestSecurity(user = "customer", roles = "customer")
    void bothProtectedStorePathsRejectAnUnprivilegedRole() {
        assertProtectedStoreResponses(403);
    }

    private static void assertProtectedStoreResponses(int status) {
        var unversioned = given().get("/api/stores").then()
                .statusCode(status).header("Indooro-Api-Version", "1").extract();
        var versioned = given().get("/api/v1/stores").then()
                .statusCode(status).header("Indooro-Api-Version", "1").extract();
        assertEquals(unversioned.header("WWW-Authenticate"), versioned.header("WWW-Authenticate"));
        assertEquals(unversioned.asString(), versioned.asString());
    }

    @ParameterizedTest
    @CsvSource({
            "/mobile/upsell/suggestions, /mobile/upsell/plan, 400",
            "/products, /admin/products, 401",
            "/products/bulk, /admin/products/bulk, 401",
            "/layout/current, /stores/%7BstoreId%7D/layout/versions, 401"
    })
    void onlyDeprecatedPostsCarryConfiguredSuccessorHeaders(String path, String successor, int status) {
        for (String prefix : List.of("/api", "/api/v1")) {
            given().contentType("application/json").body("{}").post(prefix + path).then()
                    .statusCode(status)
                    .header("Deprecation", "@1767225600")
                    .header("Sunset", "Wed, 01 Jul 2026 00:00:00 GMT")
                    .header("Link", "</api/v1" + successor + ">; rel=\"successor-version\"");
            given().get(prefix + path).then()
                    .header("Deprecation", nullValue())
                    .header("Sunset", nullValue())
                    .header("Link", nullValue());
        }
    }
}
