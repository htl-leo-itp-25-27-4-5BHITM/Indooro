package at.htl.admin.repository;

import at.htl.admin.entity.BeaconAssignmentEntity;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The assignment query splits large id sets into chunks of at most MAX_IDS_PER_QUERY ids. */
class BeaconRepositoryAssignmentQueryTest {

    @Test
    void emptyIdSetIssuesNoQuery() {
        EntityManager em = mock(EntityManager.class);
        BeaconRepository repository = spy(new BeaconRepository());
        doReturn(em).when(repository).getEntityManager();

        assertTrue(repository.listActiveAssignmentsForBeacons(List.of()).isEmpty());

        verify(em, times(0)).createQuery(anyString(), eq(BeaconAssignmentEntity.class));
    }

    @Test
    void idsAreChunkedAtOneThousand() {
        EntityManager em = mock(EntityManager.class);
        @SuppressWarnings("unchecked")
        TypedQuery<BeaconAssignmentEntity> query = mock(TypedQuery.class);
        when(em.createQuery(anyString(), eq(BeaconAssignmentEntity.class))).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of(new BeaconAssignmentEntity()));
        BeaconRepository repository = spy(new BeaconRepository());
        doReturn(em).when(repository).getEntityManager();

        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < 2500; i++) {
            ids.add(UUID.randomUUID());
        }
        List<BeaconAssignmentEntity> result = repository.listActiveAssignmentsForBeacons(ids);

        verify(em, times(3)).createQuery(anyString(), eq(BeaconAssignmentEntity.class));
        verify(query, times(1)).setParameter("beaconIds", ids.subList(0, 1000));
        verify(query, times(1)).setParameter("beaconIds", ids.subList(1000, 2000));
        verify(query, times(1)).setParameter("beaconIds", ids.subList(2000, 2500));
        assertEquals(3, result.size());
    }

    @Test
    void upToOneThousandIdsIsOneQuery() {
        EntityManager em = mock(EntityManager.class);
        @SuppressWarnings("unchecked")
        TypedQuery<BeaconAssignmentEntity> query = mock(TypedQuery.class);
        when(em.createQuery(anyString(), eq(BeaconAssignmentEntity.class))).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getResultList()).thenReturn(List.of());
        BeaconRepository repository = spy(new BeaconRepository());
        doReturn(em).when(repository).getEntityManager();

        repository.listActiveAssignmentsForBeacons(List.of(UUID.randomUUID(), UUID.randomUUID()));

        verify(em, times(1)).createQuery(anyString(), eq(BeaconAssignmentEntity.class));
    }
}
