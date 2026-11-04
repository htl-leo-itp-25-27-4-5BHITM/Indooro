package at.htl.admin.service;

import at.htl.admin.dto.StoreDtos.StoreUpsertRequest;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.RegionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.RegionRepository;
import at.htl.admin.repository.StoreRepository;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** New stores stay out of the customer market list until an admin releases them. */
class StoreReleaseGateTest {

    private final UUID storeId = UUID.randomUUID();
    private final AdminAccessService access = mock(AdminAccessService.class);
    private final AuditLogService audit = mock(AuditLogService.class);
    private final StoreRepository repository = mock(StoreRepository.class);
    private final StoreAdminService service = new StoreAdminService();
    private final StoreEntity store = new StoreEntity();
    private final RegionEntity region = new RegionEntity();

    @BeforeEach
    void setUp() {
        RegionRepository regions = mock(RegionRepository.class);
        service.storeRepository = repository;
        service.regionRepository = regions;
        service.layoutVersionRepository = mock(LayoutVersionRepository.class);
        service.auditLogService = audit;
        service.adminAccessService = access;

        region.id = UUID.randomUUID();
        region.code = "AT-OO";
        region.name = "Oberoesterreich";
        store.id = storeId;
        store.region = region;
        store.storeCode = "LEO-1";
        store.name = "Filiale";
        store.status = RecordStatus.ACTIVE;
        when(repository.findByIdOptional(storeId)).thenReturn(Optional.of(store));
        when(repository.findByStoreCode(any())).thenReturn(Optional.empty());
        when(regions.findByIdOptional(region.id)).thenReturn(Optional.of(region));
    }

    @Test
    void storeLoadedFromTheDatabaseDefaultIsReleased() {
        assertTrue(new StoreEntity().released);
    }

    @Test
    void createdStoreStartsUnreleased() {
        var request = new StoreUpsertRequest(region.id, "NEU-1", "Neu", "Strasse 1", "4020", "Linz", "AT",
                null, null, null, null);

        var response = service.createStore(request);

        assertFalse(response.released());
        verify(repository).persist(any(StoreEntity.class));
    }

    @Test
    void adminReleasesAndWithdrawsWithAudit() {
        store.released = false;

        assertTrue(service.releaseStore(storeId).released());
        assertTrue(store.released);
        assertFalse(service.withdrawStore(storeId).released());
        assertFalse(store.released);

        verify(audit).log(eq("STORE"), eq(storeId), eq("RELEASE"), anyString(), any(), any());
        verify(audit).log(eq("STORE"), eq(storeId), eq("WITHDRAW"), anyString(), any(), any());
    }

    @Test
    void releaseIsIdempotentAndWritesNoAuditEntry() {
        store.released = true;

        assertTrue(service.releaseStore(storeId).released());

        verify(audit, never()).log(anyString(), any(), anyString(), anyString(), any(), any());
    }

    @Test
    void nonAdminCannotReleaseOrWithdraw() {
        store.released = false;
        doThrow(new ForbiddenException("nur Admin")).when(access).requireAdmin();

        assertThrows(ForbiddenException.class, () -> service.releaseStore(storeId));
        assertThrows(ForbiddenException.class, () -> service.withdrawStore(storeId));

        assertFalse(store.released);
    }

    @Test
    void archivedStoreCannotBeReleased() {
        store.released = false;
        store.status = RecordStatus.ARCHIVED;

        var error = assertThrows(WebApplicationException.class, () -> service.releaseStore(storeId));

        assertEquals(409, error.getResponse().getStatus());
        assertFalse(store.released);
    }

    @Test
    @SuppressWarnings("unchecked")
    void customerMarketListQueriesOnlyReleasedActiveStores() {
        PanacheQuery<StoreEntity> query = mock(PanacheQuery.class);
        when(query.list()).thenReturn(List.of());
        when(repository.find(anyString(), any(Object[].class))).thenReturn(query);
        MobileStoreService mobile = new MobileStoreService();
        mobile.storeRepository = repository;
        mobile.beaconAssignmentRepository = mock(BeaconAssignmentRepository.class);

        mobile.listStores();

        verify(repository).find(eq("status = ?1 and released = true order by name"), eq(RecordStatus.ACTIVE));
    }
}
