package at.htl.admin.repository;

import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.StoreEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class BeaconAssignmentRepository implements PanacheRepositoryBase<BeaconAssignmentEntity, UUID> {

    public Optional<BeaconAssignmentEntity> findActiveByBeaconId(UUID beaconId) {
        return find("beacon.id = ?1 and isActive = true", beaconId).firstResultOptional();
    }

    public List<BeaconAssignmentEntity> listActiveByStoreId(UUID storeId) {
        return list("store.id = ?1 and isActive = true order by assignedAt desc", storeId);
    }

    public long countActiveByStore(StoreEntity store) {
        return count("store = ?1 and isActive = true", store);
    }

    public List<BeaconAssignmentEntity> listActiveAssignments() {
        return list("isActive = true");
    }

    /** Active beacon assignments per store for the given stores, in one grouped query. Stores without assignments are absent. */
    public Map<UUID, Long> countActiveByStoreIds(Collection<UUID> storeIds) {
        List<Object[]> rows = getEntityManager()
                .createQuery("select a.store.id, count(a) from BeaconAssignmentEntity a "
                        + "where a.store.id in :storeIds and a.isActive = true group by a.store.id", Object[].class)
                .setParameter("storeIds", storeIds)
                .getResultList();
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : rows) {
            counts.put((UUID) row[0], (Long) row[1]);
        }
        return counts;
    }
}
