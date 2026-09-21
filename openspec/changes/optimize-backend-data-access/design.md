## Context

All JPA relations are `LAZY` without fetch joins or batch sizes. `RecipeService.toSummary` calls `mappingStatusFor` for every ingredient, which queries mappings and resolves each product through `OpenSearchService.getProductById`. `UpsellSuggestionService` (2 231 lines) mixes classification rules, prompt construction, HTTP calls, cache persistence, and telemetry, and its public methods are `@Transactional`. `AdminAccessService.currentUser()` queries `user_access_assignments` on each call. `LayoutService` and `CategoryService` call OpenSearch index APIs on every read. The datasource uses the Agroal default pool (max 20).

## Goals / Non-Goals

**Goals:** bounded, predictable query counts per request; no connection held during external I/O; data growth under control; correctness fixes BUG-01/02/03/08/09/11.

**Non-Goals:** introducing Redis or a message broker; OpenSearch 3.x upgrade; changing the public contract beyond additive fields and stricter validation.

## Decisions

### D1 Upsell transaction split
`plan()` loses `@Transactional`. Steps: (1) `@Transactional(readOnly)`-style lookup of cache and dismissals via a short method; (2) catalog lookups; (3) OpenAI ranking through `OpenAiRankingClient` (application-scoped `java.net.http.HttpClient`, `@Bulkhead(value = 4, waitingTaskQueue = 16)`, `@Timeout` equal to the configured timeout, `@Fallback` to deterministic ranking); (4) `@Transactional(REQUIRES_NEW)` cache write. The OpenAI URL becomes configurable (`openai.base-url`).

### D2 Upsell catalog access
- Trigger products: one `mget` for all distinct ids (max 600 after validation limits from `harden-platform-security-baseline`).
- Candidates: `bool` query with `should` clauses on trigger category prefixes (`prefix` on `layoutCode`) and complementary categories from `complementaryCategories`, `filter` on store scope, `size = upsell.max-candidates`, sort by `_score` then `id` for determinism. The global fallback query runs only when the store-scoped result has fewer than `maxSuggestions` hits.
- Dismissals: before ranking, load active dismissals (`suppressed_until > now`) for the session hash and store, and remove matching `(checkedProductId, suggestedProductId)` pairs; a dismissal without `suggestedProductId` suppresses all suggestions for the checked product.
- Null-safe matching uses `IS NOT DISTINCT FROM` semantics via HQL (`(:x is null and field is null) or field = :x`).

### D3 Recipe lists
- Page query selects recipe ids first (paging on ids), then loads recipes with `left join fetch tagAssignments … join fetch tag` in a second query.
- Mapping counts: one aggregate `select ingredient.recipe.id, count(distinct ingredient.id) from IngredientProductMappingEntity m join m.recipeIngredient ingredient where ingredient.recipe.id in :ids and m.status = ACTIVE and (store matches or global) group by ingredient.recipe.id`.
- Ingredient totals and step counts: one aggregate query each (or `size()` via `@Formula`-free count queries).
- OpenSearch is not called for summaries; mapping status with product resolution stays on the detail and mapping routes and uses `mget`.

### D4 Admin lists and identity
- `AdminAccessService` gets a `@RequestScoped` holder that caches the resolved `CurrentAdminUser` (assignment fetched with `left join fetch region left join fetch store left join fetch store.region`).
- Store summaries: one grouped count query for active assignments and one query for store ids with an active layout, both restricted to the page's store ids; regions fetched by join.
- Beacon list: one query with `left join` to the active assignment and its store; visibility filtered in the query by scope (`store.region.id = :regionId` / `store.id = :storeId`), no per-row lookups.

### D5 Start-up and static resources
- `@Observes StartupEvent` ensures `products`, `categories`, and `layouts` indices exist (with explicit mapping for `layouts`: `elements` as `object` with `enabled: false` to avoid mapping explosion) and seeds categories when empty; request paths no longer create indices. If OpenSearch is unavailable at start-up, a readiness check reports DOWN and a retry runs every 30 s.
- `DefaultLayoutProvider` loads `default-layout.json` once and returns deep copies.
- Mobile layout responses carry `ETag` = SHA-256 of `layoutId` + `activatedAt` (or bundled version) and honor `If-None-Match` with 304; `Cache-Control: no-cache`.
- Bounds: `/api/products` size 1..500, `/api/products/search` size 1..100, `/api/layout/history` limit 1..50 with server-side sort on `savedAt` (mapping added) and `recordType` filter in the query.
- `OpenSearchClientConfig` produces an `@ApplicationScoped` client and closes the transport in `@Disposes`.

### D6 Schema (`V14__persistence_indexes_and_constraints.sql`)
- Unique indexes on `lower(code)` for `regions` and `recipe_tags`, `lower(store_code)` for `stores`, `lower(beacon_code)` for `beacons`, `lower(slug)` for `recipes` (after checking for existing case duplicates; the migration fails loudly if duplicates exist).
- `CREATE EXTENSION IF NOT EXISTS pg_trgm` and GIN trigram indexes on `lower(title)`, `lower(summary)`, `lower(description)` of `recipes`.
- `CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC)`.
- `CHECK (major IS NULL OR major BETWEEN 0 AND 65535)` and the same for `minor` on `beacons` (after verifying existing data).
- Drop `idx_upsell_suggestion_cache_lookup`; add `idx_upsell_suggestion_cache_expires` on `expires_at`; add `idx_upsell_dismissals_active` on `(session_hash, store_id, suppressed_until)`.

### D7 Concurrency
- `saveLayoutVersion` and `activateLayoutVersion` lock the store row (`PESSIMISTIC_WRITE`) before computing `nextVersionNo` or switching the active version.
- `ApiThrowableExceptionMapper` (or a dedicated `ConstraintViolationException` mapper for Hibernate) translates unique-constraint violations into 409 with a generic German message.

### D8 Retention (`@Scheduled`, daily)
- Delete `upsell_suggestion_cache` rows with `expires_at < now() - 1 day`.
- Delete `upsell_events` older than 180 days and `upsell_dismissals` whose `suppressed_until` is older than 30 days.
- Keep the 50 newest legacy layout versions in OpenSearch (`recordType = version`), delete older ones.
- Keep all store layout versions (auditable), but report JSON size per store in the diagnostics page (future).

### D9 Beacon identity
- `BeaconCreateRequest`/`BeaconBulk*` get `@Min(0) @Max(65535)` on major/minor.
- `MobileStoreService.resolveBeacon`: with major/minor present and no active exact match, fall back only to active beacons with the same UUID **and** `major IS NULL AND minor IS NULL`; otherwise 404.

### D10 Maintenance results
- `createIndex` returns 409 when the index exists and 503 when OpenSearch is unreachable; `deleteIndex` returns 404 when the index does not exist.

## Risks / Trade-offs

- [Unique functional indexes fail on existing case duplicates] → pre-check query in task 1.2 and a manual cleanup step documented in the migration header.
- [`pg_trgm` requires extension privileges] → the official PostgreSQL image grants them to `POSTGRES_USER`; if not available, the migration uses a guarded `DO` block and skips the trigram indexes with a notice.
- [Relevance-based candidate selection changes upsell results] → covered by the existing 31 upsell tests plus new fixtures; the change is coordinated with `stabilize-upsell-quality-and-request-lifecycle`.
- [ETag handling may serve stale layouts] → the ETag includes `activatedAt`, which changes on every activation.

## Migration Plan

1. Run the duplicate and range pre-checks against the LeoCloud dump.
2. Deploy V14 and the code together; monitor start-up readiness.
3. Rollback: previous image; V14 is additive except the dropped cache index, which a manual script can recreate.
