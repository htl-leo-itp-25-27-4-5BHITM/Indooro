package at.htl.admin.service;

import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.StoreRepository;
import jakarta.persistence.LockModeType;
import jakarta.persistence.LockTimeoutException;
import jakarta.ws.rs.WebApplicationException;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class StoreAdminServiceLockTest {
    private final UUID storeId = UUID.randomUUID();
    private final StoreRepository repository = mock(StoreRepository.class);
    private final StoreAdminService service = new StoreAdminService();

    StoreAdminServiceLockTest() {
        service.storeRepository = repository;
    }

    @Test
    void locksStoreRowBeforeLayoutMutation() {
        StoreEntity store = new StoreEntity();
        store.id = storeId;
        when(repository.findByIdOptional(storeId, LockModeType.PESSIMISTIC_WRITE)).thenReturn(Optional.of(store));

        assertSame(store, service.lockStore(storeId));
        verify(repository).findByIdOptional(storeId, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void lockTimeoutBecomesExplicitConflict() {
        when(repository.findByIdOptional(storeId, LockModeType.PESSIMISTIC_WRITE))
                .thenThrow(new LockTimeoutException("busy"));

        WebApplicationException error = assertThrows(WebApplicationException.class, () -> service.lockStore(storeId));
        assertEquals(409, error.getResponse().getStatus());
    }
}
