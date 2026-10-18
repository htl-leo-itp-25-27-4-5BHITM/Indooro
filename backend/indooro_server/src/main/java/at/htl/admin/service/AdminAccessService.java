package at.htl.admin.service;

import at.htl.admin.dto.AdminUserDtos;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.entity.UserAccessAssignmentEntity;
import at.htl.admin.repository.StoreRepository;
import at.htl.admin.repository.UserAccessAssignmentRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.ContextNotActiveException;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotAuthorizedException;
import jakarta.ws.rs.NotFoundException;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.UUID;

@ApplicationScoped
public class AdminAccessService {

    @Inject
    SecurityIdentity identity;

    @Inject
    UserAccessAssignmentRepository accessAssignmentRepository;

    @Inject
    StoreRepository storeRepository;

    /** Null outside CDI (unit tests). Without an active request context the user is resolved on every call. */
    @Inject
    Instance<RequestCurrentAdminUser> requestCurrentUser;

    public CurrentAdminUser currentUser() {
        if (identity == null || identity.isAnonymous()) {
            throw new NotAuthorizedException("Admin-Login erforderlich.");
        }

        CurrentAdminUser cached = cachedUser();
        if (cached != null) {
            return cached;
        }
        CurrentAdminUser user = resolveUser();
        rememberUser(user);
        return user;
    }

    private CurrentAdminUser resolveUser() {
        String subject = subject();
        UserAccessAssignmentEntity assignment = accessAssignmentRepository.findActiveBySubject(subject)
                .orElseThrow(() -> new ForbiddenException("Kein aktiver Indooro Admin-Zugriff fuer diesen Benutzer."));
        AdminRole role = AdminRole.fromValue(assignment.role);

        if (!identity.hasRole(role.value())) {
            throw new ForbiddenException("Keycloak-Rolle und Indooro-Zugriffsrolle stimmen nicht ueberein.");
        }

        return new CurrentAdminUser(
                subject,
                claim("preferred_username", assignment.username),
                claim("email", assignment.email),
                role,
                assignment
        );
    }

    private CurrentAdminUser cachedUser() {
        if (requestCurrentUser == null) {
            return null;
        }
        try {
            return requestCurrentUser.get().current();
        } catch (ContextNotActiveException exception) {
            return null;
        }
    }

    private void rememberUser(CurrentAdminUser user) {
        if (requestCurrentUser == null) {
            return;
        }
        try {
            requestCurrentUser.get().remember(user);
        } catch (ContextNotActiveException ignored) {
            // No request scope (scheduled job, startup): nothing to cache for.
        }
    }

    public AdminUserDtos.CurrentUserResponse currentUserResponse() {
        CurrentAdminUser user = currentUser();
        UserAccessAssignmentEntity assignment = user.assignment();
        return new AdminUserDtos.CurrentUserResponse(
                user.subject(),
                user.username(),
                user.email(),
                user.role().value(),
                new AdminUserDtos.ScopeResponse(
                        assignment.region == null ? null : assignment.region.id,
                        assignment.region == null ? null : assignment.region.name,
                        assignment.store == null ? null : assignment.store.id,
                        assignment.store == null ? null : assignment.store.name
                )
        );
    }

    public void requireAdmin() {
        if (currentUser().role() != AdminRole.ADMIN) {
            throw new ForbiddenException("Diese Aktion ist Administratoren vorbehalten.");
        }
    }

    public UUID effectiveRegionFilter(UUID requestedRegionId) {
        CurrentAdminUser user = currentUser();
        if (user.role() == AdminRole.ADMIN) {
            return requestedRegionId;
        }

        UUID scopedRegionId = scopedRegionId(user);
        if (requestedRegionId != null && !requestedRegionId.equals(scopedRegionId)) {
            throw new ForbiddenException("Kein Zugriff auf diese Region.");
        }
        return scopedRegionId;
    }

    public UUID effectiveStoreFilter(UUID requestedStoreId) {
        CurrentAdminUser user = currentUser();
        if (user.role() != AdminRole.STORE_MANAGER) {
            return requestedStoreId;
        }

        UUID scopedStoreId = user.assignment().store.id;
        if (requestedStoreId != null && !requestedStoreId.equals(scopedStoreId)) {
            throw new ForbiddenException("Kein Zugriff auf diese Filiale.");
        }
        return scopedStoreId;
    }

    public void requireRegionAccess(UUID regionId) {
        CurrentAdminUser user = currentUser();
        if (user.role() == AdminRole.ADMIN) {
            return;
        }
        if (!scopedRegionId(user).equals(regionId)) {
            throw new ForbiddenException("Kein Zugriff auf diese Region.");
        }
    }

    public void requireStoreAccess(UUID storeId) {
        CurrentAdminUser user = currentUser();
        if (user.role() == AdminRole.ADMIN) {
            return;
        }

        StoreEntity store = requireStore(storeId);
        if (user.role() == AdminRole.REGION_MANAGER && user.assignment().region.id.equals(store.region.id)) {
            return;
        }
        if (user.role() == AdminRole.STORE_MANAGER && user.assignment().store.id.equals(store.id)) {
            return;
        }
        throw new ForbiddenException("Kein Zugriff auf diese Filiale.");
    }

    public void requireStoreCreateAccess(UUID regionId) {
        CurrentAdminUser user = currentUser();
        if (user.role() == AdminRole.STORE_MANAGER) {
            throw new ForbiddenException("Store-Manager koennen keine neuen Filialen anlegen.");
        }
        if (user.role() == AdminRole.REGION_MANAGER && !user.assignment().region.id.equals(regionId)) {
            throw new ForbiddenException("Kein Zugriff auf diese Region.");
        }
    }

    public void requireStoreMutationAccess(UUID storeId, UUID targetRegionId) {
        CurrentAdminUser user = currentUser();
        if (user.role() == AdminRole.ADMIN) {
            return;
        }

        StoreEntity store = requireStore(storeId);
        if (user.role() == AdminRole.REGION_MANAGER) {
            UUID regionId = user.assignment().region.id;
            if (regionId.equals(store.region.id) && regionId.equals(targetRegionId)) {
                return;
            }
            throw new ForbiddenException("Kein Zugriff auf diese Region.");
        }

        if (user.assignment().store.id.equals(store.id) && store.region.id.equals(targetRegionId)) {
            return;
        }
        throw new ForbiddenException("Kein Zugriff auf diese Filiale.");
    }

    public boolean canSeeBeaconStore(StoreEntity store) {
        if (store == null) {
            return currentUser().role() != AdminRole.STORE_MANAGER;
        }
        try {
            requireStoreAccess(store.id);
            return true;
        } catch (ForbiddenException ignored) {
            return false;
        }
    }

    private UUID scopedRegionId(CurrentAdminUser user) {
        if (user.role() == AdminRole.REGION_MANAGER) {
            return user.assignment().region.id;
        }
        if (user.role() == AdminRole.STORE_MANAGER) {
            return user.assignment().store.region.id;
        }
        return null;
    }

    private StoreEntity requireStore(UUID storeId) {
        return storeRepository.findByIdOptional(storeId)
                .orElseThrow(() -> new NotFoundException("Filiale nicht gefunden."));
    }

    private String subject() {
        JsonWebToken jwt = jwt();
        if (jwt != null && jwt.getSubject() != null && !jwt.getSubject().isBlank()) {
            return jwt.getSubject();
        }
        return identity.getPrincipal().getName();
    }

    private String claim(String name, String fallback) {
        JsonWebToken jwt = jwt();
        if (jwt == null) {
            return fallback;
        }
        Object value = jwt.getClaim(name);
        return value == null ? fallback : String.valueOf(value);
    }

    private JsonWebToken jwt() {
        return identity.getPrincipal() instanceof JsonWebToken jwt ? jwt : null;
    }
}
