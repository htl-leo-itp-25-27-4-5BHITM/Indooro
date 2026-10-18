package at.htl.service;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LayoutEtagTest {

    private static final String ETAG = LayoutEtag.ofActiveLayout(UUID.fromString("11111111-1111-1111-1111-111111111111"),
            Instant.parse("2026-10-01T10:00:00Z"));

    @Test
    void matchesQuotedValue() {
        assertTrue(LayoutEtag.matches("\"" + ETAG + "\"", ETAG));
    }

    @Test
    void matchesWeakPrefixAndWhitespace() {
        assertTrue(LayoutEtag.matches("W/\"" + ETAG + "\"", ETAG));
        assertTrue(LayoutEtag.matches("   \"" + ETAG + "\"  ", ETAG));
    }

    @Test
    void matchesAnyEntryOfAList() {
        assertTrue(LayoutEtag.matches("\"old\", W/\"" + ETAG + "\", \"other\"", ETAG));
    }

    @Test
    void wildcardMatchesAnyCurrentRepresentation() {
        assertTrue(LayoutEtag.matches("*", ETAG));
    }

    @Test
    void differentOrMissingValueDoesNotMatch() {
        assertFalse(LayoutEtag.matches("\"old\"", ETAG));
        assertFalse(LayoutEtag.matches(null, ETAG));
        assertFalse(LayoutEtag.matches("  ", ETAG));
        assertFalse(LayoutEtag.matches("\"" + ETAG + "x\"", ETAG));
    }

    @Test
    void activeEtagChangesWithActivationTimeOrLayoutId() {
        UUID layoutId = UUID.fromString("11111111-1111-1111-1111-111111111111");
        String later = LayoutEtag.ofActiveLayout(layoutId, Instant.parse("2026-10-02T10:00:00Z"));
        String otherLayout = LayoutEtag.ofActiveLayout(UUID.randomUUID(), Instant.parse("2026-10-01T10:00:00Z"));

        assertEquals(ETAG, LayoutEtag.ofActiveLayout(layoutId, Instant.parse("2026-10-01T10:00:00Z")));
        assertNotEquals(ETAG, later);
        assertNotEquals(ETAG, otherLayout);
        assertEquals(64, ETAG.length());
    }

    @Test
    void defaultEtagDependsOnStoreAndName() {
        UUID storeId = UUID.fromString("22222222-2222-2222-2222-222222222222");
        String hash = "abc";

        String base = LayoutEtag.ofDefaultLayout(storeId, "Leonding", hash);

        assertEquals(base, LayoutEtag.ofDefaultLayout(storeId, "Leonding", hash));
        assertNotEquals(base, LayoutEtag.ofDefaultLayout(UUID.randomUUID(), "Leonding", hash));
        assertNotEquals(base, LayoutEtag.ofDefaultLayout(storeId, "Linz", hash));
        assertNotEquals(base, LayoutEtag.ofDefaultLayout(storeId, "Leonding", "other"));
    }
}
