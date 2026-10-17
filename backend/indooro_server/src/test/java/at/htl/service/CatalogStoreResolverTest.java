package at.htl.service;

import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.StoreRepository;
import at.htl.service.CatalogStoreResolver.CatalogStoreException;
import at.htl.service.CatalogStoreResolver.ResolvedStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CatalogStoreResolverTest {

    private static final UUID PILOT_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000001");
    private static final UUID DEMO_ID = UUID.fromString("6f1c2a5e-0000-4000-8000-000000000002");

    private StoreRepository repository;
    private CatalogStoreResolver resolver;

    @BeforeEach
    void setUp() {
        repository = mock(StoreRepository.class);
        when(repository.findByIdOptional(PILOT_ID)).thenReturn(Optional.of(store(PILOT_ID, "SPAR-Leonding-001")));
        when(repository.findByIdOptional(DEMO_ID)).thenReturn(Optional.of(store(DEMO_ID, "demo-store")));
        when(repository.findByStoreCode("SPAR-Leonding-001")).thenReturn(Optional.of(store(PILOT_ID, "SPAR-Leonding-001")));
        when(repository.findByStoreCode("demo-store")).thenReturn(Optional.of(store(DEMO_ID, "demo-store")));
        when(repository.findByStoreCode("unbekannt")).thenReturn(Optional.empty());

        resolver = new CatalogStoreResolver();
        resolver.storeRepository = repository;
    }

    @Test
    void noStoreGivenResolvesToNullAndRequireFails() {
        assertNull(resolver.resolveOptional(null, " "));
        CatalogStoreException exception = assertThrows(CatalogStoreException.class, () -> resolver.require(null, null));
        assertEquals("Markt fehlt: storeId oder storeCode angeben.", exception.getMessage());
    }

    @Test
    void storeCodeResolvesToDatabaseIdAndCode() {
        ResolvedStore store = resolver.require(null, "SPAR-Leonding-001");
        assertEquals(PILOT_ID, store.id());
        assertEquals("SPAR-Leonding-001", store.storeCode());
    }

    @Test
    void storeIdResolvesToDatabaseCode() {
        ResolvedStore store = resolver.require(PILOT_ID.toString(), null);
        assertEquals(PILOT_ID, store.id());
        assertEquals("SPAR-Leonding-001", store.storeCode());
    }

    @Test
    void matchingStoreIdAndCodeAreAccepted() {
        ResolvedStore store = resolver.require(DEMO_ID.toString(), "demo-store");
        assertEquals(DEMO_ID, store.id());
    }

    @Test
    void unknownStoreCodeIsRejectedInGerman() {
        CatalogStoreException exception = assertThrows(CatalogStoreException.class,
                () -> resolver.require(null, "unbekannt"));
        assertEquals("Unbekannter Markt.", exception.getMessage());
    }

    @Test
    void unknownStoreIdAndInvalidUuidAreRejected() {
        assertEquals("Unbekannter Markt.", assertThrows(CatalogStoreException.class,
                () -> resolver.require(UUID.randomUUID().toString(), null)).getMessage());
        assertEquals("Unbekannter Markt.", assertThrows(CatalogStoreException.class,
                () -> resolver.require("kein-uuid", null)).getMessage());
    }

    @Test
    void conflictingStoreIdAndCodeAreRejected() {
        CatalogStoreException exception = assertThrows(CatalogStoreException.class,
                () -> resolver.require(PILOT_ID.toString(), "demo-store"));
        assertEquals(CatalogStoreResolver.CONFLICTING_STORE, exception.getMessage());
    }

    private static StoreEntity store(UUID id, String code) {
        StoreEntity store = new StoreEntity();
        store.id = id;
        store.storeCode = code;
        return store;
    }
}
