package at.htl.admin.service;

import at.htl.admin.dto.ErrorLogDtos;
import at.htl.admin.entity.ErrorLogEntity;
import at.htl.admin.repository.ErrorLogRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.jboss.logging.Logger;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

@ApplicationScoped
public class ErrorLogService {

    private static final Logger LOG = Logger.getLogger(ErrorLogService.class);
    private static final int MAX_STACK_TRACE_LENGTH = 12000;

    /** Öffentliche Meldung für 5xx-Antworten; Details stehen nur in error_logs. */
    public static final String SERVER_ERROR_MESSAGE = "Interner Serverfehler";

    @Inject
    ErrorLogRepository errorLogRepository;

    /**
     * Entscheidet, ob eine Fehlerantwort in error_logs landet: alle 5xx sowie 4xx nur bei
     * authentifizierten Admin-Anfragen. Anonyme 4xx werden nicht persistiert.
     */
    public static boolean shouldPersist(int statusCode, boolean authenticated) {
        return statusCode >= 500 || (authenticated && statusCode >= 400 && statusCode < 500);
    }

    /** Persistiert den Fehler laut Policy; {@code correlationId} wird vor die Message gesetzt. */
    @Transactional
    public void record(int statusCode, String method, String path, String message, Throwable throwable,
                       String correlationId, boolean authenticated) {
        if (!shouldPersist(statusCode, authenticated)) {
            LOG.debugf("Client error not persisted status=%d method=%s path=%s", statusCode, method, path);
            return;
        }
        ErrorLogEntity entry = new ErrorLogEntity();
        entry.statusCode = statusCode;
        entry.method = truncate(method, 16);
        entry.path = truncate(path == null || path.isBlank() ? "unknown" : path, 300);
        entry.message = truncate(correlationId == null ? message : "[correlationId=" + correlationId + "] " + message, 8000);
        entry.errorType = throwable == null ? null : truncate(throwable.getClass().getName(), 200);
        entry.stackTrace = throwable == null ? null : truncate(toStackTrace(throwable), MAX_STACK_TRACE_LENGTH);
        errorLogRepository.persist(entry);
    }

    /** Entfernt Einträge älter als {@code retentionDays} und danach alles jenseits der {@code maxRows} neuesten. */
    @Transactional
    public RetentionResult purgeRetained(int retentionDays, int maxRows, Instant now) {
        long expired = errorLogRepository.deleteCreatedBefore(now.minus(Duration.ofDays(retentionDays)));
        long overflow = errorLogRepository.deleteBeyondNewest(maxRows);
        if (expired + overflow > 0) {
            LOG.infof("Error log retention removed expired=%d overflow=%d", expired, overflow);
        }
        return new RetentionResult(expired, overflow);
    }

    public ErrorLogDtos.ErrorLogResponse getRecentLogs(int limit) {
        int normalizedLimit = Math.min(Math.max(limit, 1), 100);
        List<ErrorLogDtos.ErrorLogEntry> entries = errorLogRepository.listRecent(normalizedLimit).stream()
                .map(this::toEntry)
                .toList();
        return new ErrorLogDtos.ErrorLogResponse(normalizedLimit, entries);
    }

    private ErrorLogDtos.ErrorLogEntry toEntry(ErrorLogEntity entry) {
        return new ErrorLogDtos.ErrorLogEntry(
                entry.id,
                entry.statusCode,
                entry.method,
                entry.path,
                entry.message,
                entry.errorType,
                entry.stackTrace,
                entry.createdAt
        );
    }

    private String toStackTrace(Throwable throwable) {
        StringWriter stringWriter = new StringWriter();
        throwable.printStackTrace(new PrintWriter(stringWriter));
        return stringWriter.toString();
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }

    public record RetentionResult(long expiredDeleted, long overflowDeleted) {
    }
}
