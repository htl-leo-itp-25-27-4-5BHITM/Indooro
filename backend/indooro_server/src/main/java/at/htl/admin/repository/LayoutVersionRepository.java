package at.htl.admin.repository;

import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.LayoutVersionStatus;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class LayoutVersionRepository implements PanacheRepositoryBase<LayoutVersionEntity, UUID> {

    public Optional<LayoutVersionEntity> findActiveByStoreId(UUID storeId) {
        return find("store.id = ?1 and status = ?2", storeId, LayoutVersionStatus.ACTIVE).firstResultOptional();
    }

    public List<LayoutVersionEntity> listByStoreId(UUID storeId) {
        return list("store.id = ?1 order by versionNo desc", storeId);
    }

    public Optional<LayoutVersionEntity> findByStoreAndId(UUID storeId, UUID layoutId) {
        return find("store.id = ?1 and id = ?2", storeId, layoutId).firstResultOptional();
    }

    /** Ids of the given stores that have an active layout version, in one query. */
    public Set<UUID> listStoreIdsWithActiveLayout(Collection<UUID> storeIds) {
        return new HashSet<>(getEntityManager()
                .createQuery("select distinct l.store.id from LayoutVersionEntity l "
                        + "where l.store.id in :storeIds and l.status = :status", UUID.class)
                .setParameter("storeIds", storeIds)
                .setParameter("status", LayoutVersionStatus.ACTIVE)
                .getResultList());
    }

    public int nextVersionNo(UUID storeId) {
        Integer maxVersion = getEntityManager()
                .createQuery("select max(l.versionNo) from LayoutVersionEntity l where l.store.id = :storeId", Integer.class)
                .setParameter("storeId", storeId)
                .getSingleResult();
        return maxVersion == null ? 1 : maxVersion + 1;
    }
}
