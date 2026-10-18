package at.htl.admin.service;

import at.htl.admin.entity.UserAccessAssignmentEntity;
import at.htl.admin.repository.UserAccessAssignmentRepository;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.ContextNotActiveException;
import jakarta.enterprise.inject.Instance;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.security.Principal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminAccessServiceCurrentUserCacheTest {

    private static final String SUBJECT = "subject-1";

    private AdminAccessService access;
    private UserAccessAssignmentRepository repository;

    @BeforeEach
    void setUp() {
        SecurityIdentity identity = mock(SecurityIdentity.class);
        when(identity.isAnonymous()).thenReturn(false);
        when(identity.hasRole(AdminRole.ADMIN.value())).thenReturn(true);
        Principal principal = () -> SUBJECT;
        when(identity.getPrincipal()).thenReturn(principal);

        UserAccessAssignmentEntity assignment = new UserAccessAssignmentEntity();
        assignment.keycloakSubject = SUBJECT;
        assignment.username = "anna";
        assignment.role = AdminRole.ADMIN.value();
        repository = mock(UserAccessAssignmentRepository.class);
        when(repository.findActiveBySubject(SUBJECT)).thenReturn(Optional.of(assignment));

        access = new AdminAccessService();
        access.identity = identity;
        access.accessAssignmentRepository = repository;
    }

    @Test
    void repeatedChecksInOneRequestResolveTheAssignmentOnce() {
        RequestCurrentAdminUser holder = new RequestCurrentAdminUser();
        access.requestCurrentUser = requestScope(holder);

        CurrentAdminUser first = access.currentUser();
        CurrentAdminUser second = access.currentUser();
        access.requireAdmin();

        assertSame(first, second);
        verify(repository, times(1)).findActiveBySubject(SUBJECT);
    }

    @Test
    void withoutCdiEveryCallResolvesTheAssignment() {
        access.requestCurrentUser = null;

        access.currentUser();
        access.currentUser();

        verify(repository, times(2)).findActiveBySubject(SUBJECT);
    }

    @Test
    void withoutActiveRequestScopeTheUserIsResolvedUncached() {
        RequestCurrentAdminUser holder = mock(RequestCurrentAdminUser.class);
        when(holder.current()).thenThrow(new ContextNotActiveException("no request context"));
        doThrow(new ContextNotActiveException("no request context")).when(holder).remember(any());
        access.requestCurrentUser = requestScope(holder);

        CurrentAdminUser user = access.currentUser();
        access.currentUser();

        assertSame(AdminRole.ADMIN, user.role());
        verify(repository, times(2)).findActiveBySubject(SUBJECT);
    }

    @SuppressWarnings("unchecked")
    private static Instance<RequestCurrentAdminUser> requestScope(RequestCurrentAdminUser holder) {
        Instance<RequestCurrentAdminUser> instance = mock(Instance.class);
        when(instance.get()).thenReturn(holder);
        return instance;
    }
}
