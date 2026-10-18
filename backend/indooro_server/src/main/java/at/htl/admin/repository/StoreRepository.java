package at.htl.admin.repository;

import at.htl.admin.entity.StoreEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.persistence.TypedQuery;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class StoreRepository implements PanacheRepositoryBase<StoreEntity, UUID> {

    public Optional<StoreEntity> findByStoreCode(String storeCode) {
        return find("lower(storeCode) = ?1", storeCode.toLowerCase()).firstResultOptional();
    }

    /** One page of store ids for a filter (HQL condition on alias `s`, without `where`), ordered by {@code orderBy}. */
    public List<UUID> listPageIds(String where, Map<String, Object> params, String orderBy, int page, int size) {
        TypedQuery<UUID> query = getEntityManager().createQuery(
                "select s.id from StoreEntity s where " + where + " order by " + orderBy,
                UUID.class);
        params.forEach((name, value) -> query.setParameter(name, value));
        return query.setFirstResult(page * size).setMaxResults(size).getResultList();
    }

    public long countWhere(String where, Map<String, Object> params) {
        TypedQuery<Long> query = getEntityManager().createQuery(
                "select count(s) from StoreEntity s where " + where,
                Long.class);
        params.forEach((name, value) -> query.setParameter(name, value));
        return query.getSingleResult();
    }

    /** Stores with their region loaded in one query. Order is not guaranteed. */
    public List<StoreEntity> listWithRegionByIds(Collection<UUID> storeIds) {
        return getEntityManager()
                .createQuery("select s from StoreEntity s left join fetch s.region where s.id in :storeIds", StoreEntity.class)
                .setParameter("storeIds", storeIds)
                .getResultList();
    }
}
