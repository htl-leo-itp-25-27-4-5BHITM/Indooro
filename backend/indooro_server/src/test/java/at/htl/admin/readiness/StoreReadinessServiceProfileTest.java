package at.htl.admin.readiness;

import at.htl.admin.entity.StoreEntity;
import at.htl.admin.readiness.ReadinessDtos.ReadinessReport;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.service.AdminAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Without a radius parameter the store's coverage profile decides the radius. */
class StoreReadinessServiceProfileTest {

    private final UUID storeId = UUID.randomUUID();
    private final StoreEntity store = new StoreEntity();
    private final StoreReadinessService service = new StoreReadinessService();

    @BeforeEach
    void setUp() {
        StoreRepository stores = mock(StoreRepository.class);
        LayoutVersionRepository layouts = mock(LayoutVersionRepository.class);
        BeaconAssignmentRepository assignments = mock(BeaconAssignmentRepository.class);
        service.adminAccessService = mock(AdminAccessService.class);
        service.storeRepository = stores;
        service.layoutVersionRepository = layouts;
        service.beaconAssignmentRepository = assignments;
        store.id = storeId;
        store.storeCode = "TEST-1";
        when(stores.findByIdOptional(storeId)).thenReturn(Optional.of(store));
        when(layouts.findActiveByStoreId(storeId)).thenReturn(Optional.empty());
        when(assignments.listActiveByStoreId(storeId)).thenReturn(List.of());
    }

    @Test
    void marketStoreUsesEightMetresByDefault() {
        ReadinessReport report = service.evaluate(storeId, null);

        assertEquals("market", report.profile());
        assertEquals(8.0, report.radius());
    }

    @Test
    void testroomStoreUsesItsOwnDefaultRadius() {
        store.readinessProfile = "testroom";

        ReadinessReport report = service.evaluate(storeId, null);

        assertEquals("testroom", report.profile());
        assertEquals(10.0, report.radius());
    }

    @Test
    void explicitRadiusWinsOverTheProfileDefault() {
        store.readinessProfile = "testroom";

        assertEquals(6.5, service.evaluate(storeId, 6.5).radius());
    }

    @Test
    void unknownStoredProfileFallsBackToMarket() {
        store.readinessProfile = "removed-profile";

        ReadinessReport report = service.evaluate(storeId, null);

        assertEquals("market", report.profile());
        assertEquals(8.0, report.radius());
    }

    @Test
    void reportWithoutActiveLayoutDoesNotClaimAComputedCoverage() {
        assertFalse(service.evaluate(storeId, null).coverageComputed());
    }
}
