package at.htl.admin.repository;

import at.htl.admin.entity.UpsellDismissalEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The HQL itself is only validated at runtime against a database, which this machine does not have. These tests pin
 * the null-safe clause shape and the parameter binding (null is bound for absent keys, never skipped).
 */
class UpsellDismissalRepositoryTest {

    @Test
    void findMatchingUsesNullSafeClausesForEveryKey() {
        EntityManager em = mock(EntityManager.class);
        @SuppressWarnings("unchecked")
        TypedQuery<UpsellDismissalEntity> query = mock(TypedQuery.class);
        when(em.createQuery(anyString(), eq(UpsellDismissalEntity.class))).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.setMaxResults(1)).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of());
        UpsellDismissalRepository repository = spy(new UpsellDismissalRepository());
        doReturn(em).when(repository).getEntityManager();

        repository.findMatching(1, null, null, null);

        verify(em).createQuery(org.mockito.ArgumentMatchers.argThat(hql ->
                hql.contains("(:suggestedProductId is null and d.suggestedProductId is null) or d.suggestedProductId = :suggestedProductId")
                        && hql.contains("(:storeId is null and d.storeId is null) or d.storeId = :storeId")
                        && hql.contains("(:sessionHash is null and d.sessionHash is null) or d.sessionHash = :sessionHash")), eq(UpsellDismissalEntity.class));
        verify(query).setParameter("suggestedProductId", null);
        verify(query).setParameter("storeId", null);
        verify(query).setParameter("sessionHash", null);
    }

    @Test
    void findActiveBindsStoreSessionAndNowAndDoesNotFilterOnSuggestedProduct() {
        EntityManager em = mock(EntityManager.class);
        @SuppressWarnings("unchecked")
        TypedQuery<UpsellDismissalEntity> query = mock(TypedQuery.class);
        when(em.createQuery(anyString(), eq(UpsellDismissalEntity.class))).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of());
        UpsellDismissalRepository repository = spy(new UpsellDismissalRepository());
        doReturn(em).when(repository).getEntityManager();
        UUID store = UUID.randomUUID();
        Instant now = Instant.parse("2026-10-18T10:00:00Z");

        assertTrue(repository.findActiveForCheckedProduct(1, store, "hash", now).isEmpty());

        verify(em).createQuery(org.mockito.ArgumentMatchers.argThat(hql ->
                hql.contains("d.suppressedUntil > :now") && !hql.contains("suggestedProductId")), eq(UpsellDismissalEntity.class));
        verify(query).setParameter("storeId", store);
        verify(query).setParameter("sessionHash", "hash");
        verify(query).setParameter("now", now);
        assertEquals(0, repository.findActiveForCheckedProduct(1, null, null, now).size());
        verify(query).setParameter("storeId", null);
        verify(query).setParameter("sessionHash", null);
    }
}
