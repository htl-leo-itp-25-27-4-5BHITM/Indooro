package at.htl.resource.admin;

import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.readiness.ReadinessDtos.ProductPage;
import at.htl.admin.readiness.ReadinessDtos.ProductRef;
import at.htl.admin.readiness.StoreProductSource;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.service.AdminAccessService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.security.TestSecurity;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@QuarkusTest
class StoreReadinessResourceTest {

    private static final UUID STORE = UUID.fromString("83838383-8383-8383-8383-838383838383");
    private static final ObjectMapper JSON = new ObjectMapper();

    @InjectMock AdminAccessService access;
    @InjectMock StoreRepository storeRepository;
    @InjectMock LayoutVersionRepository layoutVersions;
    @InjectMock BeaconAssignmentRepository beaconAssignments;
    @InjectMock StoreProductSource productSource;

    @Test
    void anonymousCannotReadReadiness() {
        given().get(path()).then().statusCode(401);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void adminReadsReportForActiveLayout() throws Exception {
        arrangeStore();
        arrangeActiveLayout();
        when(productSource.loadStoreProducts(any(), any()))
                .thenReturn(new ProductPage(List.of(new ProductRef(1, "Milch", "520/1/1/1")), false, 4));

        // No beacons are placed, so the only finding is the low-coverage warning: YELLOW, no blocking.
        given().get(path()).then().statusCode(200)
                .body("storeId", equalTo(STORE.toString()))
                .body("status", equalTo("YELLOW"))
                .body("blockingCount", equalTo(0))
                .body("counts.shelves", equalTo(1))
                .body("counts.products", equalTo(1))
                .body("counts.skippedGlobalProducts", equalTo(4))
                .body("findings[0].code", equalTo("LOW_BEACON_COVERAGE"));
        verify(access).requireStoreAccess(STORE);
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerOfAssignedStoreReadsReport() throws Exception {
        arrangeStore();
        arrangeActiveLayout();
        when(productSource.loadStoreProducts(any(), any())).thenReturn(new ProductPage(List.of(), false));

        given().get(path()).then().statusCode(200).body("status", equalTo("YELLOW"));
    }

    @Test
    @TestSecurity(user = "store", roles = "store-manager")
    void storeManagerOfForeignStoreIsForbidden() {
        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(STORE);

        given().get(path()).then().statusCode(403);
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void storeWithoutActiveLayoutReturnsBlockingFinding() throws Exception {
        arrangeStore();
        when(layoutVersions.findActiveByStoreId(STORE)).thenReturn(Optional.empty());

        given().get(path()).then().statusCode(200)
                .body("status", equalTo("RED"))
                .body("blockingCount", equalTo(1))
                .body("findings[0].severity", equalTo("BLOCKING"))
                .body("findings[0].code", equalTo("NO_ACTIVE_LAYOUT"));
    }

    @Test
    @TestSecurity(user = "admin", roles = "admin")
    void radiusOutsideAllowedRangeIsRejected() throws Exception {
        arrangeStore();
        arrangeActiveLayout();
        when(productSource.loadStoreProducts(any(), any())).thenReturn(new ProductPage(List.of(), false));

        given().queryParam("radius", "0.2").get(path()).then().statusCode(400);
        given().queryParam("radius", "31").get(path()).then().statusCode(400);
        given().queryParam("radius", "10").get(path()).then().statusCode(200);
    }

    private void arrangeStore() {
        StoreEntity store = new StoreEntity();
        store.id = STORE;
        store.storeCode = "W-READY";
        store.name = "Testfiliale";
        when(storeRepository.findByIdOptional(STORE)).thenReturn(Optional.of(store));
    }

    private void arrangeActiveLayout() throws Exception {
        LayoutVersionEntity version = new LayoutVersionEntity();
        version.id = UUID.randomUUID();
        version.versionNo = 3;
        version.layoutJson = JSON.readTree("""
                {
                  "shopName": "Testfiliale",
                  "gridSize": {"width": 20, "height": 20},
                  "elements": [
                    {"id": 1, "type": "entrance", "x": 0, "y": 0, "width": 1, "height": 1},
                    {"id": 2, "type": "shelf", "x": 5, "y": 5, "width": 4, "height": 1,
                     "category": "520/1", "label": "Milch"}
                  ]
                }
                """);
        when(layoutVersions.findActiveByStoreId(STORE)).thenReturn(Optional.of(version));
    }

    private static String path() {
        return "/api/stores/" + STORE + "/readiness";
    }
}
