package at.htl.resource;

import at.htl.admin.service.ErrorLogService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

@QuarkusTest
class ErrorPolicyResourceTest {

    private static final String UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

    @InjectMock
    ErrorLogService errorLogService;

    @Test
    void anonymousClientErrorIsHandedToPolicyAsNotAuthenticated() {
        given().when().get("/api/test-error-probe/status/404")
                .then()
                .statusCode(404)
                .body("error", equalTo("probe-404 detail"))
                .body("correlationId", nullValue());

        verify(errorLogService).record(eq(404), eq("GET"), anyString(), anyString(), any(), isNull(), eq(false));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void authenticatedClientErrorIsHandedToPolicyAsAuthenticated() {
        given().when().get("/api/test-error-probe/status/409")
                .then()
                .statusCode(409)
                .body("error", equalTo("probe-409 detail"))
                .body("correlationId", nullValue());

        verify(errorLogService).record(eq(409), eq("GET"), anyString(), anyString(), any(), isNull(), eq(true));
    }

    @Test
    void unhandledServerErrorReturnsGenericBodyWithCorrelationId() {
        String correlationId = given().when().get("/api/test-error-probe/boom")
                .then()
                .statusCode(500)
                .body("error", equalTo("Interner Serverfehler"))
                .body("correlationId", matchesPattern(UUID_PATTERN))
                .body("status", equalTo(500))
                .body(not(containsString("secret internal detail")))
                .extract().path("correlationId");

        ArgumentCaptor<String> correlation = ArgumentCaptor.forClass(String.class);
        verify(errorLogService).record(eq(500), eq("GET"), anyString(), anyString(), any(),
                correlation.capture(), eq(false));
        assertEquals(correlationId, correlation.getValue());
    }

    @Test
    void webApplicationServerErrorReturnsGenericBodyWithCorrelationId() {
        given().when().get("/api/test-error-probe/status/503")
                .then()
                .statusCode(503)
                .body("error", equalTo("Interner Serverfehler"))
                .body("correlationId", matchesPattern(UUID_PATTERN))
                .body(not(containsString("probe-503")));

        verify(errorLogService).record(eq(503), eq("GET"), anyString(), anyString(), any(),
                anyString(), eq(false));
    }

    @Test
    void persistenceFailureDoesNotChangeServerErrorResponse() {
        doThrow(new RuntimeException("database unavailable"))
                .when(errorLogService).record(anyInt(), anyString(), anyString(), anyString(), any(),
                        anyString(), anyBoolean());

        given().when().get("/api/test-error-probe/boom")
                .then()
                .statusCode(500)
                .body("error", equalTo("Interner Serverfehler"))
                .body("correlationId", matchesPattern(UUID_PATTERN));
    }
}
