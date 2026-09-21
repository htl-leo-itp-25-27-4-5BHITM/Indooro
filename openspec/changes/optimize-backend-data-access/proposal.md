## Why

The audit (`docs/audit/CODE_AUDIT.md`, chapters 4.3, 4.4, and 5) measured data-access patterns that do not scale and correctness defects in the persistence layer:

- PERF-01: `UpsellSuggestionService.plan()` and `suggestions()` keep a database transaction and connection open during the OpenAI call (up to 12 s). Twenty anonymous plan requests can exhaust the default pool and block every admin and mobile route.
- PERF-02/PERF-03: the public recipe list issues one query per ingredient and one OpenSearch request per mapping; an upsell plan can issue up to 1 600 single-document OpenSearch requests.
- PERF-04: upsell candidates are the first 150 documents of an unsorted `match_all`.
- PERF-05/PERF-06/PERF-07: store and beacon lists run two to three queries per row, and the current admin user is loaded several times per request.
- PERF-08/PERF-09/PERF-25/PERF-26/PERF-29: index existence and category seeding are checked on every read, list sizes are unbounded, the default layout is parsed on every request, and layout responses cannot be cached.
- PERF-27/PERF-28: a new HTTP client per OpenAI call and an undisposed OpenSearch client per injection point.
- PERF-30…33: case-insensitive lookups without matching indexes, `LIKE '%…%'` on text columns, no `created_at` index for audit logs, and unbounded growth of cache, event, dismissal, and legacy layout data.
- BUG-01/BUG-02: dismissals are stored but never read, and null-valued keys never match.
- BUG-03: check-then-insert uniqueness and version numbering fail with 500 under concurrency.
- BUG-08/BUG-09: iBeacon major/minor are not range-checked, and an unknown exact identity can resolve to a different beacon.
- BUG-11: index maintenance reports success on failure.

## What Changes

- Split upsell processing into a read transaction, a non-transactional AI call with a shared HTTP client and bulkhead, and a short write transaction.
- Compute recipe summary mapping counts with one aggregate query per page and load summaries with fetch joins; never call OpenSearch while listing.
- Resolve upsell trigger products with one multi-get; select candidates with a relevance query based on trigger categories and names plus a deterministic tiebreaker.
- Batch store and beacon list enrichment, cache the current admin user per request.
- Check OpenSearch indices and seed categories once at start-up; cache the default layout; add ETags to mobile layout responses; bound all size and limit parameters.
- Produce one application-scoped OpenSearch client with proper disposal.
- Add functional unique indexes, a trigram index for recipe search, an audit `created_at` index, and retention jobs for operational tables.
- Apply dismissals when ranking and fix null-safe matching.
- Translate uniqueness races into 409 and serialize layout version numbering per store.
- Enforce 0–65 535 for beacon major/minor and restrict UUID-only fallback to UUID-only beacons.
- Report index maintenance failures.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `backend-core`: transaction boundaries for external calls, bounded query counts, request-scoped identity, start-up index checks, bounded list parameters, cached static layouts, conditional layout responses, client lifecycle, persistence indexes, operational data retention, effective dismissals, concurrency-safe uniqueness, beacon identity ranges and matching, truthful maintenance results.

## Impact

- Backend: `UpsellSuggestionService` (split into `UpsellPlanner`, `UpsellCandidateRepository`, `OpenAiRankingClient`), `RecipeService`, `RecipeRepository`, `StoreAdminService`, `BeaconAdminService`, `AdminAccessService`, `OpenSearchService`, `CategoryService`, `LayoutService`, `MobileStoreService`, `OpenSearchClientConfig`, `LayoutVersionRepository`, `UpsellDismissalRepository`, `ApiThrowableExceptionMapper` (constraint translation), `BeaconDtos`, new migrations `V14__persistence_indexes_and_constraints.sql`, dependency `quarkus-smallrye-fault-tolerance`, `quarkus-scheduler` (shared with `harden-platform-security-baseline`).
- iOS: benefits from ETags once `modernize-ios-client-architecture` uses `URLCache`; no contract break. The dismissal fix makes the iOS dismiss meaningful once `fix-ios-contract-and-spec-drift` sends valid `suppressMinutes`.
- Admin UI: none beyond faster responses.
- Auth: unchanged. Protected and public routes unchanged; roles unchanged.
- Demo proof: a load test with 40 concurrent plan requests keeps `/api/stores` responsive (p95 < 500 ms); SQL logging shows at most 5 statements for `GET /api/mobile/recipes?size=20`.
