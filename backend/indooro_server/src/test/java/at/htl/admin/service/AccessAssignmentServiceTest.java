package at.htl.admin.service;

import at.htl.admin.dto.AccessAssignmentDtos;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.RegionEntity;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.entity.UserAccessAssignmentEntity;
import at.htl.admin.entity.UserAccessStatus;
import at.htl.admin.repository.RegionRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.repository.UserAccessAssignmentRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.persistence.PersistenceException;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.mockito.ArgumentCaptor;

import java.security.Principal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Validation, uniqueness, audit and role checks of the access assignment service without a database. */
class AccessAssignmentServiceTest {

    private static final String ADMIN_SUBJECT = "admin-subject";
    private static final String NEW_SUBJECT = "6d1f0c2e-1b7a-4c55-9a0e-3f3b8d2a9e11";

    private final UUID regionId = UUID.fromString("a1a1a1a1-0000-0000-0000-000000000001");
    private final UUID storeId = UUID.fromString("b1b1b1b1-0000-0000-0000-000000000001");
    private final UUID otherStoreId = UUID.fromString("b1b1b1b1-0000-0000-0000-000000000002");
    private final UUID archivedStoreId = UUID.fromString("b1b1b1b1-0000-0000-0000-000000000003");

    private UserAccessAssignmentRepository assignments;
    private StoreRepository stores;
    private AdminAccessService access;
    private AuditLogService audit;
    private AccessAssignmentService service;
    private RegionEntity region;
    private StoreEntity store;
    private StoreEntity otherStore;

    @BeforeEach
    void setUp() {
        region = new RegionEntity();
        region.id = regionId;
        region.code = "AT-OO";
        region.name = "Oberösterreich";
        region.status = RecordStatus.ACTIVE;
        store = store(storeId, "SPAR-Leonding-002", RecordStatus.ACTIVE);
        otherStore = store(otherStoreId, "SPAR-Linz-001", RecordStatus.ACTIVE);
        StoreEntity archived = store(archivedStoreId, "OLD-001", RecordStatus.ARCHIVED);

        assignments = mock(UserAccessAssignmentRepository.class);
        when(assignments.findActiveBySubject(anyString())).thenReturn(Optional.empty());
        doAnswer(invocation -> {
            UserAccessAssignmentEntity entity = invocation.getArgument(0);
            entity.id = UUID.randomUUID();
            return null;
        }).when(assignments).persist(any(UserAccessAssignmentEntity.class));

        RegionRepository regions = mock(RegionRepository.class);
        when(regions.findByIdOptional(any(UUID.class))).thenAnswer(invocation ->
                regionId.equals(invocation.getArgument(0)) ? Optional.of(region) : Optional.empty());

        stores = mock(StoreRepository.class);
        when(stores.findByIdOptional(any(UUID.class))).thenAnswer(invocation -> {
            UUID id = invocation.getArgument(0);
            if (storeId.equals(id)) return Optional.of(store);
            if (otherStoreId.equals(id)) return Optional.of(otherStore);
            if (archivedStoreId.equals(id)) return Optional.of(archived);
            return Optional.empty();
        });

        access = mock(AdminAccessService.class);
        when(access.currentUser()).thenReturn(new CurrentAdminUser(ADMIN_SUBJECT, "indooro-admin", null, AdminRole.ADMIN, null));
        audit = mock(AuditLogService.class);

        service = new AccessAssignmentService();
        service.assignmentRepository = assignments;
        service.regionRepository = regions;
        service.storeRepository = stores;
        service.adminAccessService = access;
        service.auditLogService = audit;
    }

    @Test
    void storeManagerNeedsAStore() {
        assertBadRequest(() -> service.createAssignment(request("store-manager", null, null)), "braucht einen Markt");
    }

    @Test
    void storeManagerGetsNoRegion() {
        assertBadRequest(() -> service.createAssignment(request("store-manager", regionId, storeId)), "keine Region");
    }

    @Test
    void regionManagerNeedsARegion() {
        assertBadRequest(() -> service.createAssignment(request("region-manager", null, null)), "braucht eine Region");
    }

    @Test
    void regionManagerGetsNoStore() {
        assertBadRequest(() -> service.createAssignment(request("region-manager", regionId, storeId)), "keinen Markt");
    }

    @Test
    void adminHasNoScope() {
        assertBadRequest(() -> service.createAssignment(request("admin", null, storeId)), "keine Region und keinen Markt");
    }

    @Test
    void unknownRoleIsRejected() {
        assertBadRequest(() -> service.createAssignment(request("guest", null, null)), "Unbekannte Rolle");
    }

    @Test
    void unknownOrArchivedStoreIsRejected() {
        assertBadRequest(() -> service.createAssignment(request("store-manager", null, UUID.randomUUID())), "Markt nicht gefunden");
        assertBadRequest(() -> service.createAssignment(request("store-manager", null, archivedStoreId)), "archiviert");
    }

    @Test
    void unknownRegionIsRejected() {
        assertBadRequest(() -> service.createAssignment(request("region-manager", UUID.randomUUID(), null)), "Region nicht gefunden");
    }

    @Test
    void subjectWithWhitespaceIsRejected() {
        var request = new AccessAssignmentDtos.AccessAssignmentCreateRequest("abc def", "marta", null, "store-manager", null, storeId);
        assertBadRequest(() -> service.createAssignment(request), "Leerzeichen");
    }

    @Test
    void secondActiveAssignmentForTheSameSubjectIsAConflict() {
        UserAccessAssignmentEntity existing = new UserAccessAssignmentEntity();
        existing.keycloakSubject = NEW_SUBJECT;
        when(assignments.findActiveBySubject(NEW_SUBJECT)).thenReturn(Optional.of(existing));

        WebApplicationException error = assertThrows(WebApplicationException.class,
                () -> service.createAssignment(request("store-manager", null, storeId)));

        assertEquals(409, error.getResponse().getStatus());
        verify(assignments, never()).persist(any(UserAccessAssignmentEntity.class));
        verify(audit, never()).log(anyString(), any(), anyString(), anyString(), any(), any());
    }

    @Test
    void concurrentInsertHittingTheUniqueIndexIsAConflict() {
        doThrow(new PersistenceException("uk_user_access_active_subject")).when(assignments).flush();

        WebApplicationException error = assertThrows(WebApplicationException.class,
                () -> service.createAssignment(request("store-manager", null, storeId)));

        assertEquals(409, error.getResponse().getStatus());
        verify(audit, never()).log(anyString(), any(), anyString(), anyString(), any(), any());
    }

    @Test
    void nonAdminCannotListCreateOrDeactivate() {
        doThrow(new ForbiddenException("nur admin")).when(access).requireAdmin();
        when(access.currentUser()).thenReturn(new CurrentAdminUser("store-subject", "store", null, AdminRole.STORE_MANAGER, null));

        assertThrows(ForbiddenException.class, () -> service.listAssignments(null));
        assertThrows(ForbiddenException.class, () -> service.createAssignment(request("store-manager", null, storeId)));
        assertThrows(ForbiddenException.class, () -> service.deactivateAssignment(UUID.randomUUID()));
        verify(assignments, never()).persist(any(UserAccessAssignmentEntity.class));
        verify(audit, never()).log(anyString(), any(), anyString(), anyString(), any(), any());
    }

    @Test
    void createsStoreManagerForOneStoreAndWritesTheAuditLog() {
        var request = new AccessAssignmentDtos.AccessAssignmentCreateRequest(
                "  " + NEW_SUBJECT + " ", " marta ", " ", "Store-Manager", null, storeId);

        AccessAssignmentDtos.AccessAssignmentResponse response = service.createAssignment(request);

        ArgumentCaptor<UserAccessAssignmentEntity> saved = ArgumentCaptor.forClass(UserAccessAssignmentEntity.class);
        verify(assignments).persist(saved.capture());
        verify(assignments).flush();
        UserAccessAssignmentEntity entity = saved.getValue();
        assertEquals(NEW_SUBJECT, entity.keycloakSubject);
        assertEquals("marta", entity.username);
        assertNull(entity.email);
        assertEquals("store-manager", entity.role);
        assertEquals(store, entity.store);
        assertNull(entity.region);
        assertEquals(UserAccessStatus.ACTIVE, entity.status);

        assertEquals(storeId, response.storeId());
        assertEquals("SPAR-Leonding-002", response.storeCode());
        assertEquals("ACTIVE", response.status());
        ArgumentCaptor<String> summary = ArgumentCaptor.forClass(String.class);
        verify(audit).log(eq("USER_ACCESS"), eq(entity.id), eq("CREATE"), summary.capture(), isNull(), eq(response));
        assertTrue(summary.getValue().contains("marta"));
        assertTrue(summary.getValue().contains("SPAR-Leonding-002"));
    }

    @Test
    void createsRegionManagerForOneRegion() {
        AccessAssignmentDtos.AccessAssignmentResponse response = service.createAssignment(request("region-manager", regionId, null));

        assertEquals(regionId, response.regionId());
        assertEquals("Oberösterreich", response.regionName());
        assertNull(response.storeId());
    }

    /** The row the admin creates is the row AdminAccessService scopes by: the new store manager sees only the assigned store. */
    @Test
    void createdStoreManagerSeesOnlyTheAssignedStore() {
        service.createAssignment(request("store-manager", null, storeId));
        ArgumentCaptor<UserAccessAssignmentEntity> saved = ArgumentCaptor.forClass(UserAccessAssignmentEntity.class);
        verify(assignments).persist(saved.capture());

        UserAccessAssignmentRepository lookup = mock(UserAccessAssignmentRepository.class);
        when(lookup.findActiveBySubject(NEW_SUBJECT)).thenReturn(Optional.of(saved.getValue()));
        SecurityIdentity identity = mock(SecurityIdentity.class);
        Principal principal = () -> NEW_SUBJECT;
        when(identity.isAnonymous()).thenReturn(false);
        when(identity.getPrincipal()).thenReturn(principal);
        when(identity.hasRole("store-manager")).thenReturn(true);
        AdminAccessService scoped = new AdminAccessService();
        scoped.identity = identity;
        scoped.accessAssignmentRepository = lookup;
        scoped.storeRepository = stores;

        assertEquals(AdminRole.STORE_MANAGER, scoped.currentUser().role());
        assertEquals(storeId, scoped.effectiveStoreFilter(null));
        assertEquals(regionId, scoped.effectiveRegionFilter(null));
        scoped.requireStoreAccess(storeId);
        assertThrows(ForbiddenException.class, () -> scoped.requireStoreAccess(otherStoreId));
        assertThrows(ForbiddenException.class, () -> scoped.effectiveStoreFilter(otherStoreId));
    }

    @Test
    void deactivatesAnotherUsersAssignmentAndWritesTheAuditLog() {
        UserAccessAssignmentEntity entity = assignment("someone-else", UserAccessStatus.ACTIVE);
        when(assignments.findByIdWithScope(entity.id)).thenReturn(Optional.of(entity));

        AccessAssignmentDtos.AccessAssignmentResponse response = service.deactivateAssignment(entity.id);

        assertEquals("DISABLED", response.status());
        assertEquals(UserAccessStatus.DISABLED, entity.status);
        ArgumentCaptor<AccessAssignmentDtos.AccessAssignmentResponse> before = ArgumentCaptor.forClass(AccessAssignmentDtos.AccessAssignmentResponse.class);
        verify(audit).log(eq("USER_ACCESS"), eq(entity.id), eq("DEACTIVATE"), anyString(), before.capture(), eq(response));
        assertEquals("ACTIVE", before.getValue().status());
    }

    @Test
    void ownAssignmentCannotBeDeactivated() {
        UserAccessAssignmentEntity own = assignment(ADMIN_SUBJECT, UserAccessStatus.ACTIVE);
        when(assignments.findByIdWithScope(own.id)).thenReturn(Optional.of(own));

        WebApplicationException error = assertThrows(WebApplicationException.class, () -> service.deactivateAssignment(own.id));

        assertEquals(409, error.getResponse().getStatus());
        assertEquals(UserAccessStatus.ACTIVE, own.status);
        verify(audit, never()).log(anyString(), any(), anyString(), anyString(), any(), any());
    }

    @Test
    void deactivatingADisabledAssignmentChangesNothing() {
        UserAccessAssignmentEntity disabled = assignment("someone-else", UserAccessStatus.DISABLED);
        when(assignments.findByIdWithScope(disabled.id)).thenReturn(Optional.of(disabled));

        assertEquals("DISABLED", service.deactivateAssignment(disabled.id).status());
        verify(audit, never()).log(anyString(), any(), anyString(), anyString(), any(), any());
    }

    @Test
    void unknownAssignmentIsNotFound() {
        when(assignments.findByIdWithScope(any())).thenReturn(Optional.empty());
        assertThrows(NotFoundException.class, () -> service.deactivateAssignment(UUID.randomUUID()));
    }

    @Test
    void listPassesTheStatusFilterThrough() {
        UserAccessAssignmentEntity entity = assignment("someone-else", UserAccessStatus.ACTIVE);
        when(assignments.listWithScope(UserAccessStatus.ACTIVE)).thenReturn(List.of(entity));

        var result = service.listAssignments(UserAccessStatus.ACTIVE);

        assertEquals(1, result.size());
        assertEquals("SPAR-Leonding-002", result.get(0).storeCode());
    }

    private AccessAssignmentDtos.AccessAssignmentCreateRequest request(String role, UUID region, UUID storeIdValue) {
        return new AccessAssignmentDtos.AccessAssignmentCreateRequest(NEW_SUBJECT, "marta", "marta@example.test", role, region, storeIdValue);
    }

    private UserAccessAssignmentEntity assignment(String subject, UserAccessStatus status) {
        UserAccessAssignmentEntity entity = new UserAccessAssignmentEntity();
        entity.id = UUID.randomUUID();
        entity.keycloakSubject = subject;
        entity.username = "user-" + subject;
        entity.role = "store-manager";
        entity.store = store;
        entity.status = status;
        return entity;
    }

    private StoreEntity store(UUID id, String code, RecordStatus status) {
        StoreEntity entity = new StoreEntity();
        entity.id = id;
        entity.storeCode = code;
        entity.name = "Markt " + code;
        entity.region = region;
        entity.status = status;
        return entity;
    }

    private static void assertBadRequest(Executable call, String messagePart) {
        WebApplicationException error = assertThrows(WebApplicationException.class, call);
        assertEquals(400, error.getResponse().getStatus());
        assertTrue(error.getMessage().contains(messagePart), () -> "message was: " + error.getMessage());
    }
}
