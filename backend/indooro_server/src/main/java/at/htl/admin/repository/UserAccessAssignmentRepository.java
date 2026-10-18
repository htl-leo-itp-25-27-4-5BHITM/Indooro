package at.htl.admin.repository;

import at.htl.admin.entity.UserAccessAssignmentEntity;
import at.htl.admin.entity.UserAccessStatus;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

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
}
