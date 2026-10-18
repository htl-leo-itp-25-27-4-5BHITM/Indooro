package at.htl.admin.repository;

import at.htl.admin.entity.ErrorLogEntity;
import io.quarkus.hibernate.orm.panache.PanacheRepositoryBase;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@ApplicationScoped
public class ErrorLogRepository implements PanacheRepositoryBase<ErrorLogEntity, UUID> {

    public List<ErrorLogEntity> listRecent(int limit) {
        return find("order by createdAt desc").page(0, Math.max(1, limit)).list();
    }

    /** Löscht alle Einträge, die vor dem Stichtag erstellt wurden. */
    public long deleteCreatedBefore(Instant cutoff) {
        return delete("createdAt < ?1", cutoff);
    }

    /**
     * Löscht alle Einträge außerhalb der {@code maxRows} neuesten (createdAt desc, id desc).
     * Der erste Eintrag jenseits des Limits bildet die Grenze; er und alle älteren werden entfernt.
     */
    public long deleteBeyondNewest(int maxRows) {
        Optional<ErrorLogEntity> boundary = find("order by createdAt desc, id desc")
                .page(Math.max(0, maxRows), 1)
                .firstResultOptional();
        if (boundary.isEmpty()) {
            return 0;
        }
        ErrorLogEntity limit = boundary.get();
        return delete("createdAt < ?1 or (createdAt = ?1 and id <= ?2)", limit.createdAt, limit.id);
    }
}
