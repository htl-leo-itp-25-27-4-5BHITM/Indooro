package at.htl.resource.mobile;

import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.UpsellSuggestionService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;

@QuarkusTest
@TestProfile(MobileRateLimitResourceTest.TightLimits.class)
class MobileRateLimitResourceTest {

    private static final String EVENT_BODY = "{\"eventType\":\"dismissed\",\"checkedProductId\":1,\"suggestedProductId\":2}";

    @InjectMock
    UpsellSuggestionService upsellSuggestionService;

    @InjectMock
    AdminAccessService adminAccessService;

    @Test
    void returnsTooManyRequestsWithRetryAfterAndJsonError() {
        doNothing().when(upsellSuggestionService).recordEvent(any());

        postEvent("198.51.100.10").statusCode(202);
        postEvent("198.51.100.10").statusCode(202);

        postEvent("198.51.100.10")
                .statusCode(429)
                .contentType(containsString("application/json"))
                .header("Retry-After", notNullValue())
                .body("status", equalTo(429))
                .body("error", containsString("Zu viele Anfragen"))
                .body("path", containsString("/api/mobile/upsell/events"));
    }

    @Test
    void limitsAreIsolatedPerForwardedClient() {
        doNothing().when(upsellSuggestionService).recordEvent(any());

        postEvent("198.51.100.20").statusCode(202);
        postEvent("198.51.100.20").statusCode(202);
        postEvent("198.51.100.20").statusCode(429);

        postEvent("198.51.100.21").statusCode(202);
    }

    @Test
    void firstForwardedHopIsUsedAsClientKey() {
        doNothing().when(upsellSuggestionService).recordEvent(any());

        given()
                .contentType("application/json")
                .header("X-Forwarded-For", "198.51.100.30, 10.0.0.1")
                .body(EVENT_BODY)
                .post("/api/mobile/upsell/events")
                .then().statusCode(202);
        given()
                .contentType("application/json")
                .header("X-Forwarded-For", "198.51.100.30, 10.9.9.9")
                .body(EVENT_BODY)
                .post("/api/mobile/upsell/events")
                .then().statusCode(202);
        given()
                .contentType("application/json")
                .header("X-Forwarded-For", "198.51.100.30")
                .body(EVENT_BODY)
                .post("/api/mobile/upsell/events")
                .then().statusCode(429);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void exportIsLimitedToOnePerMinuteInThisProfile() {
        String pdfBody = "[{\"id\":1,\"name\":\"Apfel\",\"layoutCode\":\"310/1/1/1\"}]";

        given().contentType("application/json").header("X-Forwarded-For", "198.51.100.40")
                .body(pdfBody).post("/api/export/pdf")
                .then().statusCode(200);
        given().contentType("application/json").header("X-Forwarded-For", "198.51.100.40")
                .body(pdfBody).post("/api/export/pdf")
                .then().statusCode(429)
                .header("Retry-After", notNullValue());
    }

    /** Sehr kleine Limits nur für diese Klasse; die Default-Test-Limits bleiben für alle anderen Klassen hoch. */
    public static class TightLimits implements QuarkusTestProfile {

        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "indooro.ratelimit.upsell-event.max-requests", "2",
                    "indooro.ratelimit.upsell-event.window-seconds", "600",
                    "indooro.ratelimit.heavy.max-requests", "1",
                    "indooro.ratelimit.heavy.window-seconds", "60"
            );
        }
    }

    private io.restassured.response.ValidatableResponse postEvent(String forwardedFor) {
        return given()
                .contentType("application/json")
                .header("X-Forwarded-For", forwardedFor)
                .body(EVENT_BODY)
                .post("/api/mobile/upsell/events")
                .then();
    }
}
