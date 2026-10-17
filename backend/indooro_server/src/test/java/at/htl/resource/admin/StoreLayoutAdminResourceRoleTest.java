package at.htl.resource.admin;

import at.htl.admin.dto.LayoutDtos;
import at.htl.admin.service.AdminAccessService;
import at.htl.admin.service.StoreLayoutAdminService;
import at.htl.service.LayoutService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import io.restassured.response.Response;
import io.restassured.specification.RequestSpecification;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class StoreLayoutAdminResourceRoleTest {

    private static final UUID STORE = UUID.fromString("83838383-8383-8383-8383-838383838383");
    private static final UUID LAYOUT = UUID.fromString("84848484-8484-8484-8484-848484848484");
    private static final String BASE = "/api/stores/" + STORE + "/layout";
    private static final String LAYOUT_JSON = "{\"shopName\":\"Test\",\"gridSize\":{\"width\":10,\"height\":10},\"elements\":[]}";
    private static final String SAVE_BODY = "{\"layoutName\":\"Test\",\"changeNote\":\"Test\",\"activate\":false,\"layout\":" + LAYOUT_JSON + "}";

    @InjectMock StoreLayoutAdminService service;
    @InjectMock AdminAccessService access;
    @InjectMock LayoutService layoutService;

    /** Store layout endpoints with the body each call needs. GET calls have no body. */
    private record Call(String method, String path, String body) {
    }

    private static final List<Call> STORE_CALLS = List.of(
            new Call("GET", BASE + "/current", null),
            new Call("GET", BASE + "/versions", null),
            new Call("GET", BASE + "/versions/" + LAYOUT, null),
            new Call("POST", BASE + "/versions", SAVE_BODY),
            new Call("POST", BASE + "/versions/" + LAYOUT + "/activate", "{}"),
            new Call("GET", BASE + "/editor-context", null)
    );

    private static Response send(Call call) {
        RequestSpecification spec = given().contentType("application/json");
        if (call.body() != null) {
            spec = spec.body(call.body());
        }
        return "GET".equals(call.method()) ? spec.get(call.path()) : spec.post(call.path());
    }

    private static LayoutDtos.StoreLayoutResponse layoutResponse() throws IOException {
        return new LayoutDtos.StoreLayoutResponse(LAYOUT, STORE, 1, "DRAFT", Instant.parse("2026-10-11T00:00:00Z"), null,
                new ObjectMapper().readTree(LAYOUT_JSON));
    }

    private void stubStoreService() throws IOException {
        when(service.getCurrentLayout(STORE)).thenReturn(layoutResponse());
        when(service.listLayoutVersions(STORE)).thenReturn(List.of());
        when(service.getLayoutVersion(STORE, LAYOUT)).thenReturn(layoutResponse());
        when(service.saveLayoutVersion(eq(STORE), any())).thenReturn(layoutResponse());
        when(service.activateLayoutVersion(STORE, LAYOUT)).thenReturn(layoutResponse());
        when(service.getEditorContext(STORE)).thenReturn(new LayoutDtos.EditorContextResponse(
                new LayoutDtos.StoreEditorReference(STORE, "LINZ-01", "Indooro Linz"), layoutResponse(), List.of()));
    }

    private static void assertAllowedOnEveryStoreCall() {
        for (Call call : STORE_CALLS) {
            send(call).then().statusCode(200);
        }
    }

    private static void assertDeniedWithoutWrites(Call call, int status, StoreLayoutAdminService service) throws IOException {
        // Denied requests must never reach the write methods.
        send(call).then().statusCode(status);
        verify(service, never()).saveLayoutVersion(any(), any());
        verify(service, never()).activateLayoutVersion(any(), any());
    }

    @Test
    void anonymousIsUnauthorizedOnEveryStoreLayoutEndpoint() throws IOException {
        for (Call call : STORE_CALLS) {
            send(call).then().statusCode(401);
        }
        verify(service, never()).saveLayoutVersion(any(), any());
        verify(service, never()).activateLayoutVersion(any(), any());
    }

    @Test
    @TestSecurity(user = "guest", roles = "guest")
    void roleWithoutAdminAccessIsForbiddenOnEveryStoreLayoutEndpoint() throws IOException {
        for (Call call : STORE_CALLS) {
            assertDeniedWithoutWrites(call, 403, service);
        }
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminCanUseEveryStoreLayoutEndpoint() throws IOException {
        stubStoreService();
        assertAllowedOnEveryStoreCall();
        verify(service).saveLayoutVersion(eq(STORE), any());
        verify(service).activateLayoutVersion(STORE, LAYOUT);
    }

    @Test
    @TestSecurity(user = "region", roles = "region-manager")
    void regionManagerCanUseStoreLayoutEndpointsOfItsStores() throws IOException {
        stubStoreService();
        assertAllowedOnEveryStoreCall();
        verify(service).saveLayoutVersion(eq(STORE), any());
        verify(service).activateLayoutVersion(STORE, LAYOUT);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCanUseStoreLayoutEndpointsOfItsStore() throws IOException {
        stubStoreService();
        assertAllowedOnEveryStoreCall();
        verify(service).saveLayoutVersion(eq(STORE), any());
        verify(service).activateLayoutVersion(STORE, LAYOUT);
    }

    @Test
    @TestSecurity(user = "region", roles = "region-manager")
    void regionManagerIsForbiddenOnForeignStoreLayout() throws IOException {
        assertForeignStoreForbidden();
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerIsForbiddenOnForeignStoreLayout() throws IOException {
        assertForeignStoreForbidden();
    }

    /**
     * The service enforces store scope (AdminAccessService.requireStoreAccess). The service is mocked here,
     * so this checks that its ForbiddenException becomes a 403 on read, write and activate, and that the
     * write runs exactly once per request.
     */
    private void assertForeignStoreForbidden() throws IOException {
        String message = "Kein Zugriff auf diese Filiale.";
        doThrow(new ForbiddenException(message)).when(service).getEditorContext(STORE);
        doThrow(new ForbiddenException(message)).when(service).saveLayoutVersion(eq(STORE), any());
        doThrow(new ForbiddenException(message)).when(service).activateLayoutVersion(STORE, LAYOUT);

        send(STORE_CALLS.get(5)).then().statusCode(403);
        send(STORE_CALLS.get(3)).then().statusCode(403);
        send(STORE_CALLS.get(4)).then().statusCode(403);

        verify(service, times(1)).saveLayoutVersion(eq(STORE), any());
        verify(service, times(1)).activateLayoutVersion(STORE, LAYOUT);
    }

    @Test
    void anonymousCannotSaveCurrentLayoutGlobally() throws IOException {
        given().contentType("application/json").body("{\"shopName\":\"Injected\",\"elements\":[]}")
                .post("/api/layout/current").then().statusCode(401);
        verify(layoutService, never()).saveCurrentLayout(any());
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminCanSaveCurrentLayoutGlobally() throws IOException {
        when(layoutService.saveCurrentLayout(any())).thenReturn(
                new LayoutService.LayoutHistoryEntry("layout-1", "Indooro", "2026-10-11T00:00:00Z", "2026-10-11T00:00:00Z", 0));

        given().contentType("application/json").body("{\"shopName\":\"Indooro\",\"elements\":[]}")
                .post("/api/layout/current").then().statusCode(200).body("layoutId", equalTo("layout-1"));
        verify(layoutService).saveCurrentLayout(any());
    }

    @Test
    @TestSecurity(user = "region", roles = "region-manager")
    void regionManagerCannotSaveCurrentLayoutGlobally() throws IOException {
        given().contentType("application/json").body("{\"shopName\":\"Injected\",\"elements\":[]}")
                .post("/api/layout/current").then().statusCode(403);
        verify(layoutService, never()).saveCurrentLayout(any());
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerCannotSaveCurrentLayoutGlobally() throws IOException {
        given().contentType("application/json").body("{\"shopName\":\"Injected\",\"elements\":[]}")
                .post("/api/layout/current").then().statusCode(403);
        verify(layoutService, never()).saveCurrentLayout(any());
    }
}
