package at.htl.resource.admin;

import at.htl.admin.dto.ErrorLogDtos;
import at.htl.admin.service.ErrorLogService;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Request;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;

import java.time.Instant;
import java.util.UUID;

@Provider
@Priority(Priorities.USER)
public class ApiWebApplicationExceptionMapper implements ExceptionMapper<WebApplicationException> {

    @Inject
    ErrorLogService errorLogService;

    @Inject
    SecurityIdentity identity;

    @Context
    UriInfo uriInfo;

    @Context
    Request request;

    @Override
    public Response toResponse(WebApplicationException exception) {
        int status = exception.getResponse() == null
                ? Response.Status.BAD_REQUEST.getStatusCode()
                : exception.getResponse().getStatus();
        String method = request == null ? "UNKNOWN" : request.getMethod();
        String path = uriInfo == null ? "unknown" : uriInfo.getPath();
        String message = normalizeMessage(exception, status);
        boolean serverError = status >= 500;
        String correlationId = serverError ? UUID.randomUUID().toString() : null;

        try {
            errorLogService.record(status, method, path, message, exception, correlationId, isAuthenticated());
        } catch (RuntimeException logFailure) {
            // Error logging must never hide the API status that triggered the mapper.
        }

        ErrorLogDtos.ApiErrorResponse payload = new ErrorLogDtos.ApiErrorResponse(
                status,
                serverError ? ErrorLogService.SERVER_ERROR_MESSAGE : message,
                method,
                path,
                Instant.now(),
                correlationId
        );

        return Response.status(status)
                .type(MediaType.APPLICATION_JSON)
                .entity(payload)
                .build();
    }

    private String normalizeMessage(WebApplicationException exception, int status) {
        String raw = exception.getMessage();
        if (raw == null || raw.isBlank()) {
            return "Request failed with status " + status;
        }
        return raw;
    }

    private boolean isAuthenticated() {
        return identity != null && !identity.isAnonymous();
    }
}
