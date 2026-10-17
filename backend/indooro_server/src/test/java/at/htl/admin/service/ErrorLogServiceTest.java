package at.htl.admin.service;

import at.htl.admin.entity.ErrorLogEntity;
import at.htl.admin.repository.ErrorLogRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ErrorLogServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-18T03:30:00Z");

    ErrorLogService service;
    ErrorLogRepository repository;

    @BeforeEach
    void setUp() {
        repository = mock(ErrorLogRepository.class);
        service = new ErrorLogService();
        service.errorLogRepository = repository;
    }

    @Test
    void anonymousClientErrorsAreNotPersisted() {
        service.record(401, "GET", "/api/admin/me", "Admin-Login erforderlich.", null, null, false);
        service.record(404, "GET", "/api/products/9", "Produkt nicht gefunden.", null, null, false);

        verify(repository, never()).persist(any(ErrorLogEntity.class));
    }

    @Test
    void authenticatedAdminClientErrorsArePersisted() {
        service.record(403, "POST", "/api/admin/products", "Kein Zugriff.", null, null, true);

        verify(repository).persist(any(ErrorLogEntity.class));
    }

    @Test
    void serverErrorsArePersistedWithCorrelationIdInMessage() {
        RuntimeException failure = new RuntimeException("db secret detail");
        service.record(500, "GET", "/api/x", "db secret detail", failure, "corr-123", false);

        ArgumentCaptor<ErrorLogEntity> captor = ArgumentCaptor.forClass(ErrorLogEntity.class);
        verify(repository).persist(captor.capture());
        ErrorLogEntity entry = captor.getValue();
        assertEquals(500, entry.statusCode);
        assertTrue(entry.message.startsWith("[correlationId=corr-123] "));
        assertTrue(entry.message.contains("db secret detail"));
        assertEquals(RuntimeException.class.getName(), entry.errorType);
        assertNotNull(entry.stackTrace);
    }

    @Test
    void policyDecidesByStatusAndAuthentication() {
        assertTrue(ErrorLogService.shouldPersist(500, false));
        assertTrue(ErrorLogService.shouldPersist(503, false));
        assertTrue(ErrorLogService.shouldPersist(403, true));
        assertFalse(ErrorLogService.shouldPersist(401, false));
        assertFalse(ErrorLogService.shouldPersist(404, false));
    }

    @Test
    void retentionDeletesExpiredRowsThenKeepsNewestRows() {
        when(repository.deleteCreatedBefore(any())).thenReturn(7L);
        when(repository.deleteBeyondNewest(50_000)).thenReturn(3L);

        ErrorLogService.RetentionResult result = service.purgeRetained(30, 50_000, NOW);

        verify(repository).deleteCreatedBefore(NOW.minus(Duration.ofDays(30)));
        verify(repository).deleteBeyondNewest(50_000);
        assertEquals(7L, result.expiredDeleted());
        assertEquals(3L, result.overflowDeleted());
    }

    @Test
    void retentionUsesGivenRetentionDays() {
        service.purgeRetained(7, 100, NOW);

        verify(repository).deleteCreatedBefore(NOW.minus(Duration.ofDays(7)));
        verify(repository).deleteBeyondNewest(100);
    }
}
