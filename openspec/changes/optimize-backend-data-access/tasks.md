## 1. Baseline and Pre-checks

- [ ] 1.1 Add a test helper that counts SQL statements (Hibernate statistics) and OpenSearch requests (client interceptor) and record current counts for recipe, store, and beacon lists.
- [ ] 1.2 Run case-duplicate and major/minor range queries against a copy of the LeoCloud database and clean up conflicts before V14.
- [ ] 1.3 Coordinate candidate-selection changes with `stabilize-upsell-quality-and-request-lifecycle` and `harden-upsell-prefilter-quality`.

## 2. Upsell

- [ ] 2.1 Extract `OpenAiRankingClient` (application-scoped `HttpClient`, `openai.base-url`, `@Bulkhead`, `@Timeout`, `@Fallback`) and add `quarkus-smallrye-fault-tolerance`.
- [ ] 2.2 Remove `@Transactional` from `plan()`/`suggestions()`; add short read and `REQUIRES_NEW` write methods for cache and dismissal access.
- [ ] 2.3 Add `OpenSearchService.getProductsByIds` (multi-get) and use it for trigger resolution.
- [ ] 2.4 Replace `findUpsellCandidates` with the relevance query and deterministic sort.
- [ ] 2.5 Apply active dismissals when ranking; make `UpsellDismissalRepository.findMatching` null-safe.

## 3. Recipes

- [ ] 3.1 Page recipe ids, then fetch recipes with tags via join fetch.
- [ ] 3.2 Add aggregate queries for mapped-ingredient counts, ingredient totals, and step counts per page.
- [ ] 3.3 Use multi-get in `mappingStatus` for product resolution.

## 4. Admin Lists and Identity

- [ ] 4.1 Add the request-scoped current-user cache with join-fetched region/store.
- [ ] 4.2 Batch store summary enrichment (active beacon counts, active layout ids) per page.
- [ ] 4.3 Rewrite `BeaconAdminService.listBeacons` as one scoped query with the active assignment and store.

## 5. OpenSearch Lifecycle and Static Data

- [ ] 5.1 Make `OpenSearchClientConfig` application-scoped with a disposer.
- [ ] 5.2 Move index preparation and category seeding to a start-up observer with retry and a readiness check; add an explicit `layouts` mapping.
- [ ] 5.3 Remove request-path `ensureLayoutIndex` and `ensureSeeded` calls.
- [ ] 5.4 Clamp `size`/`limit` parameters and move legacy history filtering and sorting into the OpenSearch query.
- [ ] 5.5 Add `DefaultLayoutProvider` and use it in all three services.
- [ ] 5.6 Add ETag/`If-None-Match` handling to the mobile layout route.
- [ ] 5.7 Return 409/404/503 from index maintenance operations.

## 6. Schema, Concurrency, Retention

- [ ] 6.1 Write `V14__persistence_indexes_and_constraints.sql` (functional unique indexes, guarded `pg_trgm`, audit and cache indexes, major/minor checks, dropped unused index).
- [ ] 6.2 Lock the store row in `saveLayoutVersion` and `activateLayoutVersion`.
- [ ] 6.3 Map unique-constraint violations to 409.
- [ ] 6.4 Add `@Min(0) @Max(65535)` to beacon DTOs and restrict the UUID-only fallback.
- [ ] 6.5 Add daily retention jobs for upsell cache, events, dismissals, and legacy layout versions.

## 7. Documentation

- [ ] 7.1 Update `openspec/specs/shared-api/openapi.yaml` (bounded parameters, 304 response, maintenance status codes, beacon ranges).
- [ ] 7.2 Update `docs/audit/CODE_AUDIT.md` with the resolution status of each PERF and BUG finding.

## 8. Verification

- [ ] 8.1 Add Quarkus tests asserting the statement and request budgets from the spec.
- [ ] 8.2 Add tests for dismissal suppression, null-safe matching, concurrent version numbering, 409 translation, beacon ranges, fallback restriction, ETag handling, and bounded parameters.
- [ ] 8.3 Run a local load test (k6 or `hey`) with 40 concurrent plan requests and a slow OpenAI stub; record p95 of `GET /api/stores`.
- [ ] 8.4 Run `./mvnw test` and `npx -y @fission-ai/openspec@1.3.1 validate optimize-backend-data-access --strict`.
