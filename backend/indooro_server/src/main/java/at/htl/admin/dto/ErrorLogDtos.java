package at.htl.admin.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ErrorLogDtos {

    private ErrorLogDtos() {
    }

    public record ErrorLogEntry(
            UUID id,
            int statusCode,
            String method,
            String path,
            String message,
            String errorType,
            String stackTrace,
            Instant createdAt
    ) {
    }

    public record ErrorLogResponse(
            int limit,
            List<ErrorLogEntry> entries
    ) {
    }

    /** Fehlerantwort der API; {@code correlationId} erscheint nur bei 5xx-Antworten. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ApiErrorResponse(
            int status,
            String error,
            String method,
            String path,
            Instant timestamp,
            String correlationId
    ) {

        public ApiErrorResponse(int status, String error, String method, String path, Instant timestamp) {
            this(status, error, method, path, timestamp, null);
        }
    }
}
