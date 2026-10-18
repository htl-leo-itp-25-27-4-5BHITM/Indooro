## 1. Baseline and Pre-checks

- [ ] 1.1 (Zurückgestellt: Hibernate-Statistik braucht eine echte Datenbank; Docker und PostgreSQL sind hier nicht verfügbar. Stattdessen zählen die Tests Repository-Aufrufe) Add a test helper that counts SQL statements (Hibernate statistics) and OpenSearch requests (client interceptor) and record current counts for recipe, store, and beacon lists.
- [ ] 1.2 (Mensch: Kopie der LeoCloud-Datenbank nötig; `V18` bricht bei Duplikaten oder Bereichsverletzungen mit klarer Meldung ab) Run case-duplicate and major/minor range queries against a copy of the LeoCloud database and clean up conflicts before V14.
- [ ] 1.3 (Zurückgestellt: Abstimmung mit den beiden Upsell-Changes steht aus) Coordinate candidate-selection changes with `stabilize-upsell-quality-and-request-lifecycle` and `harden-upsell-prefilter-quality`.

## 2. Upsell

- [ ] 2.1 (Zurückgestellt: `UpsellSuggestionService` wird parallel geändert) Extract `OpenAiRankingClient` (application-scoped `HttpClient`, `openai.base-url`, `@Bulkhead`, `@Timeout`, `@Fallback`) and add `quarkus-smallrye-fault-tolerance`.
- [ ] 2.2 (Zurückgestellt: `UpsellSuggestionService` wird parallel geändert) Remove `@Transactional` from `plan()`/`suggestions()`; add short read and `REQUIRES_NEW` write methods for cache and dismissal access.
- [x] 2.3 Add `OpenSearchService.getProductsByIds` (multi-get) and use it for trigger resolution. (`OpenSearchService.getProductsByIds`: eine `terms`-Suche mit `collapse` statt `mget`, weil die Dokument-IDs `<storeCode>:<id>` lauten; Nutzung in `RecipeService.mappingStatus`, Trigger-Auflösung im Upsell offen)
- [ ] 2.4 (Zurückgestellt: Abstimmung mit `stabilize-upsell-quality-and-request-lifecycle` offen) Replace `findUpsellCandidates` with the relevance query and deterministic sort.
- [x] 2.5 Apply active dismissals when ranking; make `UpsellDismissalRepository.findMatching` null-safe. (`UpsellDismissalRepository.findMatching` null-sicher, `suggestions()` wendet aktive Dismissals an; `plan()` und `sessionId` im Request fehlen noch)

## 3. Recipes

- [x] 3.1 Page recipe ids, then fetch recipes with tags via join fetch. (`RecipeRepository.listPageIds`, `listWithTagsByIds`)
- [x] 3.2 Add aggregate queries for mapped-ingredient counts, ingredient totals, and step counts per page. (`countMappedIngredientsByRecipeIds`, `RecipeIngredientRepository.countByRecipeIds`, `RecipeStepRepository.countByRecipeIds`)
- [x] 3.3 Use multi-get in `mappingStatus` for product resolution. (`mappingStatus` löst Produkte mit einer Anfrage auf; `listActiveByIngredient` läuft weiter je Zutat)

## 4. Admin Lists and Identity

- [x] 4.1 Add the request-scoped current-user cache with join-fetched region/store. (`RequestCurrentAdminUser`, `AdminAccessServiceCurrentUserCacheTest`)
- [x] 4.2 Batch store summary enrichment (active beacon counts, active layout ids) per page. (`StoreAdminService`, `StoreAdminServiceTest`)
- [x] 4.3 Rewrite `BeaconAdminService.listBeacons` as one scoped query with the active assignment and store. (zwei Abfragen statt einer: Beacons und aktive Zuordnungen mit Join-Fetch, weil Fetch-Joins auf Entity-Joins in Hibernate 6 nicht verlässlich sind; `BeaconAdminServiceListTest`)

## 5. OpenSearch Lifecycle and Static Data

- [x] 5.1 Make `OpenSearchClientConfig` application-scoped with a disposer. (`@Singleton` statt `@ApplicationScoped`, weil ArC den Client nicht proxien kann; `OpenSearchClientConfigTest`)
- [ ] 5.2 (Zurückgestellt: größerer Umbau des Start-ups, braucht echtes OpenSearch zum Testen) Move index preparation and category seeding to a start-up observer with retry and a readiness check; add an explicit `layouts` mapping.
- [ ] 5.3 (Zurückgestellt: hängt an 5.2) Remove request-path `ensureLayoutIndex` and `ensureSeeded` calls.
- [x] 5.4 Clamp `size`/`limit` parameters and move legacy history filtering and sorting into the OpenSearch query. (Grenzen in `ProductResource` und `LayoutService`; `ProductSizeClampTest`, `LayoutHistoryQueryTest`; `recordType`-Filter und Sortierung waren schon in der Abfrage, Java-Nachfilter bleibt)
- [ ] 5.5 (Zurückgestellt: nicht angefasst, geringer Nutzen) Add `DefaultLayoutProvider` and use it in all three services.
- [ ] 5.6 (Zurückgestellt: nicht angefasst; die Antwort ändert sich für iOS, das parallel bearbeitet wird) Add ETag/`If-None-Match` handling to the mobile layout route.
- [ ] 5.7 (Zurückgestellt: `deleteIndex` liefert noch kein 404, 503 fehlt) Return 409/404/503 from index maintenance operations.

## 6. Schema, Concurrency, Retention

- [x] 6.1 Write `V14__persistence_indexes_and_constraints.sql` (functional unique indexes, guarded `pg_trgm`, audit and cache indexes, major/minor checks, dropped unused index). (Datei heißt `V18__persistence_indexes_and_constraints.sql`, weil `V15` schon belegt ist und `harden-platform-security-baseline` `V16` und `V17` nutzt; nicht gegen PostgreSQL ausgeführt, `PersistenceIndexMigrationTest` prüft nur den Text)
- [x] 6.2 Lock the store row in `saveLayoutVersion` and `activateLayoutVersion`.
- [x] 6.3 Map unique-constraint violations to 409. (`ApiThrowableExceptionMapper`, `ApiThrowableUniqueViolationTest`)
- [x] 6.4 Add `@Min(0) @Max(65535)` to beacon DTOs and restrict the UUID-only fallback. (`BeaconDtos`, `MobileStoreService.resolveBeacon`; `BeaconDtoBoundsTest`, `MobileStoreBeaconResolutionTest`)
- [ ] 6.5 (Zurückgestellt: der Scheduler kommt mit `harden-platform-security-baseline`, sonst Merge-Konflikt in `pom.xml`) Add daily retention jobs for upsell cache, events, dismissals, and legacy layout versions.

## 7. Documentation

- [x] 7.1 Update `openspec/specs/shared-api/openapi.yaml` (bounded parameters, 304 response, maintenance status codes, beacon ranges). (Grenzen für `size`, `limit` und Beacon-`major`/`minor` in `openspec/specs/shared-api/openapi.yaml`; 304 und Wartungs-Statuscodes entfallen mit den zurückgestellten Tasks)
- [x] 7.2 Update `docs/audit/CODE_AUDIT.md` with the resolution status of each PERF and BUG finding. (`docs/audit/CODE_AUDIT.md` Abschnitt 5a)

## 8. Verification

- [ ] 8.1 (Zurückgestellt: keine Datenbank in Tests, siehe 1.1; Aufrufzähler stehen in `RecipeServiceTest`, `StoreAdminServiceTest`, `BeaconAdminServiceListTest`) Add Quarkus tests asserting the statement and request budgets from the spec.
- [x] 8.2 Add tests for dismissal suppression, null-safe matching, concurrent version numbering, 409 translation, beacon ranges, fallback restriction, ETag handling, and bounded parameters. (Dismissals, Null-Sicherheit, 409, Beacon-Bereiche und Fallback, Grenzen getestet; Versionsnummern (6.2) vorher getestet; ETag entfällt mit 5.6)
- [ ] 8.3 (Zurückgestellt: braucht Lasttest-Werkzeug und laufende Dienste) Run a local load test (k6 or `hey`) with 40 concurrent plan requests and a slow OpenAI stub; record p95 of `GET /api/stores`.
- [ ] 8.4 Run `./mvnw test` and `npx -y @fission-ai/openspec@1.3.1 validate optimize-backend-data-access --strict`.
