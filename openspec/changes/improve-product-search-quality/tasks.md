## 1. Setup

- [x] 1.1 After the admin rebuild merge: branch `pilot/search-quality` from `origin/main`; copy this change from `origin/pilot/first-store`; baseline `sh ./mvnw test`.
- [x] 1.2 Start a local OpenSearch (docker compose) and load `demoproducts.ndjson`.

## 2. Quality Set First

- [x] 2.1 Write `backend/indooro_server/src/test/resources/search-quality/queries.csv` (60 queries, expected product ids top-3) on the demo catalog: typos, partial words, umlauts, Austrian words, brands.
- [x] 2.2 Add `SearchQualityTest` computing precision@3; record the baseline value of the current query in `design.md`.

## 3. Index and Query

- [x] 3.1 Add index settings/mapping JSON and `synonyms_de.txt` (≥ 40 entries).
- [ ] 3.2 Implement alias-based index creation and reindex (`products_vN`, alias `products`), keeping old index; tests.
- [x] 3.3 Rework the query with boosts per design; keep `size`, `storeId`, `storeCode` behavior.
- [x] 3.4 Iterate until precision@3 ≥ 0.85; document each iteration's value.

## 4. Operations

- [ ] 4.1 Document the LeoCloud reindex and alias switch (commands only, executed by Erik) in `docs/pilot-readiness/operations/SEARCH_REINDEX.md`.
- [ ] 4.2 All checks green; PR → `main`; `STATUS.md`.
