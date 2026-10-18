package at.htl.admin.service;

import at.htl.admin.entity.AuditLogEntity;
import at.htl.admin.repository.AuditLogRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.ws.rs.ForbiddenException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class AuditLogServiceTest {

    private static final UUID ENTITY_ID = UUID.fromString("12121212-1212-1212-1212-121212121212");

    AuditLogService service;
    AuditLogRepository repository;
    SecurityIdentity identity;
    AdminAccessService adminAccessService;

    @BeforeEach
    void setUp() {
        service = new AuditLogService();
        repository = mock(AuditLogRepository.class);
        identity = mock(SecurityIdentity.class);
        adminAccessService = mock(AdminAccessService.class);
        service.auditLogRepository = repository;
        service.objectMapper = new ObjectMapper();
        service.identity = identity;
        service.adminAccessService = adminAccessService;
    }

    @Test
    void adminIdentityIsStoredWithRoleUsernameAndSubject() {
        when(identity.isAnonymous()).thenReturn(false);
        when(adminAccessService.currentUser()).thenReturn(
                new CurrentAdminUser("keycloak-sub-42", "indooro-admin", "admin@indooro.local", AdminRole.ADMIN, null));

        service.log("RECIPE", ENTITY_ID, "CREATE", "Rezept angelegt", null, null);

        AuditLogEntity entry = persistedEntry();
        assertEquals("admin", entry.actorRole);
        assertEquals("indooro-admin", entry.actorLabel);
        assertEquals("keycloak-sub-42", entry.actorSubject);
    }

    @Test
    void storeManagerIdentityKeepsItsOwnRole() {
        when(identity.isAnonymous()).thenReturn(false);
        when(adminAccessService.currentUser()).thenReturn(
                new CurrentAdminUser("keycloak-sub-7", "indooro-store", null, AdminRole.STORE_MANAGER, null));

        service.log("LAYOUT", ENTITY_ID, "CREATE", "Layout-Version gespeichert", null, null);

        AuditLogEntity entry = persistedEntry();
        assertEquals("store-manager", entry.actorRole);
        assertEquals("indooro-store", entry.actorLabel);
        assertEquals("keycloak-sub-7", entry.actorSubject);
    }

    @Test
    void anonymousIdentityIsStoredAsSystemWithoutResolvingAnyUser() {
        when(identity.isAnonymous()).thenReturn(true);

        service.log("PRODUCT", ENTITY_ID, "UPSERT", "Produkt gespeichert", null, null);

        AuditLogEntity entry = persistedEntry();
        assertEquals("SYSTEM", entry.actorRole);
        assertEquals("system", entry.actorLabel);
        assertNull(entry.actorSubject);
        verifyNoInteractions(adminAccessService);
    }

    @Test
    void unresolvableIdentityFallsBackToSystemInsteadOfThrowing() {
        when(identity.isAnonymous()).thenReturn(false);
        when(adminAccessService.currentUser())
                .thenThrow(new ForbiddenException("Kein aktiver Indooro Admin-Zugriff fuer diesen Benutzer."));

        service.log("BEACON", ENTITY_ID, "CREATE", "Beacon angelegt", null, null);

        AuditLogEntity entry = persistedEntry();
        assertEquals("SYSTEM", entry.actorRole);
        assertEquals("system", entry.actorLabel);
        assertNull(entry.actorSubject);
    }

    @Test
    void missingSecurityIdentityFallsBackToSystem() {
        service.identity = null;

        service.log("STORE", ENTITY_ID, "ARCHIVE", "Filiale archiviert", null, null);

        AuditLogEntity entry = persistedEntry();
        assertEquals("SYSTEM", entry.actorRole);
        assertNull(entry.actorSubject);
    }

    @Test
    void logByAdminStoresTheSubjectOfTheGivenAdmin() {
        service.logByAdmin(new CurrentAdminUser("keycloak-sub-9", "indooro-region", null, AdminRole.REGION_MANAGER, null),
                "PRODUCT_CATALOG", ENTITY_ID, "BULK_IMPORT", "1 gespeichert, 0 fehlgeschlagen", null, null);

        AuditLogEntity entry = persistedEntry();
        assertEquals("region-manager", entry.actorRole);
        assertEquals("indooro-region", entry.actorLabel);
        assertEquals("keycloak-sub-9", entry.actorSubject);
    }

    @Test
    void currentActorMatchesTheActorStoredByLog() {
        when(identity.isAnonymous()).thenReturn(false);
        when(adminAccessService.currentUser()).thenReturn(
                new CurrentAdminUser("keycloak-sub-1", "indooro-admin", null, AdminRole.ADMIN, null));

        AuditLogService.Actor actor = service.currentActor();

        assertEquals(new AuditLogService.Actor("admin", "indooro-admin", "keycloak-sub-1"), actor);
    }

    @Test
    void subjectIsCappedToTheColumnLength() {
        String longSubject = "s".repeat(150);
        service.logByAdmin(new CurrentAdminUser(longSubject, "indooro-admin", null, AdminRole.ADMIN, null),
                "STORE", ENTITY_ID, "UPDATE", "Filiale aktualisiert", null, null);

        assertEquals(120, persistedEntry().actorSubject.length());
    }

    private AuditLogEntity persistedEntry() {
        ArgumentCaptor<AuditLogEntity> captor = ArgumentCaptor.forClass(AuditLogEntity.class);
        verify(repository).persist(captor.capture());
        return captor.getValue();
    }
}
