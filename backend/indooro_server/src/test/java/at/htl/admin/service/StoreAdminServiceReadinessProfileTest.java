package at.htl.admin.service;

import at.htl.admin.dto.StoreDtos.StoreUpsertRequest;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.RegionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.RegionRepository;
import at.htl.admin.repository.StoreRepository;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The coverage profile of a store decides the readiness verdict, so only an admin may change it. */
class StoreAdminServiceReadinessProfileTest {

    private final UUID storeId = UUID.randomUUID();
    private final AdminAccessService access = mock(AdminAccessService.class);
    private final StoreAdminService service = new StoreAdminService();
    private final StoreEntity store = new StoreEntity();
    private final RegionEntity region = new RegionEntity();

    @BeforeEach
    void setUp() {
        StoreRepository repository = mock(StoreRepository.class);
        RegionRepository regions = mock(RegionRepository.class);
        service.storeRepository = repository;
        service.regionRepository = regions;
        service.layoutVersionRepository = mock(LayoutVersionRepository.class);
        service.auditLogService = mock(AuditLogService.class);
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

    private StoreUpsertRequest request(String profile) {
        return new StoreUpsertRequest(region.id, "LEO-1", "Filiale", "Strasse 1", "4020", "Linz", "AT",
                null, null, null, profile);
    }

    @Test
    void newStoreStartsWithTheDefaultProfile() {
        assertEquals("market", new StoreEntity().readinessProfile);
    }

    @Test
    void adminCanSwitchToTestroom() {
        var response = service.updateStore(storeId, request("testroom"));

        assertEquals("testroom", store.readinessProfile);
        assertEquals("testroom", response.readinessProfile());
        verify(access).requireAdmin();
    }

    @Test
    void nonAdminCannotChangeTheProfile() {
        doThrow(new ForbiddenException("nur Admin")).when(access).requireAdmin();

        assertThrows(ForbiddenException.class, () -> service.updateStore(storeId, request("testroom")));

        assertEquals("market", store.readinessProfile);
    }

    @Test
    void nonAdminCanSaveTheStoreWithoutOrWithTheUnchangedProfile() {
        doThrow(new ForbiddenException("nur Admin")).when(access).requireAdmin();

        service.updateStore(storeId, request(null));
        service.updateStore(storeId, request("market"));

        assertEquals("market", store.readinessProfile);
        verify(access, never()).requireAdmin();
    }

    @Test
    void nullKeepsAnExistingTestroomProfile() {
        store.readinessProfile = "testroom";

        service.updateStore(storeId, request(null));

        assertEquals("testroom", store.readinessProfile);
    }

    @Test
    void unknownProfileIsRejectedBeforeAnyRoleCheck() {
        assertThrows(BadRequestException.class, () -> service.updateStore(storeId, request("gaming")));

        assertEquals("market", store.readinessProfile);
        verify(access, never()).requireAdmin();
    }
}
