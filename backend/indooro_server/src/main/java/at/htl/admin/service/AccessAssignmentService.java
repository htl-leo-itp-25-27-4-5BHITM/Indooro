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
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Admin-UI access for Keycloak users without SQL: list, create and deactivate rows of
 * {@code user_access_assignments}. Only the role {@code admin} may call it. The Keycloak user itself
 * (and its realm role) is still created in the Keycloak console.
 */
@ApplicationScoped
public class AccessAssignmentService {

    static final String AUDIT_ENTITY = "USER_ACCESS";

    @Inject
    UserAccessAssignmentRepository assignmentRepository;

    @Inject
    RegionRepository regionRepository;

    @Inject
    StoreRepository storeRepository;

    @Inject
    AdminAccessService adminAccessService;

    @Inject
    AuditLogService auditLogService;

    public List<AccessAssignmentDtos.AccessAssignmentResponse> listAssignments(UserAccessStatus status) {
        adminAccessService.requireAdmin();
        return assignmentRepository.listWithScope(status).stream()
                .map(AccessAssignmentService::toResponse)
                .toList();
    }

    @Transactional
    public AccessAssignmentDtos.AccessAssignmentResponse createAssignment(AccessAssignmentDtos.AccessAssignmentCreateRequest request) {
        adminAccessService.requireAdmin();

        String subject = request.keycloakSubject().trim();
        if (subject.isEmpty() || subject.chars().anyMatch(Character::isWhitespace)) {
            throw badRequest("Die Keycloak-ID (sub) darf keine Leerzeichen enthalten.");
        }
        AdminRole role = parseRole(request.role());

        UserAccessAssignmentEntity assignment = new UserAccessAssignmentEntity();
        assignment.keycloakSubject = subject;
        assignment.username = request.username().trim();
        assignment.email = trimToNull(request.email());
        assignment.role = role.value();
        assignment.status = UserAccessStatus.ACTIVE;
        applyScope(assignment, role, request.regionId(), request.storeId());

        if (assignmentRepository.findActiveBySubject(subject).isPresent()) {
            throw conflict("Für diese Keycloak-ID gibt es bereits einen aktiven Zugang. Zuerst den alten Zugang deaktivieren.");
        }

        try {
            assignmentRepository.persist(assignment);
            // Flush here so the partial unique index (one ACTIVE row per subject) answers 409 instead of failing at commit.
            assignmentRepository.flush();
        } catch (PersistenceException exception) {
            throw conflict("Für diese Keycloak-ID gibt es bereits einen aktiven Zugang. Zuerst den alten Zugang deaktivieren.");
        }

        AccessAssignmentDtos.AccessAssignmentResponse response = toResponse(assignment);
        auditLogService.log(AUDIT_ENTITY, assignment.id, "CREATE",
                "Zugang angelegt: " + assignment.username + " (" + assignment.role + scopeLabel(assignment) + ")",
                null, response);
        return response;
    }

    @Transactional
    public AccessAssignmentDtos.AccessAssignmentResponse deactivateAssignment(UUID assignmentId) {
        CurrentAdminUser admin = adminAccessService.currentUser();
        if (admin.role() != AdminRole.ADMIN) {
            throw new ForbiddenException("Diese Aktion ist Administratoren vorbehalten.");
        }

        UserAccessAssignmentEntity assignment = assignmentRepository.findByIdWithScope(assignmentId)
                .orElseThrow(() -> new NotFoundException("Zugang nicht gefunden."));
        if (assignment.status == UserAccessStatus.DISABLED) {
            return toResponse(assignment);
        }
        if (assignment.keycloakSubject.equals(admin.subject())) {
            throw conflict("Den eigenen Zugang kann man nicht deaktivieren.");
        }

        AccessAssignmentDtos.AccessAssignmentResponse before = toResponse(assignment);
        assignment.status = UserAccessStatus.DISABLED;
        AccessAssignmentDtos.AccessAssignmentResponse after = toResponse(assignment);
        auditLogService.log(AUDIT_ENTITY, assignment.id, "DEACTIVATE",
                "Zugang deaktiviert: " + assignment.username + " (" + assignment.role + scopeLabel(assignment) + ")",
                before, after);
        return after;
    }

    private void applyScope(UserAccessAssignmentEntity assignment, AdminRole role, UUID regionId, UUID storeId) {
        switch (role) {
            case ADMIN -> {
                if (regionId != null || storeId != null) {
                    throw badRequest("Ein Admin-Zugang hat keine Region und keinen Markt.");
                }
            }
            case REGION_MANAGER -> {
                if (regionId == null) {
                    throw badRequest("Ein Regionsmanager braucht eine Region.");
                }
                if (storeId != null) {
                    throw badRequest("Ein Regionsmanager bekommt keinen Markt, nur eine Region.");
                }
                assignment.region = requireActiveRegion(regionId);
            }
            case STORE_MANAGER -> {
                if (storeId == null) {
                    throw badRequest("Ein Marktleiter (store-manager) braucht einen Markt.");
                }
                if (regionId != null) {
                    throw badRequest("Ein Marktleiter bekommt keine Region, nur einen Markt.");
                }
                assignment.store = requireActiveStore(storeId);
            }
        }
    }

    private RegionEntity requireActiveRegion(UUID regionId) {
        RegionEntity region = regionRepository.findByIdOptional(regionId)
                .orElseThrow(() -> badRequest("Region nicht gefunden."));
        if (region.status != RecordStatus.ACTIVE) {
            throw badRequest("Die Region ist archiviert.");
        }
        return region;
    }

    private StoreEntity requireActiveStore(UUID storeId) {
        StoreEntity store = storeRepository.findByIdOptional(storeId)
                .orElseThrow(() -> badRequest("Markt nicht gefunden."));
        if (store.status != RecordStatus.ACTIVE) {
            throw badRequest("Der Markt ist archiviert.");
        }
        return store;
    }

    static AdminRole parseRole(String rawRole) {
        String normalized = rawRole == null ? "" : rawRole.trim().toLowerCase(Locale.ROOT);
        for (AdminRole role : AdminRole.values()) {
            if (role.value().equals(normalized)) {
                return role;
            }
        }
        throw badRequest("Unbekannte Rolle. Erlaubt sind admin, region-manager oder store-manager.");
    }

    static AccessAssignmentDtos.AccessAssignmentResponse toResponse(UserAccessAssignmentEntity entity) {
        return new AccessAssignmentDtos.AccessAssignmentResponse(
                entity.id,
                entity.keycloakSubject,
                entity.username,
                entity.email,
                entity.role,
                entity.region == null ? null : entity.region.id,
                entity.region == null ? null : entity.region.name,
                entity.store == null ? null : entity.store.id,
                entity.store == null ? null : entity.store.storeCode,
                entity.store == null ? null : entity.store.name,
                entity.status.name(),
                entity.createdAt,
                entity.updatedAt
        );
    }

    private static String scopeLabel(UserAccessAssignmentEntity assignment) {
        if (assignment.store != null) {
            return ", Markt " + assignment.store.storeCode;
        }
        if (assignment.region != null) {
            return ", Region " + assignment.region.code;
        }
        return "";
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static WebApplicationException badRequest(String message) {
        return new WebApplicationException(message, Response.Status.BAD_REQUEST);
    }

    private static WebApplicationException conflict(String message) {
        return new WebApplicationException(message, Response.Status.CONFLICT);
    }
}
