package at.htl.admin.service;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.time.Duration;
import java.time.Instant;

/** Bulk-Loeschungen fuer Upsell-Daten. Jede Methode liefert die Anzahl geloeschter Zeilen. */
@ApplicationScoped
public class DataRetentionService {

    @Inject
    EntityManager entityManager;

    /** Loescht Cache-Eintraege, deren {@code expiresAt} aelter als {@code days} Tage vor {@code now} ist. */
    @Transactional
    public long purgeUpsellCache(Instant now, int days) {
        return executeDelete("delete from UpsellSuggestionCacheEntity c where c.expiresAt < :cutoff", now, days);
    }

    /** Loescht Upsell-Ereignisse, die aelter als {@code days} Tage sind (createdAt). */
    @Transactional
    public long purgeUpsellEvents(Instant now, int days) {
        return executeDelete("delete from UpsellEventEntity e where e.createdAt < :cutoff", now, days);
    }

    /**
     * Loescht Dismissals, deren Unterdrueckung vor mehr als {@code days} Tagen endete. Zeilen ohne
     * {@code suppressedUntil} bleiben erhalten (NULL trifft den Vergleich nicht).
     */
    @Transactional
    public long purgeUpsellDismissals(Instant now, int days) {
        return executeDelete("delete from UpsellDismissalEntity d where d.suppressedUntil < :cutoff", now, days);
    }

    private long executeDelete(String hql, Instant now, int days) {
        Instant cutoff = now.minus(Duration.ofDays(days));
        return entityManager.createQuery(hql)
                .setParameter("cutoff", cutoff)
                .executeUpdate();
    }
}
