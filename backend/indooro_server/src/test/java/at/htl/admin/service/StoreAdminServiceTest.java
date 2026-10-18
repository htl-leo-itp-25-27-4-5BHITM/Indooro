package at.htl.admin.service;

import at.htl.admin.entity.LayoutVersionStatus;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.RegionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.AuditLogRepository;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.RegionRepository;
import at.htl.admin.repository.StoreRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StoreAdminServiceTest {

    @Test
    void filtersStoresWithActiveLayoutsInDatabaseAndUsesFilteredCount() {
        assertLayoutFilter(true, "exists");
    }

    @Test
    void filtersStoresWithoutActiveLayoutsInDatabaseAndUsesFilteredCount() {
        assertLayoutFilter(false, "not exists");
    }

    @Test
    void summariesUseOneGroupedQueryPerPageInsteadOfPerStoreLookups() {
        StoreAdminService service = new StoreAdminService();
        StoreRepository storeRepository = mock(StoreRepository.class);
        BeaconAssignmentRepository beaconAssignmentRepository = mock(BeaconAssignmentRepository.class);
        LayoutVersionRepository layoutVersionRepository = mock(LayoutVersionRepository.class);
        service.storeRepository = storeRepository;
        service.regionRepository = mock(RegionRepository.class);
        service.beaconAssignmentRepository = beaconAssignmentRepository;
        service.layoutVersionRepository = layoutVersionRepository;
        service.auditLogRepository = mock(AuditLogRepository.class);
        service.auditLogService = mock(AuditLogService.class);
        service.adminAccessService = mock(AdminAccessService.class);

        RegionEntity region = new RegionEntity();
        region.id = UUID.randomUUID();
        region.code = "AT-OO";
        region.name = "Oberoesterreich";
        StoreEntity first = store("LEO-1", region);
        StoreEntity second = store("LEO-2", region);
        StoreEntity third = store("LEO-3", region);
        List<UUID> pageIds = List.of(first.id, second.id, third.id);

        when(storeRepository.listPageIds(anyString(), anyMap(), anyString(), eq(0), eq(20))).thenReturn(pageIds);
        when(storeRepository.countWhere(anyString(), anyMap())).thenReturn(3L);
        when(storeRepository.listWithRegionByIds(pageIds)).thenReturn(List.of(third, first, second));
        when(beaconAssignmentRepository.countActiveByStoreIds(pageIds)).thenReturn(Map.of(first.id, 2L, third.id, 5L));
        when(layoutVersionRepository.listStoreIdsWithActiveLayout(pageIds)).thenReturn(Set.of(second.id, third.id));

        var result = service.listStores(null, null, null, null, null, 0, 20);

        assertEquals(List.of("LEO-1", "LEO-2", "LEO-3"), result.content().stream().map(s -> s.storeCode()).toList());
        assertEquals(2L, result.content().get(0).activeBeaconCount());
        assertEquals(false, result.content().get(0).hasActiveLayout());
        assertEquals(0L, result.content().get(1).activeBeaconCount());
        assertEquals(true, result.content().get(1).hasActiveLayout());
        assertEquals(5L, result.content().get(2).activeBeaconCount());
        assertEquals(true, result.content().get(2).hasActiveLayout());
        assertEquals(region.id, result.content().get(0).region().id());
        assertEquals(3L, result.totalElements());

        verify(storeRepository, times(1)).listWithRegionByIds(pageIds);
        verify(beaconAssignmentRepository, times(1)).countActiveByStoreIds(pageIds);
        verify(layoutVersionRepository, times(1)).listStoreIdsWithActiveLayout(pageIds);
        verify(beaconAssignmentRepository, never()).countActiveByStore(any());
        verify(layoutVersionRepository, never()).findActiveByStoreId(any());
    }

    private void assertLayoutFilter(boolean hasActiveLayout, String expectedPredicate) {
        StoreAdminService service = new StoreAdminService();
        StoreRepository storeRepository = mock(StoreRepository.class);
        service.storeRepository = storeRepository;
        service.regionRepository = mock(RegionRepository.class);
        service.beaconAssignmentRepository = mock(BeaconAssignmentRepository.class);
        service.layoutVersionRepository = mock(LayoutVersionRepository.class);
        service.auditLogRepository = mock(AuditLogRepository.class);
        service.auditLogService = mock(AuditLogService.class);
        service.adminAccessService = mock(AdminAccessService.class);

        when(storeRepository.listPageIds(anyString(), anyMap(), anyString(), anyInt(), anyInt())).thenReturn(List.of());
        when(storeRepository.countWhere(anyString(), anyMap())).thenReturn(3L);

        var result = service.listStores(null, null, RecordStatus.ACTIVE, hasActiveLayout, "city", 1, 2);

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Map<String, Object>> paramsCaptor = ArgumentCaptor.forClass(Map.class);
        ArgumentCaptor<String> orderCaptor = ArgumentCaptor.forClass(String.class);
        verify(storeRepository).listPageIds(queryCaptor.capture(), paramsCaptor.capture(), orderCaptor.capture(), eq(1), eq(2));
        verify(storeRepository).countWhere(queryCaptor.getValue(), paramsCaptor.getValue());
        assertEquals("s.city asc, s.storeCode asc, s.id asc", orderCaptor.getValue());
        assertTrue(queryCaptor.getValue().contains(expectedPredicate));
        assertTrue(queryCaptor.getValue().contains("lv.store.id = s.id"));
        assertEquals(LayoutVersionStatus.ACTIVE, paramsCaptor.getValue().get("layoutStatus"));
        assertEquals(3L, result.totalElements());
        assertEquals(1, result.page());
        assertEquals(2, result.size());
    }

    @Test
    void rejectsUnknownSortFieldBeforeQueryExecution() {
        StoreAdminService service = new StoreAdminService();
        assertEquals(400, assertThrows(jakarta.ws.rs.WebApplicationException.class,
                () -> service.listStores(null, null, null, null, "name; delete", 0, 20)).getResponse().getStatus());
    }

    private StoreEntity store(String storeCode, RegionEntity region) {
        StoreEntity store = new StoreEntity();
        store.id = UUID.randomUUID();
        store.storeCode = storeCode;
        store.name = "Filiale " + storeCode;
        store.city = "Linz";
        store.status = RecordStatus.ACTIVE;
        store.region = region;
        return store;
    }
}
