package at.htl.db;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Flyway is off in tests, so this only checks the migration text for the planned statements. */
class PersistenceIndexMigrationTest {

    private static String migration() throws IOException {
        try (InputStream in = PersistenceIndexMigrationTest.class.getClassLoader()
                .getResourceAsStream("db/migration/V18__persistence_indexes_and_constraints.sql")) {
            assertTrue(in != null, "V18 migration missing");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    @Test
    void createsCaseInsensitiveUniqueIndexes() throws IOException {
        String sql = migration();
        for (String index : new String[]{
                "uk_regions_code_lower ON regions (lower(code))",
                "uk_recipe_tags_code_lower ON recipe_tags (lower(code))",
                "uk_stores_store_code_lower ON stores (lower(store_code))",
                "uk_beacons_beacon_code_lower ON beacons (lower(beacon_code))",
                "uk_recipes_slug_lower ON recipes (lower(slug))"}) {
            assertTrue(sql.contains("CREATE UNIQUE INDEX " + index), index);
        }
    }

    @Test
    void checksBeaconRangesAndFailsLoudlyOnBadData() throws IOException {
        String sql = migration();
        assertTrue(sql.contains("major IS NULL OR major BETWEEN 0 AND 65535"));
        assertTrue(sql.contains("minor IS NULL OR minor BETWEEN 0 AND 65535"));
        assertTrue(sql.contains("RAISE EXCEPTION"));
    }

    @Test
    void guardsTrigramExtensionAndAdjustsUpsellIndexes() throws IOException {
        String sql = migration();
        assertTrue(sql.contains("EXCEPTION WHEN OTHERS"));
        assertTrue(sql.contains("gin_trgm_ops"));
        assertTrue(sql.contains("DROP INDEX IF EXISTS idx_upsell_suggestion_cache_lookup"));
        assertTrue(sql.contains("idx_upsell_suggestion_cache_expires"));
        assertTrue(sql.contains("idx_upsell_dismissals_active"));
        assertTrue(sql.contains("idx_audit_logs_created_at"));
        assertFalse(sql.contains("${"), "no Flyway placeholders expected");
    }
}
