package at.htl.admin.service;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.time.Instant;

/** Tägliche Bereinigung von error_logs (Aufbewahrung und Zeilenlimit). */
@ApplicationScoped
public class ErrorLogRetentionJob {

    private static final Logger LOG = Logger.getLogger(ErrorLogRetentionJob.class);

    @Inject
    ErrorLogService errorLogService;

    @ConfigProperty(name = "indooro.error-logs.retention-days", defaultValue = "30")
    int retentionDays;

    @ConfigProperty(name = "indooro.error-logs.max-rows", defaultValue = "50000")
    int maxRows;

    @Scheduled(cron = "0 30 3 * * ?", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void purge() {
        try {
            errorLogService.purgeRetained(retentionDays, maxRows, Instant.now());
        } catch (RuntimeException failure) {
            LOG.warn("Error log retention failed", failure);
        }
    }
}
