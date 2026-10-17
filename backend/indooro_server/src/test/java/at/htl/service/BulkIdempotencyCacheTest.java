package at.htl.service;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BulkIdempotencyCacheTest {

    private static final Instant START = Instant.parse("2026-10-17T10:00:00Z");

    private static BulkIdempotencyCache.Entry entry(Instant storedAt) {
        return new BulkIdempotencyCache.Entry("SPAR-Leonding-001", "hash", 200,
                new CatalogBulkResult("All rows indexed", 0, 0, 0, 0, java.util.List.of()), storedAt);
    }

    private static Clock clockAt(Instant instant) {
        return Clock.fixed(instant, ZoneOffset.UTC);
    }

    @Test
    void entryIsReturnedWithinTtlAndExpiresAfterSixtyMinutes() {
        BulkIdempotencyCache cache = new BulkIdempotencyCache();
        cache.setClock(clockAt(START));
        cache.put("key-1", entry(START));

        cache.setClock(clockAt(START.plus(Duration.ofMinutes(59))));
        assertTrue(cache.get("key-1").isPresent());

        cache.setClock(clockAt(START.plus(Duration.ofMinutes(61))));
        assertFalse(cache.get("key-1").isPresent());
        assertEquals(0, cache.size());
    }

    @Test
    void oldestEntryIsEvictedWhenMoreThanMaxEntriesAreStored() {
        BulkIdempotencyCache cache = new BulkIdempotencyCache();
        cache.setClock(clockAt(START));
        for (int i = 0; i < BulkIdempotencyCache.MAX_ENTRIES; i++) {
            cache.put("key-" + i, entry(START.plusSeconds(i)));
        }
        assertEquals(BulkIdempotencyCache.MAX_ENTRIES, cache.size());

        cache.put("key-new", entry(START.plusSeconds(BulkIdempotencyCache.MAX_ENTRIES)));

        assertEquals(BulkIdempotencyCache.MAX_ENTRIES, cache.size());
        assertFalse(cache.get("key-0").isPresent(), "oldest entry must be evicted");
        assertTrue(cache.get("key-1").isPresent());
        assertTrue(cache.get("key-new").isPresent());
    }
}
