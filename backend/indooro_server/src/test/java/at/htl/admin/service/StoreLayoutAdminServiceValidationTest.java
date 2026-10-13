package at.htl.admin.service;

import at.htl.admin.dto.LayoutDtos;
import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.service.LayoutDocumentValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.Test;

import java.util.UUID;
import java.util.Optional;
import java.util.List;
import org.mockito.ArgumentCaptor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class StoreLayoutAdminServiceValidationTest {

    @Test
    void invalidStoreLayoutIsRejectedBeforeAnyVersionWrite() throws Exception {
        StoreLayoutAdminService service = new StoreLayoutAdminService();
        service.layoutDocumentValidator = new LayoutDocumentValidator();
        service.adminAccessService = mock(AdminAccessService.class);
        service.storeAdminService = mock(StoreAdminService.class);
        service.layoutVersionRepository = mock(LayoutVersionRepository.class);

        var malformedLayout = new ObjectMapper().readTree("{\"gridSize\":{\"width\":40,\"height\":60},\"elements\":{}}");
        var request = new LayoutDtos.LayoutSaveRequest("Store", null, false, malformedLayout);

        WebApplicationException exception = assertThrows(WebApplicationException.class,
                () -> service.saveLayoutVersion(UUID.randomUUID(), request));

        assertEquals(400, exception.getResponse().getStatus());
        verifyNoInteractions(service.storeAdminService, service.layoutVersionRepository);
    }

    @Test
    void validStoreLayoutReachesRepositoryUnchanged() throws Exception {
        StoreLayoutAdminService service = new StoreLayoutAdminService();
        service.layoutDocumentValidator = new LayoutDocumentValidator();
        service.adminAccessService = mock(AdminAccessService.class);
        service.storeAdminService = mock(StoreAdminService.class);
        service.layoutVersionRepository = mock(LayoutVersionRepository.class);
        service.auditLogService = mock(AuditLogService.class);
        service.beaconAssignmentRepository = mock(BeaconAssignmentRepository.class);
        service.objectMapper = new ObjectMapper();

        UUID storeId = UUID.randomUUID();
        StoreEntity store = new StoreEntity();
        store.id = storeId;
        store.name = "Indooro";
        when(service.storeAdminService.lockStore(storeId)).thenReturn(store);
        when(service.layoutVersionRepository.findActiveByStoreId(storeId)).thenReturn(Optional.empty());
        when(service.layoutVersionRepository.nextVersionNo(storeId)).thenReturn(1);
        when(service.beaconAssignmentRepository.listActiveByStoreId(storeId)).thenReturn(List.of());

        var layout = service.objectMapper.readTree("{\"shopName\":\"Indooro\",\"gridSize\":{\"width\":40,\"height\":60},\"elements\":[{\"id\":1,\"type\":\"shelf\",\"x\":1,\"y\":2,\"width\":3,\"height\":4}],\"exportDate\":\"2026-10-11\"}");
        var request = new LayoutDtos.LayoutSaveRequest("Store", null, true, layout);

        service.saveLayoutVersion(storeId, request);

        ArgumentCaptor<LayoutVersionEntity> persisted = ArgumentCaptor.forClass(LayoutVersionEntity.class);
        verify(service.layoutVersionRepository).persist(persisted.capture());
        assertEquals(layout, persisted.getValue().layoutJson);
    }
}
