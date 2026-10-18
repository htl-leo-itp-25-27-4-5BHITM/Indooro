package at.htl.service;

import jakarta.enterprise.context.ApplicationScoped;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory replay cache for the {@code Idempotency-Key} header of bulk product writes.
 * Each entry keeps the key, the store code, the SHA-256 of the request body, and the HTTP status and result that were
 * answered. Entries expire after 60 minutes; at most 1000 entries are kept (oldest evicted first).
 *
 * <p>Single replica only (replicas=1): a restart or a second replica forgets the entries. Product document ids are
 * deterministic ({@code <storeCode>:<id>}), so a retry never creates duplicates even when the cache is empty; the cache
 * only avoids writing the batch a second time and returns the original per-row result.
 */
@ApplicationScoped
public class BulkIdempotencyCache {

    static final Duration TTL = Duration.ofMinutes(60);
    static final int MAX_ENTRIES = 1000;

    public record Entry(String storeCode, String bodyHash, int httpStatus, CatalogBulkResult result, Instant storedAt) {
    }

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();
    private volatile Clock clock = Clock.systemUTC();

    public Optional<Entry> get(String key) {
        Entry entry = entries.get(key);
        if (entry == null) {
            return Optional.empty();
        }
        if (isExpired(entry)) {
            entries.remove(key, entry);
            return Optional.empty();
        }
        return Optional.of(entry);
    }

    public synchronized void put(String key, Entry entry) {
        entries.values().removeIf(this::isExpired);
        if (!entries.containsKey(key)) {
            while (entries.size() >= MAX_ENTRIES) {
                evictOldest();
            }
        }
        entries.put(key, entry);
    }

    int size() {
        return entries.size();
    }

    void setClock(Clock clock) {
        this.clock = clock;
    }

    private boolean isExpired(Entry entry) {
        return entry.storedAt().plus(TTL).isBefore(Instant.now(clock));
    }

    private void evictOldest() {
        entries.entrySet().stream()
                .min(Comparator.comparing(entry -> entry.getValue().storedAt()))
                .ifPresent(oldest -> entries.remove(oldest.getKey(), oldest.getValue()));
    }
}
