package at.htl.admin.repository;

import at.htl.admin.entity.UserAccessAssignmentEntity;
import at.htl.admin.entity.UserAccessStatus;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class UserAccessAssignmentRepository implements PanacheRepositoryBase<UserAccessAssignmentEntity, UUID> {

    /** Active assignment with region, store and store region loaded, so the detached entity can be read after the call. */
    public Optional<UserAccessAssignmentEntity> findActiveBySubject(String subject) {
        return getEntityManager()
                .createQuery("select a from UserAccessAssignmentEntity a "
                        + "left join fetch a.region "
                        + "left join fetch a.store st "
                        + "left join fetch st.region "
                        + "where a.keycloakSubject = :subject and a.status = :status", UserAccessAssignmentEntity.class)
                .setParameter("subject", subject)
                .setParameter("status", UserAccessStatus.ACTIVE)
                .setMaxResults(1)
                .getResultStream()
                .findFirst();
    }

    /** Assignments with region and store loaded, active first, then by username. A null status lists all. */
    public List<UserAccessAssignmentEntity> listWithScope(UserAccessStatus status) {
        String where = status == null ? "" : "where a.status = :status ";
        var query = getEntityManager()
                .createQuery("select a from UserAccessAssignmentEntity a "
                        + "left join fetch a.region "
                        + "left join fetch a.store "
                        + where
                        + "order by a.status asc, lower(a.username) asc, a.createdAt asc", UserAccessAssignmentEntity.class);
        if (status != null) {
            query.setParameter("status", status);
        }
        return query.getResultList();
    }

    /** One assignment with region and store loaded. */
    public Optional<UserAccessAssignmentEntity> findByIdWithScope(UUID id) {
        return getEntityManager()
                .createQuery("select a from UserAccessAssignmentEntity a "
                        + "left join fetch a.region "
                        + "left join fetch a.store "
                        + "where a.id = :id", UserAccessAssignmentEntity.class)
                .setParameter("id", id)
                .getResultStream()
                .findFirst();
    }
}
