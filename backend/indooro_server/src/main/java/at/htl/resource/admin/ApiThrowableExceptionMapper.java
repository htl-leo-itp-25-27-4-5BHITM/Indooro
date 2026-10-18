package at.htl.resource.admin;

import at.htl.admin.dto.ErrorLogDtos;
import at.htl.admin.service.ErrorLogService;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.Priority;
import jakarta.inject.Inject;
import jakarta.ws.rs.Priorities;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Request;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

import java.time.Instant;
import java.util.UUID;

@Provider
@Priority(Priorities.USER + 1)
public class ApiThrowableExceptionMapper implements ExceptionMapper<Throwable> {

    private static final Logger LOG = Logger.getLogger(ApiThrowableExceptionMapper.class);

    @Inject
    ErrorLogService errorLogService;

    @Inject
    SecurityIdentity identity;

    @Context
    UriInfo uriInfo;

    @Context
    Request request;

    @Override
    public Response toResponse(Throwable exception) {
        int status = Response.Status.INTERNAL_SERVER_ERROR.getStatusCode();
        String method = request == null ? "UNKNOWN" : request.getMethod();
        String path = uriInfo == null ? "unknown" : uriInfo.getPath();
        String message = exception == null || exception.getMessage() == null || exception.getMessage().isBlank()
                ? ErrorLogService.SERVER_ERROR_MESSAGE
                : exception.getMessage();
        String correlationId = UUID.randomUUID().toString();

        LOG.errorf(exception, "Unhandled error correlationId=%s method=%s path=%s", correlationId, method, path);
        try {
            errorLogService.record(status, method, path, message, exception, correlationId, isAuthenticated());
        } catch (RuntimeException logFailure) {
            // Persistence failure must not change the response; the correlationId is in the log line above.
        }

        ErrorLogDtos.ApiErrorResponse payload = new ErrorLogDtos.ApiErrorResponse(
                status,
                ErrorLogService.SERVER_ERROR_MESSAGE,
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

    private boolean isAuthenticated() {
        return identity != null && !identity.isAnonymous();
    }
}
