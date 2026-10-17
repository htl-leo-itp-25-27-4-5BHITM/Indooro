package at.htl.admin.service;

import at.htl.admin.dto.LayoutDtos;
import at.htl.admin.repository.BeaconAssignmentRepository;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.service.LayoutDocumentValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.UUID;
import org.junit.jupiter.api.function.Executable;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * When requireStoreAccess denies the store, every public method of StoreLayoutAdminService must fail with that
 * ForbiddenException before it touches a repository, the validator, the store lookup or the audit log.
 */
class StoreLayoutAdminServiceScopeTest {

    private final UUID storeId = UUID.fromString("77777777-7777-7777-7777-777777777777");
    private final UUID layoutId = UUID.fromString("88888888-8888-8888-8888-888888888888");
    private final ObjectMapper mapper = new ObjectMapper();

    private StoreLayoutAdminService service;
    private LayoutVersionRepository versions;
    private BeaconAssignmentRepository beaconAssignments;
    private StoreAdminService storeAdminService;
    private LayoutDocumentValidator validator;
    private AuditLogService auditLog;

    @BeforeEach
    void setUp() {
        versions = mock(LayoutVersionRepository.class);
        beaconAssignments = mock(BeaconAssignmentRepository.class);
        storeAdminService = mock(StoreAdminService.class);
        validator = mock(LayoutDocumentValidator.class);
        auditLog = mock(AuditLogService.class);

        AdminAccessService access = mock(AdminAccessService.class);
        doThrow(new ForbiddenException("Kein Zugriff auf diese Filiale.")).when(access).requireStoreAccess(storeId);

        service = new StoreLayoutAdminService();
        service.layoutVersionRepository = versions;
        service.beaconAssignmentRepository = beaconAssignments;
        service.storeAdminService = storeAdminService;
        service.objectMapper = mapper;
        service.layoutDocumentValidator = validator;
        service.auditLogService = auditLog;
        service.adminAccessService = access;
    }

    @Test
    void getCurrentLayoutIsDeniedWithoutAnyRead() {
        assertDenied(() -> service.getCurrentLayout(storeId));
    }

    @Test
    void listLayoutVersionsIsDeniedWithoutAnyRead() {
        assertDenied(() -> service.listLayoutVersions(storeId));
    }

    @Test
    void getLayoutVersionIsDeniedWithoutAnyRead() {
        assertDenied(() -> service.getLayoutVersion(storeId, layoutId));
    }

    @Test
    void saveLayoutVersionIsDeniedWithoutPersisting() throws Exception {
        LayoutDtos.LayoutSaveRequest request = new LayoutDtos.LayoutSaveRequest("Entwurf", "Notiz", false,
                mapper.readTree("{\"shopName\":\"Test\",\"gridSize\":{\"width\":10,\"height\":10},\"elements\":[]}"));
        assertDenied(() -> service.saveLayoutVersion(storeId, request));
    }

    @Test
    void activateLayoutVersionIsDeniedWithoutActivating() {
        assertDenied(() -> service.activateLayoutVersion(storeId, layoutId));
    }

    @Test
    void getEditorContextIsDeniedWithoutAnyRead() {
        assertDenied(() -> service.getEditorContext(storeId));
    }

    /** Checks the exception propagates and no collaborator (repositories, store lookup, validator, audit) was touched. */
    private void assertDenied(Executable call) {
        assertThrows(ForbiddenException.class, call);
        verifyNoInteractions(versions, beaconAssignments, storeAdminService, validator, auditLog);
    }
}
