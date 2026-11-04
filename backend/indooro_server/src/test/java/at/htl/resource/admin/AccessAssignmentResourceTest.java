package at.htl.resource.admin;

import at.htl.admin.dto.AccessAssignmentDtos;
import at.htl.admin.entity.UserAccessStatus;
import at.htl.admin.service.AccessAssignmentService;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** Role lock and request validation of /api/admin/access-assignments. The service is mocked. */
@QuarkusTest
class AccessAssignmentResourceTest {

    private static final String BASE = "/api/admin/access-assignments";
    private static final UUID ASSIGNMENT = UUID.fromString("c1c1c1c1-0000-0000-0000-000000000001");
    private static final UUID STORE = UUID.fromString("b1b1b1b1-0000-0000-0000-000000000001");
    private static final String CREATE_BODY = "{\"keycloakSubject\":\"6d1f0c2e-1b7a-4c55-9a0e-3f3b8d2a9e11\","
            + "\"username\":\"marta\",\"email\":\"marta@example.test\",\"role\":\"store-manager\",\"storeId\":\"" + STORE + "\"}";

    @InjectMock AccessAssignmentService service;

    private record Call(String method, String path, String body) {
    }

    private static final List<Call> CALLS = List.of(
            new Call("GET", BASE, null),
            new Call("POST", BASE, CREATE_BODY),
            new Call("PATCH", BASE + "/" + ASSIGNMENT + "/deactivate", null)
    );

    private static Response send(Call call) {
        RequestSpecification spec = given().contentType("application/json");
        if (call.body() != null) {
            spec = spec.body(call.body());
        }
        return switch (call.method()) {
            case "GET" -> spec.get(call.path());
            case "POST" -> spec.post(call.path());
            default -> spec.patch(call.path());
        };
    }

    private static AccessAssignmentDtos.AccessAssignmentResponse response(String status) {
        return new AccessAssignmentDtos.AccessAssignmentResponse(ASSIGNMENT, "6d1f0c2e-1b7a-4c55-9a0e-3f3b8d2a9e11", "marta",
                "marta@example.test", "store-manager", null, null, STORE, "SPAR-Leonding-002", "SPAR Leonding Testraum",
                status, Instant.parse("2026-11-04T08:00:00Z"), Instant.parse("2026-11-04T08:00:00Z"));
    }

    @Test
    void anonymousIsUnauthorizedOnEveryEndpoint() {
        for (Call call : CALLS) {
            send(call).then().statusCode(401);
        }
        verifyNoInteractions(service);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerIsForbiddenOnEveryEndpoint() {
        for (Call call : CALLS) {
            send(call).then().statusCode(403);
        }
        verifyNoInteractions(service);
    }

    @Test
    @TestSecurity(user = "region", roles = "region-manager")
    void regionManagerIsForbiddenOnEveryEndpoint() {
        for (Call call : CALLS) {
            send(call).then().statusCode(403);
        }
        verifyNoInteractions(service);
    }

    @Test
    @TestSecurity(user = "nobody")
    void signedInUserWithoutRoleIsForbiddenOnEveryEndpoint() {
        for (Call call : CALLS) {
            send(call).then().statusCode(403);
        }
        verifyNoInteractions(service);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminListsCreatesAndDeactivates() {
        when(service.listAssignments(UserAccessStatus.ACTIVE)).thenReturn(List.of(response("ACTIVE")));
        when(service.createAssignment(any())).thenReturn(response("ACTIVE"));
        when(service.deactivateAssignment(ASSIGNMENT)).thenReturn(response("DISABLED"));

        given().get(BASE + "?status=active").then().statusCode(200)
                .body("[0].storeCode", equalTo("SPAR-Leonding-002"))
                .body("[0].keycloakSubject", equalTo("6d1f0c2e-1b7a-4c55-9a0e-3f3b8d2a9e11"));
        given().contentType("application/json").body(CREATE_BODY).post(BASE).then().statusCode(200)
                .body("storeId", equalTo(STORE.toString()))
                .body("status", equalTo("ACTIVE"));
        given().patch(BASE + "/" + ASSIGNMENT + "/deactivate").then().statusCode(200)
                .body("status", equalTo("DISABLED"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void unknownStatusFilterIsABadRequest() {
        given().get(BASE + "?status=ARCHIVED").then().statusCode(400);
        verifyNoInteractions(service);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void createWithoutSubjectUsernameOrRoleIsRejectedBeforeTheService() {
        given().contentType("application/json").body("{\"role\":\"store-manager\",\"storeId\":\"" + STORE + "\"}")
                .post(BASE).then().statusCode(400);
        given().contentType("application/json")
                .body("{\"keycloakSubject\":\"abc\",\"username\":\"marta\",\"email\":\"not-an-email\",\"role\":\"store-manager\"}")
                .post(BASE).then().statusCode(400);
        given().contentType("application/json").post(BASE).then().statusCode(400);
        verify(service, never()).createAssignment(any());
    }
}
