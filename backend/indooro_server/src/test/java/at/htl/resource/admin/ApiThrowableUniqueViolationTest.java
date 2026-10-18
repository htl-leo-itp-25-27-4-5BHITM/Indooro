package at.htl.resource.admin;

import at.htl.admin.dto.ErrorLogDtos;
import at.htl.admin.service.ErrorLogService;
import jakarta.persistence.PersistenceException;
import jakarta.transaction.RollbackException;
import jakarta.ws.rs.core.Response;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.Test;

import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

/** Unique violations (SQLState 23505) become 409 with a generic German message; everything else stays a 500. */
class ApiThrowableUniqueViolationTest {

    @Test
    void detectsUniqueViolationDirectlyWrappedAndDeepInTheCauseChain() {
        ConstraintViolationException hibernate = uniqueViolation();

        assertTrue(ApiThrowableExceptionMapper.isUniqueViolation(hibernate));
        assertTrue(ApiThrowableExceptionMapper.isUniqueViolation(new SQLException("duplicate", "23505")));
        assertTrue(ApiThrowableExceptionMapper.isUniqueViolation(
                new RuntimeException("commit failed", new PersistenceException("wrapped", hibernate))));
        RollbackException rollback = new RollbackException("rollback");
        rollback.initCause(new PersistenceException("wrapped", hibernate));
        assertTrue(ApiThrowableExceptionMapper.isUniqueViolation(rollback));
    }

    @Test
    void otherSqlStatesAndPlainErrorsAreNotUniqueViolations() {
        ConstraintViolationException foreignKey = new ConstraintViolationException(
                "fk", new SQLException("fk violated", "23503"), "sql", null);

        assertFalse(ApiThrowableExceptionMapper.isUniqueViolation(foreignKey));
        assertFalse(ApiThrowableExceptionMapper.isUniqueViolation(new IllegalStateException("boom")));
        assertFalse(ApiThrowableExceptionMapper.isUniqueViolation(null));
    }

    @Test
    void uniqueViolationIsMappedToConflictWithGenericMessage() {
        ApiThrowableExceptionMapper mapper = mapper();

        Response response = mapper.toResponse(new RuntimeException(
                "commit failed", new PersistenceException("wrapped", uniqueViolation())));

        assertEquals(409, response.getStatus());
        ErrorLogDtos.ApiErrorResponse body = (ErrorLogDtos.ApiErrorResponse) response.getEntity();
        assertEquals(409, body.status());
        assertEquals("Ein Datensatz mit diesen Angaben existiert bereits.", body.error());
        assertFalse(body.error().contains("duplicate"), "database detail must not leak");
    }

    @Test
    void otherErrorsKeepTheInternalServerErrorStatus() {
        Response response = mapper().toResponse(new IllegalStateException("boom"));

        assertEquals(500, response.getStatus());
        assertEquals(500, ((ErrorLogDtos.ApiErrorResponse) response.getEntity()).status());
    }

    private static ConstraintViolationException uniqueViolation() {
        return new ConstraintViolationException("duplicate key", new SQLException("duplicate key value", "23505"), "insert", "uk_code");
    }

    private static ApiThrowableExceptionMapper mapper() {
        ApiThrowableExceptionMapper mapper = new ApiThrowableExceptionMapper();
        mapper.errorLogService = mock(ErrorLogService.class);
        return mapper;
    }
}
