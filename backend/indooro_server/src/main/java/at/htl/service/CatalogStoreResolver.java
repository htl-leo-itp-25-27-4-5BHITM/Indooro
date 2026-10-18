package at.htl.service;

import at.htl.admin.entity.StoreEntity;
import at.htl.admin.repository.StoreRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

/**
 * Resolves the store a product write refers to. storeId (UUID) and storeCode are both accepted; the
 * database record is authoritative, so the returned id and code are always consistent.
 */
@ApplicationScoped
public class CatalogStoreResolver {

    public static final String MISSING_STORE = "Markt fehlt: storeId oder storeCode angeben.";
    public static final String UNKNOWN_STORE = "Unbekannter Markt.";
    public static final String CONFLICTING_STORE = "storeId und storeCode gehoeren zu unterschiedlichen Maerkten.";

    public record ResolvedStore(UUID id, String storeCode) {
    }

    /** Thrown for invalid store references; the message is German and meant for the client. */
    public static class CatalogStoreException extends RuntimeException {
        public CatalogStoreException(String message) {
            super(message);
        }
    }

    @Inject
    StoreRepository storeRepository;

    /** Returns null when neither storeId nor storeCode is given; throws CatalogStoreException for unknown or conflicting stores. */
    public ResolvedStore resolveOptional(String storeId, String storeCode) {
        String id = blankToNull(storeId);
        String code = blankToNull(storeCode);
        if (id == null && code == null) {
            return null;
        }

        StoreEntity byId = null;
        if (id != null) {
            UUID uuid = parseUuid(id);
            if (uuid == null) {
                throw new CatalogStoreException(UNKNOWN_STORE);
            }
            byId = storeRepository.findByIdOptional(uuid).orElseThrow(() -> new CatalogStoreException(UNKNOWN_STORE));
        }

        StoreEntity byCode = null;
        if (code != null) {
            byCode = storeRepository.findByStoreCode(code).orElseThrow(() -> new CatalogStoreException(UNKNOWN_STORE));
        }

        if (byId != null && byCode != null && !byId.id.equals(byCode.id)) {
            throw new CatalogStoreException(CONFLICTING_STORE);
        }
        StoreEntity store = byId != null ? byId : byCode;
        return new ResolvedStore(store.id, store.storeCode);
    }

    /** Like resolveOptional, but a missing store is an error. */
    public ResolvedStore require(String storeId, String storeCode) {
        ResolvedStore store = resolveOptional(storeId, storeCode);
        if (store == null) {
            throw new CatalogStoreException(MISSING_STORE);
        }
        return store;
    }

    private static UUID parseUuid(String value) {
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
