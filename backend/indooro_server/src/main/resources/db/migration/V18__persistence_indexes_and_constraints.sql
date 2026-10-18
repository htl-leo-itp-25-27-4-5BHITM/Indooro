-- Persistence indexes and constraints (change optimize-backend-data-access, D6).
-- Pre-check queries for the LeoCloud copy are listed in the change's tasks.md (task 1.2).
-- The migration fails loudly when case duplicates or out-of-range major/minor values exist;
-- clean up the data first, then rerun.

DO $$
DECLARE
    duplicates TEXT;
BEGIN
    SELECT string_agg(format('%s:%s', t, k), ', ') INTO duplicates FROM (
        SELECT 'regions' AS t, lower(code) AS k FROM regions GROUP BY lower(code) HAVING count(*) > 1
        UNION ALL
        SELECT 'recipe_tags', lower(code) FROM recipe_tags GROUP BY lower(code) HAVING count(*) > 1
        UNION ALL
        SELECT 'stores', lower(store_code) FROM stores GROUP BY lower(store_code) HAVING count(*) > 1
        UNION ALL
        SELECT 'beacons', lower(beacon_code) FROM beacons GROUP BY lower(beacon_code) HAVING count(*) > 1
        UNION ALL
        SELECT 'recipes', lower(slug) FROM recipes GROUP BY lower(slug) HAVING count(*) > 1
    ) d;
    IF duplicates IS NOT NULL THEN
        RAISE EXCEPTION 'Case-insensitive duplicate codes exist, clean up first: %', duplicates;
    END IF;

    IF EXISTS (SELECT 1 FROM beacons WHERE major NOT BETWEEN 0 AND 65535 OR minor NOT BETWEEN 0 AND 65535) THEN
        RAISE EXCEPTION 'beacons contains major/minor values outside 0..65535, clean up first';
    END IF;
END $$;

CREATE UNIQUE INDEX uk_regions_code_lower ON regions (lower(code));
CREATE UNIQUE INDEX uk_recipe_tags_code_lower ON recipe_tags (lower(code));
CREATE UNIQUE INDEX uk_stores_store_code_lower ON stores (lower(store_code));
CREATE UNIQUE INDEX uk_beacons_beacon_code_lower ON beacons (lower(beacon_code));
CREATE UNIQUE INDEX uk_recipes_slug_lower ON recipes (lower(slug));

ALTER TABLE beacons
    ADD CONSTRAINT ck_beacons_major_range CHECK (major IS NULL OR major BETWEEN 0 AND 65535),
    ADD CONSTRAINT ck_beacons_minor_range CHECK (minor IS NULL OR minor BETWEEN 0 AND 65535);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Context lookups use the unique context_hash; the old composite index is not used.
DROP INDEX IF EXISTS idx_upsell_suggestion_cache_lookup;
CREATE INDEX idx_upsell_suggestion_cache_expires ON upsell_suggestion_cache (expires_at);
CREATE INDEX idx_upsell_dismissals_active ON upsell_dismissals (session_hash, store_id, suppressed_until);

-- Trigram indexes for recipe search. Skipped with a notice when the extension cannot be created.
DO $$
BEGIN
    BEGIN
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_trgm is not available (%), skipping trigram indexes', SQLERRM;
    END;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recipes_title_trgm ON recipes USING gin (lower(title) gin_trgm_ops)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recipes_summary_trgm ON recipes USING gin (lower(summary) gin_trgm_ops)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_recipes_description_trgm ON recipes USING gin (lower(description) gin_trgm_ops)';
    END IF;
END $$;
