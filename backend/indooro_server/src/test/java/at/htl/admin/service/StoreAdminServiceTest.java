package at.htl.admin.service;

import at.htl.admin.entity.LayoutVersionStatus;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.AuditLogRepository;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.RegionRepository;
import at.htl.admin.repository.StoreRepository;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Sort;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
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

    private void assertLayoutFilter(boolean hasActiveLayout, String expectedPredicate) {
        StoreAdminService service = new StoreAdminService();
        StoreRepository storeRepository = mock(StoreRepository.class);
        PanacheQuery<StoreEntity> query = mock(PanacheQuery.class);
        service.storeRepository = storeRepository;
        service.regionRepository = mock(RegionRepository.class);
        service.beaconAssignmentRepository = mock(BeaconAssignmentRepository.class);
        service.layoutVersionRepository = mock(LayoutVersionRepository.class);
        service.auditLogRepository = mock(AuditLogRepository.class);
        service.auditLogService = mock(AuditLogService.class);
        service.adminAccessService = mock(AdminAccessService.class);

        when(storeRepository.find(anyString(), any(Sort.class), anyMap())).thenReturn(query);
        when(query.list()).thenReturn(List.of());
        when(query.count()).thenReturn(3L);

        var result = service.listStores(null, null, RecordStatus.ACTIVE, hasActiveLayout, 1, 2);

        ArgumentCaptor<String> queryCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Map<String, Object>> paramsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(storeRepository).find(queryCaptor.capture(), any(Sort.class), paramsCaptor.capture());
        assertTrue(queryCaptor.getValue().contains(expectedPredicate));
        assertTrue(queryCaptor.getValue().contains("lv.store.id = s.id"));
        assertEquals(LayoutVersionStatus.ACTIVE, paramsCaptor.getValue().get("layoutStatus"));
        assertEquals(3L, result.totalElements());
        assertEquals(1, result.page());
        assertEquals(2, result.size());
    }
}
