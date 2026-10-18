package at.htl.admin.repository;

import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.BeaconEntity;
import at.htl.admin.entity.RecordStatus;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class BeaconRepository implements PanacheRepositoryBase<BeaconEntity, UUID> {

    public Optional<BeaconEntity> findByBeaconCode(String beaconCode) {
        return find("lower(beaconCode) = ?1", beaconCode.toLowerCase()).firstResultOptional();
    }

    public Optional<BeaconEntity> findByIdentityKey(String identityKey) {
        return find("identityKey", identityKey).firstResultOptional();
    }

    /** The active beacon registered with this UUID only, i.e. without major and minor. */
    public Optional<BeaconEntity> findActiveUuidOnly(String uuid) {
        return find("uuid = ?1 and status = ?2 and major is null and minor is null", uuid, RecordStatus.ACTIVE)
                .firstResultOptional();
    }

    public List<BeaconEntity> listActiveByUuid(String uuid) {
        return list("uuid = ?1 and status = ?2", uuid, RecordStatus.ACTIVE);
    }

    /** Maximum number of ids per {@code in} clause; larger id sets are split into several queries. */
    static final int MAX_IDS_PER_QUERY = 1000;

    /**
     * Beacons with the given status (query 1 of 2 for the admin list). {@code likePattern} is already lower-case
     * and wrapped in wildcards, or null for no text filter. No scope is applied here.
     */
    public List<BeaconEntity> listByStatusAndQuery(RecordStatus status, String likePattern) {
        StringBuilder hql = new StringBuilder("from BeaconEntity beacon where beacon.status = :status");
        if (likePattern != null) {
            hql.append(" and (lower(beacon.beaconCode) like :query or lower(beacon.identityKey) like :query)");
        }
        var query = getEntityManager().createQuery(hql.toString(), BeaconEntity.class)
                .setParameter("status", status);
        if (likePattern != null) {
            query.setParameter("query", likePattern);
        }
        return query.getResultList();
    }

    /**
     * Active assignments of the given beacons with their store and region fetched (query 2 of 2 for the admin list).
     * Ids are split into chunks of {@link #MAX_IDS_PER_QUERY}; the result contains at most one entry per beacon.
     */
    public List<BeaconAssignmentEntity> listActiveAssignmentsForBeacons(Collection<UUID> beaconIds) {
        List<BeaconAssignmentEntity> result = new ArrayList<>();
        if (beaconIds == null || beaconIds.isEmpty()) {
            return result;
        }
        List<UUID> ids = new ArrayList<>(beaconIds);
        for (int from = 0; from < ids.size(); from += MAX_IDS_PER_QUERY) {
            List<UUID> chunk = ids.subList(from, Math.min(from + MAX_IDS_PER_QUERY, ids.size()));
            result.addAll(getEntityManager()
                    .createQuery("select a from BeaconAssignmentEntity a "
                            + "join fetch a.store st "
                            + "join fetch st.region "
                            + "where a.isActive = true and a.beacon.id in :beaconIds", BeaconAssignmentEntity.class)
                    .setParameter("beaconIds", chunk)
                    .getResultList());
        }
        return result;
    }

    public List<String> listActiveAssignedMobileUuids() {
        return getEntityManager()
                .createQuery("""
                        select distinct b.uuid
                        from BeaconAssignmentEntity assignment
                        join assignment.beacon b
                        join assignment.store s
                        where assignment.isActive = true
                          and b.status = :activeStatus
                          and s.status = :activeStatus
                          and b.uuid is not null
                        order by b.uuid
                        """, String.class)
                .setParameter("activeStatus", RecordStatus.ACTIVE)
                .getResultList();
    }
}
