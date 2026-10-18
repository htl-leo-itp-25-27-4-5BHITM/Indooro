## 1. Baseline and Pre-checks

- [ ] 1.1 (Mensch: Hibernate-Statistik braucht eine echte PostgreSQL-Datenbank, Docker und PostgreSQL sind hier nicht verfügbar; bis dahin zählen die Tests Repository-Aufrufe) Add a test helper that counts SQL statements (Hibernate statistics) and OpenSearch requests (client interceptor) and record current counts for recipe, store, and beacon lists.
- [ ] 1.2 (Mensch: Kopie der LeoCloud-Datenbank nötig; `V18` bricht bei Duplikaten oder Bereichsverletzungen mit klarer Meldung ab) Run case-duplicate and major/minor range queries against a copy of the LeoCloud database and clean up conflicts before V14.
- [x] 1.3 Coordinate candidate-selection changes with `stabilize-upsell-quality-and-request-lifecycle` and `harden-upsell-prefilter-quality`. (Abgestimmt: #146 `pilot/upsell-quality-backend` ist gemergt; Kandidatenabfrage, OpenAI-Client und Transaktionen bauen darauf auf, Guard und Lifecycle bleiben unverändert)

## 2. Upsell

- [x] 2.1 Extract `OpenAiRankingClient` (application-scoped `HttpClient`, `openai.base-url`, `@Bulkhead`, `@Timeout`, `@Fallback`) and add `quarkus-smallrye-fault-tolerance`. (`OpenAiRankingClient` mit `@Bulkhead(4, 16)`, `@Timeout` über `openai.upsell.timeout-ms`, `@Fallback` auf leeres Ergebnis; `OpenAiRankingClientTest`, `OpenAiRankingClientTimeoutTest`, `OpenAiRankingBulkheadTest` gegen einen lokalen Stub, kein echter OpenAI-Aufruf)
- [x] 2.2 Remove `@Transactional` from `plan()`/`suggestions()`; add short read and `REQUIRES_NEW` write methods for cache and dismissal access. (Lese-Methoden `@Transactional`, Cache-Schreiben `REQUIRES_NEW`; `UpsellSuggestionTransactionTest`, `TransactionSelfInterceptionTest` belegt, dass ArC package-private Selbstaufrufe abfängt)
- [x] 2.3 Add `OpenSearchService.getProductsByIds` (multi-get) and use it for trigger resolution. (`getProductsByIds` für `<storeCode>:<id>` in `RecipeService.mappingStatus`, `getProductsByNumericIds` mit einer `terms`-Suche mit `collapse` für Trigger und Listen-IDs in `plan()`/`suggestions()`, weil die Dokument-IDs `<storeCode>:<id>` lauten; `OpenSearchProductsByNumericIdsTest`, `UpsellSuggestionServiceTest`. (Mensch: `collapse` mit Sortierung auf `storeCode` gegen ein echtes OpenSearch prüfen))
- [x] 2.4 Replace `findUpsellCandidates` with the relevance query and deterministic sort. (Fünf-Argument-Überladung mit `prefix`/`term` auf `layoutCode` für Trigger- (Boost 3) und Ergänzungskategorien (Boost 2), `match_all` mit Boost 0,1, Sortierung `_score` dann `id`; `OpenSearchUpsellCandidateQueryTest`; Java-Nachsortierung und globaler Fallback bleiben)
- [x] 2.5 Apply active dismissals when ranking; make `UpsellDismissalRepository.findMatching` null-safe. (`findMatching` null-sicher; `suggestions()` und `plan()` wenden aktive Dismissals vor dem Ranking an, `plan()` mit einer gebündelten Abfrage `findActiveForCheckedProducts`; optionales `sessionId` in `UpsellSuggestionRequest` und `UpsellPlanRequest`; der Cache-Schlüssel enthält die aktiven Dismissals)

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
- [x] 5.2 Move index preparation and category seeding to a start-up observer with retry and a readiness check; add an explicit `layouts` mapping. (`OpenSearchStartup` mit Wiederholung alle 30 s und `OpenSearchReadinessCheck` unter `/q/health/ready`; `layouts`-Mapping mit `elements` als `object` ohne Mapping; in `%test` abgeschaltet; `OpenSearchStartupTest`, `HealthEndpointTest`. (Mensch: Start gegen ein echtes OpenSearch prüfen, auch den Start mit später startendem OpenSearch))
- [x] 5.3 Remove request-path `ensureLayoutIndex` and `ensureSeeded` calls. (`LayoutRequestPathTest`: keine `indices()`-Aufrufe beim Lesen)
- [x] 5.4 Clamp `size`/`limit` parameters and move legacy history filtering and sorting into the OpenSearch query. (Grenzen in `ProductResource` und `LayoutService`; `ProductSizeClampTest`, `LayoutHistoryQueryTest`; `recordType`-Filter und Sortierung waren schon in der Abfrage, Java-Nachfilter bleibt)
- [x] 5.5 Add `DefaultLayoutProvider` and use it in all three services. (`DefaultLayoutProvider`, `DefaultLayoutProviderTest`)
- [x] 5.6 Add ETag/`If-None-Match` handling to the mobile layout route. (`MobileStoreResource` antwortet mit `ETag` und `Cache-Control: no-cache`, 304 ohne Inhalt; `LayoutEtag`, `MobileLayoutEtagTest`; OpenAPI und Typen neu erzeugt. (Mensch: iOS-Client kann `If-None-Match` später nutzen))
- [x] 5.7 Return 409/404/503 from index maintenance operations. (`AdminResource`, `OpenSearchService.deleteIndex`; `AdminIndexResourceTest`, `OpenSearchIndexCreationTest`)

## 6. Schema, Concurrency, Retention

- [x] 6.1 Write `V14__persistence_indexes_and_constraints.sql` (functional unique indexes, guarded `pg_trgm`, audit and cache indexes, major/minor checks, dropped unused index). (Datei heißt `V18__persistence_indexes_and_constraints.sql`, weil `V15` schon belegt ist und `harden-platform-security-baseline` `V16` und `V17` nutzt; nicht gegen PostgreSQL ausgeführt, `PersistenceIndexMigrationTest` prüft nur den Text)
- [x] 6.2 Lock the store row in `saveLayoutVersion` and `activateLayoutVersion`.
- [x] 6.3 Map unique-constraint violations to 409. (`ApiThrowableExceptionMapper`, `ApiThrowableUniqueViolationTest`)
- [x] 6.4 Add `@Min(0) @Max(65535)` to beacon DTOs and restrict the UUID-only fallback. (`BeaconDtos`, `MobileStoreService.resolveBeacon`; `BeaconDtoBoundsTest`, `MobileStoreBeaconResolutionTest`)
- [x] 6.5 Add daily retention jobs for upsell cache, events, dismissals, and legacy layout versions. (`DataRetentionJob`/`DataRetentionService`, `LayoutService.pruneLegacyVersions`; Schwellen über `indooro.retention.*`; `DataRetentionServiceTest`, `DataRetentionJobTest`, `LegacyLayoutPruneTest`)

## 7. Documentation

- [x] 7.1 Update `openspec/specs/shared-api/openapi.yaml` (bounded parameters, 304 response, maintenance status codes, beacon ranges). (Grenzen für `size`, `limit` und Beacon-`major`/`minor` in `openspec/specs/shared-api/openapi.yaml`; 304 und Wartungs-Statuscodes entfallen mit den zurückgestellten Tasks)
- [x] 7.2 Update `docs/audit/CODE_AUDIT.md` with the resolution status of each PERF and BUG finding. (`docs/audit/CODE_AUDIT.md` Abschnitt 5a)

## 8. Verification

- [ ] 8.1 (Mensch: Statement-Budgets brauchen eine echte Datenbank, siehe 1.1; Aufrufzähler stehen in `RecipeServiceTest`, `StoreAdminServiceTest`, `BeaconAdminServiceListTest`, `UpsellSuggestionServiceTest`) Add Quarkus tests asserting the statement and request budgets from the spec.
- [x] 8.2 Add tests for dismissal suppression, null-safe matching, concurrent version numbering, 409 translation, beacon ranges, fallback restriction, ETag handling, and bounded parameters. (Dismissals in `suggestions()` und `plan()`, Null-Sicherheit, 409, Beacon-Bereiche und Fallback, Grenzen und ETag getestet; Versionsnummern (6.2) vorher getestet)
- [ ] 8.3 (Mensch: braucht Lasttest-Werkzeug (k6 oder `hey`), laufende Dienste und einen langsamen OpenAI-Stub; Bulkhead und Timeout sind per `OpenAiRankingBulkheadTest` mit 20 gleichzeitigen Aufrufen belegt) Run a local load test (k6 or `hey`) with 40 concurrent plan requests and a slow OpenAI stub; record p95 of `GET /api/stores`.
- [x] 8.4 Run `./mvnw test` and `npx -y @fission-ai/openspec@1.3.1 validate optimize-backend-data-access --strict`.
