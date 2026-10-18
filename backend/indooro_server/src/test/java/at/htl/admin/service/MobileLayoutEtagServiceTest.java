package at.htl.admin.service;

import at.htl.admin.entity.LayoutVersionEntity;
import at.htl.admin.entity.LayoutVersionStatus;
import at.htl.admin.entity.RecordStatus;
import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.LayoutVersionRepository;
import at.htl.admin.repository.StoreRepository;
import at.htl.service.DefaultLayoutProvider;
import at.htl.service.LayoutEtag;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.NotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** ETag values of {@link MobileStoreService#getCurrentLayoutWithEtag}, with real layout and default providers. */
class MobileLayoutEtagServiceTest {

    private static final Instant ACTIVATED = Instant.parse("2026-10-01T10:00:00Z");

    private MobileStoreService service;
    private StoreRepository storeRepository;
    private LayoutVersionRepository layoutVersionRepository;
    private StoreEntity store;

    @BeforeEach
    void setUp() {
        storeRepository = mock(StoreRepository.class);
        layoutVersionRepository = mock(LayoutVersionRepository.class);
        service = new MobileStoreService();
        service.storeRepository = storeRepository;
        service.layoutVersionRepository = layoutVersionRepository;
        service.defaultLayoutProvider = new DefaultLayoutProvider(new ObjectMapper());

        store = store(UUID.fromString("33333333-3333-3333-3333-333333333333"), "Leonding", RecordStatus.ACTIVE);
        when(storeRepository.findByIdOptional(store.id)).thenReturn(Optional.of(store));
    }

    @Test
    void activeLayoutEtagIsSha256OfLayoutIdAndActivation() {
        LayoutVersionEntity active = activeLayout(ACTIVATED);
        when(layoutVersionRepository.findActiveByStoreId(store.id)).thenReturn(Optional.of(active));

        MobileStoreService.LayoutWithEtag result = service.getCurrentLayoutWithEtag(store.id);

        assertEquals(LayoutEtag.ofActiveLayout(active.id, ACTIVATED), result.etag());
        assertEquals("ACTIVE", result.layout().source());
        assertEquals(active.id, result.layout().layoutId());
    }

    @Test
    void activeEtagIsStableUntilANewActivationHappens() {
        LayoutVersionEntity active = activeLayout(ACTIVATED);
        when(layoutVersionRepository.findActiveByStoreId(store.id)).thenReturn(Optional.of(active));
        String first = service.getCurrentLayoutWithEtag(store.id).etag();

        assertEquals(first, service.getCurrentLayoutWithEtag(store.id).etag());

        active.activatedAt = Instant.parse("2026-10-05T08:00:00Z");
        assertNotEquals(first, service.getCurrentLayoutWithEtag(store.id).etag());
    }

    @Test
    void newlyActivatedLayoutGetsADifferentEtag() {
        LayoutVersionEntity first = activeLayout(ACTIVATED);
        LayoutVersionEntity second = activeLayout(Instant.parse("2026-10-06T08:00:00Z"));
        when(layoutVersionRepository.findActiveByStoreId(store.id)).thenReturn(Optional.of(first));
        String firstTag = service.getCurrentLayoutWithEtag(store.id).etag();

        when(layoutVersionRepository.findActiveByStoreId(store.id)).thenReturn(Optional.of(second));

        assertNotEquals(firstTag, service.getCurrentLayoutWithEtag(store.id).etag());
    }

    @Test
    void defaultLayoutEtagIsStableAcrossCalls() {
        when(layoutVersionRepository.findActiveByStoreId(store.id)).thenReturn(Optional.empty());

        String first = service.getCurrentLayoutWithEtag(store.id).etag();

        assertEquals(first, service.getCurrentLayoutWithEtag(store.id).etag());
        assertEquals(LayoutEtag.ofDefaultLayout(store.id, store.name, service.defaultLayoutProvider.contentHash()), first);
    }

    @Test
    void defaultLayoutEtagDiffersPerStore() {
        StoreEntity other = store(UUID.fromString("44444444-4444-4444-4444-444444444444"), "Linz", RecordStatus.ACTIVE);
        when(storeRepository.findByIdOptional(other.id)).thenReturn(Optional.of(other));
        when(layoutVersionRepository.findActiveByStoreId(any())).thenReturn(Optional.empty());

        assertNotEquals(service.getCurrentLayoutWithEtag(store.id).etag(),
                service.getCurrentLayoutWithEtag(other.id).etag());
    }

    @Test
    void defaultEtagChangesWhenStoreIsRenamed() {
        when(layoutVersionRepository.findActiveByStoreId(store.id)).thenReturn(Optional.empty());
        String before = service.getCurrentLayoutWithEtag(store.id).etag();

        store.name = "Leonding Mitte";

        assertNotEquals(before, service.getCurrentLayoutWithEtag(store.id).etag());
    }

    @Test
    void inactiveStoreIsNotFoundBeforeAnyLayoutOrEtagIsComputed() {
        store.status = RecordStatus.ARCHIVED;

        assertThrows(NotFoundException.class, () -> service.getCurrentLayoutWithEtag(store.id));
        verify(layoutVersionRepository, never()).findActiveByStoreId(any());
    }

    @Test
    void unknownStoreIsNotFound() {
        UUID unknown = UUID.randomUUID();
        when(storeRepository.findByIdOptional(unknown)).thenReturn(Optional.empty());

        assertThrows(NotFoundException.class, () -> service.getCurrentLayoutWithEtag(unknown));
    }

    @Test
    void getCurrentLayoutReturnsTheSameLayoutAsTheEtagVariant() {
        when(layoutVersionRepository.findActiveByStoreId(store.id)).thenReturn(Optional.empty());

        assertEquals(service.getCurrentLayoutWithEtag(store.id).layout(), service.getCurrentLayout(store.id));
        assertNull(service.getCurrentLayout(store.id).layoutId());
    }

    private static StoreEntity store(UUID id, String name, RecordStatus status) {
        StoreEntity store = new StoreEntity();
        store.id = id;
        store.name = name;
        store.storeCode = name.substring(0, 3).toUpperCase();
        store.status = status;
        return store;
    }

    private LayoutVersionEntity activeLayout(Instant activatedAt) {
        LayoutVersionEntity layout = new LayoutVersionEntity();
        layout.id = UUID.randomUUID();
        layout.store = store;
        layout.status = LayoutVersionStatus.ACTIVE;
        layout.activatedAt = activatedAt;
        layout.layoutJson = new ObjectMapper().createObjectNode().put("shopName", store.name);
        return layout;
    }
}
