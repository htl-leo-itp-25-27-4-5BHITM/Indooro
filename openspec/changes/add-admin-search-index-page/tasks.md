## 1. Backend and contract

- [x] 1.1 Add `OpenSearchService.describeIndices()` (read-only) and `GET /api/admin/index` in `AdminResource` (role `admin`, `requireAdmin`).
- [x] 1.2 Add `getProductIndexOverview`, `IndexOverview` and `IndexVersion` to `openspec/specs/shared-api/openapi.yaml`; run `npm run contract:types`.
- [x] 1.3 Tests: `AdminIndexResourceTest` (anonymous 401, store-manager 403, admin 200 with a `null` count, 503 without internals) and `OpenSearchReindexServiceTest` (ordering, counts, alias flag, null on unreadable count, no writes).

## 2. Admin UI

- [x] 2.1 Add `api/searchIndex.ts` (shape checks, request helpers without `force`) and `searchIndex.ts` (comparison, confirmation text, error texts) with unit tests.
- [x] 2.2 Add `SearchIndexPage.tsx`, the admin-only route `/admin/next/search-index/` in `routes.ts` and `main.tsx`, the packaging entry in `candidate-paths.mjs` and the navigation entry "Suchindex".
- [x] 2.3 Add Playwright `search-index.spec.ts`: overview, unreadable count, reindex result, confirmation dialog, no `force`, 409 conflict, failed reindex, denied roles.

## 3. Docs and verification

- [x] 3.1 Add the page to `docs/pilot-readiness/operations/SEARCH_REINDEX.md`.
- [x] 3.2 `./mvnw test`, `npm run typecheck`, `npm run lint`, `npm test`, `npx playwright test`, `npm run contract:types:check`, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
