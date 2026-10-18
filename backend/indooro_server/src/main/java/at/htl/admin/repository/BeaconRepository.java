package at.htl.admin.repository;

import at.htl.admin.entity.BeaconAssignmentEntity;
import at.htl.admin.entity.BeaconEntity;
import at.htl.admin.entity.RecordStatus;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class BeaconRepository implements PanacheRepositoryBase<BeaconEntity, UUID> {

    /** A beacon with its active assignment (null when unassigned). The assignment's store and region are loaded. */
    public record BeaconWithAssignment(BeaconEntity beacon, BeaconAssignmentEntity assignment) {
    }

    public Optional<BeaconEntity> findByBeaconCode(String beaconCode) {
        return find("lower(beaconCode) = ?1", beaconCode.toLowerCase()).firstResultOptional();
    }

    public Optional<BeaconEntity> findByIdentityKey(String identityKey) {
        return find("identityKey", identityKey).firstResultOptional();
    }

    public List<BeaconEntity> listActiveByUuid(String uuid) {
        return list("uuid = ?1 and status = ?2", uuid, RecordStatus.ACTIVE);
    }

    /**
     * Beacons with the given status, each joined to its active assignment, store and region in one query.
     * {@code scopeRegionId} keeps unassigned beacons and beacons of that region. {@code scopeStoreId} keeps only
     * beacons assigned to that store. Both null means no scope. {@code likePattern} is already lower-case, or null.
     */
    public List<BeaconWithAssignment> listWithActiveAssignments(RecordStatus status, String likePattern,
                                                                UUID scopeRegionId, UUID scopeStoreId) {
        StringBuilder hql = new StringBuilder("select beacon, assignment from BeaconEntity beacon "
                + "left join BeaconAssignmentEntity assignment on assignment.beacon.id = beacon.id and assignment.isActive = true "
                + "left join fetch assignment.store st "
                + "left join fetch st.region rg "
                + "where beacon.status = :status");
        if (scopeRegionId != null) {
            hql.append(" and (assignment.id is null or rg.id = :scopeRegionId)");
        }
        if (scopeStoreId != null) {
            hql.append(" and st.id = :scopeStoreId");
        }
        if (likePattern != null) {
            hql.append(" and (lower(beacon.beaconCode) like :query or lower(beacon.identityKey) like :query)");
        }

        var query = getEntityManager().createQuery(hql.toString(), Object[].class)
                .setParameter("status", status);
        if (scopeRegionId != null) {
            query.setParameter("scopeRegionId", scopeRegionId);
        }
        if (scopeStoreId != null) {
            query.setParameter("scopeStoreId", scopeStoreId);
        }
        if (likePattern != null) {
            query.setParameter("query", likePattern);
        }

        Map<UUID, BeaconWithAssignment> byBeacon = new LinkedHashMap<>();
        for (Object[] row : query.getResultList()) {
            BeaconEntity beacon = (BeaconEntity) row[0];
            byBeacon.putIfAbsent(beacon.id, new BeaconWithAssignment(beacon, (BeaconAssignmentEntity) row[1]));
        }
        return new ArrayList<>(byBeacon.values());
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
