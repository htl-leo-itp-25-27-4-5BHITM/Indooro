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
import at.htl.admin.repository.StoreRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** listBeacons issues exactly two repository queries (beacons, then their active assignments) and no per-row lookups. */
class BeaconAdminServiceListTest {

    private BeaconAdminService service;
    private BeaconRepository beaconRepository;
    private StoreRepository storeRepository;
    private BeaconAssignmentRepository beaconAssignmentRepository;
    private AdminAccessService adminAccessService;
    private RegionEntity region;
    private RegionEntity otherRegion;
    private StoreEntity storeInRegion;
    private StoreEntity otherStore;
    private StoreEntity storeInOtherRegion;

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

        region = region("AT-OO", "Oberoesterreich");
        otherRegion = region("AT-NO", "Niederoesterreich");
        storeInRegion = store("LEO-1", region);
        otherStore = store("LEO-2", region);
        storeInOtherRegion = store("NOE-1", otherRegion);
        when(adminAccessService.currentUser()).thenReturn(new CurrentAdminUser("admin", "admin", null, AdminRole.ADMIN, null));
        when(adminAccessService.effectiveStoreFilter(any())).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void listIssuesExactlyTwoRepositoryQueriesForAllBeacons() {
        BeaconEntity b2 = beacon("b-2");
        BeaconEntity a1 = beacon("A-1");
        BeaconEntity c3 = beacon("c-3");
        when(beaconRepository.listByStatusAndQuery(RecordStatus.ACTIVE, null)).thenReturn(List.of(b2, a1, c3));
        when(beaconRepository.listActiveAssignmentsForBeacons(anyCollection())).thenReturn(List.of(
                assignment(b2, storeInRegion),
                assignment(c3, otherStore)));

        List<BeaconDtos.BeaconResponse> result = service.listBeacons(null, null, null, null);

        assertEquals(List.of("A-1", "b-2", "c-3"), result.stream().map(BeaconDtos.BeaconResponse::beaconCode).toList());
        assertNull(result.get(0).currentStore());
        assertEquals(storeInRegion.id, result.get(1).currentStore().id());
        assertEquals("LEO-1", result.get(1).currentStore().storeCode());
        assertEquals(region.id, result.get(1).currentStore().regionId());
        assertEquals("ACTIVE", result.get(0).status());

        verify(beaconRepository, times(1)).listByStatusAndQuery(RecordStatus.ACTIVE, null);
        verify(beaconRepository, times(1)).listActiveAssignmentsForBeacons(List.of(b2.id, a1.id, c3.id));
        verifyNoInteractions(storeRepository);
        verifyNoInteractions(beaconAssignmentRepository);
    }

    @Test
    void regionManagerSeesUnassignedBeaconsAndBeaconsOfOwnRegionOnly() {
        UserAccessAssignmentEntity assignment = new UserAccessAssignmentEntity();
        assignment.region = region;
        when(adminAccessService.currentUser()).thenReturn(new CurrentAdminUser("rm", "rm", null, AdminRole.REGION_MANAGER, assignment));
        BeaconEntity own = beacon("OWN-1");
        BeaconEntity unassigned = beacon("FREE-1");
        BeaconEntity foreign = beacon("FOREIGN-1");
        when(beaconRepository.listByStatusAndQuery(RecordStatus.ACTIVE, null)).thenReturn(List.of(own, unassigned, foreign));
        when(beaconRepository.listActiveAssignmentsForBeacons(anyCollection())).thenReturn(List.of(
                assignment(own, storeInRegion),
                assignment(foreign, storeInOtherRegion)));

        List<BeaconDtos.BeaconResponse> result = service.listBeacons(null, null, null, null);

        assertEquals(List.of("FREE-1", "OWN-1"), result.stream().map(BeaconDtos.BeaconResponse::beaconCode).toList());
        verify(beaconRepository, times(1)).listByStatusAndQuery(RecordStatus.ACTIVE, null);
        verify(beaconRepository, times(1)).listActiveAssignmentsForBeacons(anyCollection());
        verifyNoInteractions(storeRepository);
    }

    @Test
    void storeManagerSeesOnlyBeaconsOfOwnStore() {
        UserAccessAssignmentEntity assignment = new UserAccessAssignmentEntity();
        assignment.store = storeInRegion;
        assignment.region = region;
        when(adminAccessService.currentUser()).thenReturn(new CurrentAdminUser("sm", "sm", null, AdminRole.STORE_MANAGER, assignment));
        when(adminAccessService.effectiveStoreFilter(null)).thenReturn(storeInRegion.id);
        BeaconEntity own = beacon("S-1");
        BeaconEntity sibling = beacon("S-2");
        BeaconEntity unassigned = beacon("S-3");
        when(beaconRepository.listByStatusAndQuery(RecordStatus.ACTIVE, null)).thenReturn(List.of(own, sibling, unassigned));
        when(beaconRepository.listActiveAssignmentsForBeacons(anyCollection())).thenReturn(List.of(
                assignment(own, storeInRegion),
                assignment(sibling, otherStore)));

        List<BeaconDtos.BeaconResponse> result = service.listBeacons(null, null, null, null);

        assertEquals(List.of("S-1"), result.stream().map(BeaconDtos.BeaconResponse::beaconCode).toList());
        verify(beaconRepository, times(1)).listByStatusAndQuery(RecordStatus.ACTIVE, null);
        verify(beaconRepository, times(1)).listActiveAssignmentsForBeacons(anyCollection());
        verifyNoInteractions(storeRepository);
    }

    @Test
    void assignedFilterIsAppliedToTheTwoQueryResult() {
        BeaconEntity assigned = beacon("x-1");
        BeaconEntity free = beacon("x-2");
        when(beaconRepository.listByStatusAndQuery(RecordStatus.ACTIVE, null)).thenReturn(List.of(assigned, free));
        when(beaconRepository.listActiveAssignmentsForBeacons(anyCollection())).thenReturn(List.of(assignment(assigned, storeInRegion)));

        List<BeaconDtos.BeaconResponse> unassigned = service.listBeacons(null, false, null, null);

        assertEquals(List.of("x-2"), unassigned.stream().map(BeaconDtos.BeaconResponse::beaconCode).toList());
        verify(beaconRepository, times(1)).listByStatusAndQuery(RecordStatus.ACTIVE, null);
        verify(beaconRepository, times(1)).listActiveAssignmentsForBeacons(anyCollection());
    }

    @Test
    void emptyBeaconListStillIssuesBoundedQueries() {
        when(beaconRepository.listByStatusAndQuery(RecordStatus.ACTIVE, null)).thenReturn(List.of());

        assertTrue(service.listBeacons(null, null, null, null).isEmpty());

        verify(beaconRepository, times(1)).listByStatusAndQuery(RecordStatus.ACTIVE, null);
        verify(beaconRepository, times(1)).listActiveAssignmentsForBeacons(List.of());
    }

    @Test
    void textSearchIsPassedLowerCasedAndWrappedInWildcards() {
        when(beaconRepository.listByStatusAndQuery(any(), any())).thenReturn(List.of());

        service.listBeacons(RecordStatus.ARCHIVED, null, null, "  AB-1 ");

        verify(beaconRepository, times(1)).listByStatusAndQuery(RecordStatus.ARCHIVED, "%ab-1%");
    }

    private BeaconAssignmentEntity assignment(BeaconEntity beacon, StoreEntity store) {
        BeaconAssignmentEntity assignment = new BeaconAssignmentEntity();
        assignment.id = UUID.randomUUID();
        assignment.beacon = beacon;
        assignment.store = store;
        assignment.isActive = true;
        return assignment;
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

    private RegionEntity region(String code, String name) {
        RegionEntity region = new RegionEntity();
        region.id = UUID.randomUUID();
        region.code = code;
        region.name = name;
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
