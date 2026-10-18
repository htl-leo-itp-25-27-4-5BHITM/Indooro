package at.htl.admin.service;

import at.htl.service.LayoutService;
import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.function.LongSupplier;

/**
 * Taegliche Aufbewahrung: Upsell-Cache, Upsell-Events, Upsell-Dismissals und Legacy-Layout-Versionen.
 * Jeder Schritt laeuft isoliert; ein Fehler stoppt die uebrigen nicht.
 */
@ApplicationScoped
public class DataRetentionJob {

    private static final Logger LOG = Logger.getLogger(DataRetentionJob.class);

    @Inject
    DataRetentionService dataRetentionService;

    @Inject
    LayoutService layoutService;

    @ConfigProperty(name = "indooro.retention.upsell-cache-days", defaultValue = "1")
    int upsellCacheDays;

    @ConfigProperty(name = "indooro.retention.upsell-events-days", defaultValue = "180")
    int upsellEventsDays;

    @ConfigProperty(name = "indooro.retention.upsell-dismissals-days", defaultValue = "30")
    int upsellDismissalsDays;

    @ConfigProperty(name = "indooro.retention.legacy-layout-versions", defaultValue = "50")
    int legacyLayoutVersions;

    @Scheduled(cron = "0 15 3 * * ?", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void purge() {
        Instant now = Instant.now();
        runStep("upsell cache", () -> dataRetentionService.purgeUpsellCache(now, upsellCacheDays));
        runStep("upsell events", () -> dataRetentionService.purgeUpsellEvents(now, upsellEventsDays));
        runStep("upsell dismissals", () -> dataRetentionService.purgeUpsellDismissals(now, upsellDismissalsDays));
        runStep("legacy layout versions", () -> layoutService.pruneLegacyVersions(legacyLayoutVersions));
    }

    private void runStep(String name, LongSupplier step) {
        try {
            long removed = step.getAsLong();
            if (removed > 0) {
                LOG.infof("Data retention removed %d rows from %s", removed, name);
            }
        } catch (RuntimeException failure) {
            LOG.warnf(failure, "Data retention step failed: %s", name);
        }
    }
}
