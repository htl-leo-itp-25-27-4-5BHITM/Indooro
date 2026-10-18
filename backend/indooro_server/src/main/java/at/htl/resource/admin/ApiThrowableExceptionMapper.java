package at.htl.resource.admin;

import at.htl.admin.dto.ErrorLogDtos;
import at.htl.admin.service.ErrorLogService;
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

import org.hibernate.JDBCException;

import java.sql.SQLException;
import java.time.Instant;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;

@Provider
@Priority(Priorities.USER + 1)
public class ApiThrowableExceptionMapper implements ExceptionMapper<Throwable> {

    @Inject
    ErrorLogService errorLogService;

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
        int status;
        String message;
        if (isUniqueViolation(exception)) {
            status = Response.Status.CONFLICT.getStatusCode();
            message = UNIQUE_VIOLATION_MESSAGE;
        } else {
            status = Response.Status.INTERNAL_SERVER_ERROR.getStatusCode();
            message = exception == null || exception.getMessage() == null || exception.getMessage().isBlank()
                    ? "Interner Serverfehler"
                    : exception.getMessage();
        }

        errorLogService.logError(status, method, path, message, exception);

        ErrorLogDtos.ApiErrorResponse payload = new ErrorLogDtos.ApiErrorResponse(
                status,
                message,
                method,
                path,
                Instant.now()
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
}
