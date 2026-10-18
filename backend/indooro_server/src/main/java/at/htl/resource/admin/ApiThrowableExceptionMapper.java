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

import org.hibernate.JDBCException;

import java.sql.SQLException;
import java.time.Instant;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
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

    static final String UNIQUE_VIOLATION_SQL_STATE = "23505";
    static final String UNIQUE_VIOLATION_MESSAGE = "Ein Datensatz mit diesen Angaben existiert bereits.";

    @Override
    public Response toResponse(Throwable exception) {
        String method = request == null ? "UNKNOWN" : request.getMethod();
        String path = uriInfo == null ? "unknown" : uriInfo.getPath();
        boolean uniqueViolation = isUniqueViolation(exception);
        int status = uniqueViolation
                ? Response.Status.CONFLICT.getStatusCode()
                : Response.Status.INTERNAL_SERVER_ERROR.getStatusCode();
        String message = exception == null || exception.getMessage() == null || exception.getMessage().isBlank()
                ? ErrorLogService.SERVER_ERROR_MESSAGE
                : exception.getMessage();
        String correlationId = UUID.randomUUID().toString();

        if (uniqueViolation) {
            LOG.debugf(exception, "Unique violation correlationId=%s method=%s path=%s", correlationId, method, path);
        } else {
            LOG.errorf(exception, "Unhandled error correlationId=%s method=%s path=%s", correlationId, method, path);
        }
        try {
            errorLogService.record(status, method, path, message, exception, correlationId, isAuthenticated());
        } catch (RuntimeException logFailure) {
            // Persistence failure must not change the response; the correlationId is in the log line above.
        }

        ErrorLogDtos.ApiErrorResponse payload = new ErrorLogDtos.ApiErrorResponse(
                status,
                uniqueViolation ? UNIQUE_VIOLATION_MESSAGE : ErrorLogService.SERVER_ERROR_MESSAGE,
                method,
                path,
                Instant.now(),
                uniqueViolation ? null : correlationId
        );

        return Response.status(status)
                .type(MediaType.APPLICATION_JSON)
                .entity(payload)
                .build();
    }

    /**
     * True when any throwable in the cause chain (RollbackException, PersistenceException, Hibernate
     * ConstraintViolationException, SQLException) carries SQLState 23505, the PostgreSQL unique violation.
     */
    static boolean isUniqueViolation(Throwable exception) {
        Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable current = exception; current != null && visited.add(current); current = current.getCause()) {
            if (current instanceof JDBCException jdbc && UNIQUE_VIOLATION_SQL_STATE.equals(jdbc.getSQLState())) {
                return true;
            }
            if (current instanceof SQLException sql && UNIQUE_VIOLATION_SQL_STATE.equals(sql.getSQLState())) {
                return true;
            }
        }
        return false;
    }

    private boolean isAuthenticated() {
        return identity != null && !identity.isAnonymous();
    }
}
