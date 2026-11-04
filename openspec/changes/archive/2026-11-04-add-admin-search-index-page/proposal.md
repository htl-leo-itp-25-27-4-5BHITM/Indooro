## Why

On 2026-10-19 the search index of `SPAR-Leonding-002` had to be reindexed and the alias switched. `POST /api/admin/index/reindex` and `POST /api/admin/index/activate` exist, but only an admin could call them, from the browser console. A read endpoint for the current alias target and the versions did not exist at all (`GET /api/admin/index` was only a login-redirect probe in `smoke_check.sh`; the path only served `DELETE`).

## What Changes

- Backend: `GET /api/admin/index` (operation `getProductIndexOverview`, role `admin`, read-only) returns the alias, the source index with its document count, the version indices (ascending) with their document counts and the versions that carry the alias. A count that cannot be read is `null`, never `0`. Added to the shared contract `openspec/specs/shared-api/openapi.yaml`; generated types refreshed.
- Admin UI: new admin-only page "Suchindex" at `/admin/next/search-index/` (sidebar entry for role `admin`). It shows the alias target and the versions with counts and a comparison with the source. "Reindex starten" shows the source and target counts of the result. "Aktivieren" per inactive version opens a confirmation dialog with the switch and both counts. The page never sends `force=true`; a `409` shows the server text and leaves the alias as it is.
- `docs/pilot-readiness/operations/SEARCH_REINDEX.md` points to the page.

## Impact

- Affected: `AdminResource`, `OpenSearchService`, `admin-ui` (page, API module, routes, packaging entry), shared API contract, specs `admin-platform-management` and `catalog-maintenance-operations`.
- No index is created, deleted or switched by this change. The existing write endpoints are unchanged.
