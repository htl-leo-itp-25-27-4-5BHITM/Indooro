package at.htl.admin.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DataRetentionServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-18T03:15:00Z");

    private DataRetentionService service;
    private EntityManager entityManager;
    private Query query;

    @BeforeEach
    void setUp() {
        entityManager = mock(EntityManager.class);
        query = mock(Query.class);
        service = new DataRetentionService();
        service.entityManager = entityManager;

        when(entityManager.createQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.executeUpdate()).thenReturn(7);
    }

    @Test
    void upsellCachePurgeTargetsExpiresAtWithOneDayCutoff() {
        long deleted = service.purgeUpsellCache(NOW, 1);

        assertEquals(7L, deleted);
        String hql = hql();
        assertTrue(hql.contains("UpsellSuggestionCacheEntity"), hql);
        assertTrue(hql.contains("expiresAt < :cutoff"), hql);
        verify(query).setParameter("cutoff", Instant.parse("2026-10-17T03:15:00Z"));
    }

    @Test
    void upsellEventsPurgeTargetsCreatedAtWithRetentionCutoff() {
        long deleted = service.purgeUpsellEvents(NOW, 180);

        assertEquals(7L, deleted);
        String hql = hql();
        assertTrue(hql.contains("UpsellEventEntity"), hql);
        assertTrue(hql.contains("createdAt < :cutoff"), hql);
        verify(query).setParameter("cutoff", NOW.minusSeconds(180L * 86_400L));
    }

    @Test
    void upsellDismissalsPurgeTargetsSuppressedUntilAndKeepsNullRows() {
        long deleted = service.purgeUpsellDismissals(NOW, 30);

        assertEquals(7L, deleted);
        String hql = hql();
        assertTrue(hql.contains("UpsellDismissalEntity"), hql);
        // NULL suppressedUntil never satisfies "< :cutoff", so open-ended dismissals are kept.
        assertTrue(hql.contains("suppressedUntil < :cutoff"), hql);
        verify(query).setParameter("cutoff", NOW.minusSeconds(30L * 86_400L));
    }

    private String hql() {
        ArgumentCaptor<String> captor = ArgumentCaptor.forClass(String.class);
        verify(entityManager).createQuery(captor.capture());
        return captor.getValue();
    }
}
