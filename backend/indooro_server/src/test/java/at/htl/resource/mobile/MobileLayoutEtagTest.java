package at.htl.resource.mobile;

import at.htl.admin.dto.MobileDtos;
import at.htl.admin.service.MobileStoreService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.equalTo;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.emptyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@QuarkusTest
class MobileLayoutEtagTest {

    private static final UUID STORE_ID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final UUID LAYOUT_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final String ETAG = "5f1c0d2e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d";

    @InjectMock
    MobileStoreService mobileStoreService;

    @Test
    void firstRequestReturns200WithStrongEtagAndNoCache() throws Exception {
        stubLayout(ETAG);

        given()
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then()
                .statusCode(200)
                .header("ETag", equalTo("\"" + ETAG + "\""))
                .header("Cache-Control", containsString("no-cache"))
                .body("layoutId", equalTo(LAYOUT_ID.toString()))
                .body("source", equalTo("ACTIVE"));
    }

    @Test
    void matchingIfNoneMatchReturns304WithoutBody() throws Exception {
        stubLayout(ETAG);

        given()
                .header("If-None-Match", "\"" + ETAG + "\"")
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then()
                .statusCode(304)
                .header("ETag", equalTo("\"" + ETAG + "\""))
                .header("Cache-Control", containsString("no-cache"))
                .body(emptyString());
    }

    @Test
    void weakListAndWildcardFormsAlsoReturn304() throws Exception {
        stubLayout(ETAG);

        given().header("If-None-Match", "W/\"" + ETAG + "\"")
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then().statusCode(304);

        given().header("If-None-Match", "\"old\", \"" + ETAG + "\"")
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then().statusCode(304);

        given().header("If-None-Match", "*")
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then().statusCode(304);
    }

    @Test
    void changedActivationReturns200WithNewEtag() throws Exception {
        String newEtag = "0a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9";
        stubLayout(newEtag);

        given()
                .header("If-None-Match", "\"" + ETAG + "\"")
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then()
                .statusCode(200)
                .header("ETag", equalTo("\"" + newEtag + "\""))
                .body("layoutId", equalTo(LAYOUT_ID.toString()));
    }

    @Test
    void defaultLayoutAnswers200AndRevalidatesWith304() throws Exception {
        String defaultEtag = "9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d";
        when(mobileStoreService.getCurrentLayoutWithEtag(any(UUID.class))).thenReturn(
                new MobileStoreService.LayoutWithEtag(
                        new MobileDtos.MobileLayoutResponse(STORE_ID, null, "DEFAULT", true, layoutJson("Leonding")),
                        defaultEtag));

        given()
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then()
                .statusCode(200)
                .header("ETag", equalTo("\"" + defaultEtag + "\""))
                .body("source", equalTo("DEFAULT"))
                .body("fallback", equalTo(true));

        given()
                .header("If-None-Match", "\"" + defaultEtag + "\"")
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then()
                .statusCode(304);
    }

    @Test
    void inactiveOrUnknownStoreStays404EvenWithIfNoneMatch() {
        when(mobileStoreService.getCurrentLayoutWithEtag(any(UUID.class)))
                .thenThrow(new NotFoundException("Filiale ist nicht aktiv."));

        given()
                .header("If-None-Match", "*")
                .when().get("/api/mobile/stores/{storeId}/layout/current", STORE_ID)
                .then()
                .statusCode(404);
    }

    private void stubLayout(String etag) throws Exception {
        when(mobileStoreService.getCurrentLayoutWithEtag(any(UUID.class))).thenReturn(
                new MobileStoreService.LayoutWithEtag(
                        new MobileDtos.MobileLayoutResponse(STORE_ID, LAYOUT_ID, "ACTIVE", false, layoutJson("Leonding")),
                        etag));
    }

    private static JsonNode layoutJson(String shopName) throws Exception {
        return new ObjectMapper().readTree("{\"shopName\":\"" + shopName + "\",\"elements\":[]}");
    }
}
