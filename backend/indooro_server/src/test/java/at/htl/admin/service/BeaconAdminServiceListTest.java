package at.htl.admin.service;

import at.htl.admin.dto.BeaconDtos;
import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.BeaconEntity;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.RegionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.entity.UserAccessAssignmentEntity;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.BeaconRepository;
import at.htl.admin.repository.BeaconRepository.BeaconWithAssignment;
import at.htl.admin.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** listBeacons issues one scoped repository query and performs no per-beacon lookups. */
class BeaconAdminServiceListTest {

    private BeaconAdminService service;
    private BeaconRepository beaconRepository;
    private StoreRepository storeRepository;
    private BeaconAssignmentRepository beaconAssignmentRepository;
    private AdminAccessService adminAccessService;
    private RegionEntity region;
    private StoreEntity storeInRegion;
    private StoreEntity otherStore;

    @BeforeEach
    void setUp() {
        service = new BeaconAdminService();
        beaconRepository = mock(BeaconRepository.class);
        storeRepository = mock(StoreRepository.class);
        beaconAssignmentRepository = mock(BeaconAssignmentRepository.class);
        adminAccessService = mock(AdminAccessService.class);
        service.beaconRepository = beaconRepository;
        service.storeRepository = storeRepository;
        service.beaconAssignmentRepository = beaconAssignmentRepository;
        service.auditLogService = mock(AuditLogService.class);
        service.adminAccessService = adminAccessService;

        region = region();
        storeInRegion = store("LEO-1", region);
        otherStore = store("LEO-2", region);
        when(adminAccessService.currentUser()).thenReturn(new CurrentAdminUser("admin", "admin", null, AdminRole.ADMIN, null));
        when(adminAccessService.effectiveStoreFilter(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void listIssuesExactlyOneRepositoryQueryForAllBeacons() {
        when(beaconRepository.listWithActiveAssignments(eq(RecordStatus.ACTIVE), isNull(), isNull(), isNull()))
                .thenReturn(List.of(
                        row(beacon("b-2"), storeInRegion),
                        row(beacon("A-1"), null),
                        row(beacon("c-3"), otherStore)));

        List<BeaconDtos.BeaconResponse> result = service.listBeacons(null, null, null, null);

        assertEquals(List.of("A-1", "b-2", "c-3"), result.stream().map(BeaconDtos.BeaconResponse::beaconCode).toList());
        assertNull(result.get(0).currentStore());
        assertEquals(storeInRegion.id, result.get(1).currentStore().id());
        assertEquals("LEO-1", result.get(1).currentStore().storeCode());
        assertEquals(region.id, result.get(1).currentStore().regionId());
        assertEquals("ACTIVE", result.get(0).status());

        verify(beaconRepository, times(1)).listWithActiveAssignments(eq(RecordStatus.ACTIVE), isNull(), isNull(), isNull());
        verifyNoInteractions(storeRepository);
        verifyNoInteractions(beaconAssignmentRepository);
        verify(adminAccessService, never()).canSeeBeaconStore(any());
    }

    @Test
    void regionManagerQueryIsScopedToOwnRegion() {
        UserAccessAssignmentEntity assignment = new UserAccessAssignmentEntity();
        assignment.region = region;
        when(adminAccessService.currentUser()).thenReturn(new CurrentAdminUser("rm", "rm", null, AdminRole.REGION_MANAGER, assignment));
        when(beaconRepository.listWithActiveAssignments(any(), isNull(), eq(region.id), isNull()))
                .thenReturn(List.of(row(beacon("B-1"), storeInRegion)));

        List<BeaconDtos.BeaconResponse> result = service.listBeacons(null, null, null, null);

        assertEquals(1, result.size());
        verify(beaconRepository, times(1)).listWithActiveAssignments(RecordStatus.ACTIVE, null, region.id, null);
        verifyNoInteractions(storeRepository);
    }

    @Test
    void storeManagerQueryIsScopedToOwnStore() {
        UserAccessAssignmentEntity assignment = new UserAccessAssignmentEntity();
        assignment.store = storeInRegion;
        assignment.region = region;
        when(adminAccessService.currentUser()).thenReturn(new CurrentAdminUser("sm", "sm", null, AdminRole.STORE_MANAGER, assignment));
        when(adminAccessService.effectiveStoreFilter(null)).thenReturn(storeInRegion.id);
        when(beaconRepository.listWithActiveAssignments(any(), isNull(), isNull(), eq(storeInRegion.id)))
                .thenReturn(List.of(row(beacon("S-1"), storeInRegion)));

        List<BeaconDtos.BeaconResponse> result = service.listBeacons(null, null, null, null);

        assertEquals(List.of("S-1"), result.stream().map(BeaconDtos.BeaconResponse::beaconCode).toList());
        verify(beaconRepository, times(1)).listWithActiveAssignments(RecordStatus.ACTIVE, null, null, storeInRegion.id);
        verifyNoInteractions(storeRepository);
    }

    @Test
    void assignedFilterIsAppliedToTheSingleQueryResult() {
        when(beaconRepository.listWithActiveAssignments(eq(RecordStatus.ACTIVE), isNull(), isNull(), isNull()))
                .thenReturn(List.of(row(beacon("x-1"), storeInRegion), row(beacon("x-2"), null)));

        List<BeaconDtos.BeaconResponse> unassigned = service.listBeacons(null, false, null, null);

        assertEquals(List.of("x-2"), unassigned.stream().map(BeaconDtos.BeaconResponse::beaconCode).toList());
        verify(beaconRepository, times(1)).listWithActiveAssignments(eq(RecordStatus.ACTIVE), isNull(), isNull(), isNull());
    }

    @Test
    void textSearchIsPassedLowerCasedAndWrappedInWildcards() {
        when(beaconRepository.listWithActiveAssignments(any(), any(), any(), any())).thenReturn(List.of());

        service.listBeacons(RecordStatus.ARCHIVED, null, null, "  AB-1 ");

        verify(beaconRepository, times(1)).listWithActiveAssignments(RecordStatus.ARCHIVED, "%ab-1%", null, null);
    }

    private BeaconWithAssignment row(BeaconEntity beacon, StoreEntity store) {
        if (store == null) {
            return new BeaconWithAssignment(beacon, null);
        }
        BeaconAssignmentEntity assignment = new BeaconAssignmentEntity();
        assignment.id = UUID.randomUUID();
        assignment.beacon = beacon;
        assignment.store = store;
        assignment.isActive = true;
        return new BeaconWithAssignment(beacon, assignment);
    }

    private BeaconEntity beacon(String code) {
        BeaconEntity beacon = new BeaconEntity();
        beacon.id = UUID.randomUUID();
        beacon.beaconCode = code;
        beacon.uuid = "0123456789abcdef0123456789abcdef";
        beacon.identityKey = "identity-" + code;
        beacon.status = RecordStatus.ACTIVE;
        return beacon;
    }

    private RegionEntity region() {
        RegionEntity region = new RegionEntity();
        region.id = UUID.randomUUID();
        region.code = "AT-OO";
        region.name = "Oberoesterreich";
        return region;
    }

    private StoreEntity store(String storeCode, RegionEntity region) {
        StoreEntity store = new StoreEntity();
        store.id = UUID.randomUUID();
        store.storeCode = storeCode;
        store.name = "Filiale " + storeCode;
        store.status = RecordStatus.ACTIVE;
        store.region = region;
        return store;
    }
}
