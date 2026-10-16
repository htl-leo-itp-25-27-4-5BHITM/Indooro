## Why

Before a pilot session, the team must know that the store data is consistent: every test product points to a labeled shelf, the layout has an entrance, beacons are placed densely enough, and nothing customers will search for is missing. Today these checks are spread over the layout editor validation (`store-layout-management`: „Editor provides layout validation and readiness feedback“), the product list readiness flag (`product-catalog-search`: „Admin catalog shows product location readiness“) and manual spot checks. Products live in OpenSearch and layouts in PostgreSQL, so no single place compares them. A wrong `layoutCode` is invisible until a customer is sent to the wrong shelf.

## What Changes

- Add a store readiness report: backend endpoint `GET /api/stores/{storeId}/readiness` (admin, region-manager, store-manager with scope) that evaluates the active layout version and the store's products and returns blocking errors and warnings.
- Checks: active layout exists; exactly one entrance; target shelves without `category`/`meter`/`label`; products whose `layoutCode` matches no shelf; shelves without products; duplicate product ids; beacons assigned to the store but not placed; placed beacons without identity; walkable cells with fewer than three beacons within a configurable radius (default 8 m) as warning; layout units plausibility (grid size within 5–200 m).
- Add a page „Pilot-Bereitschaft“ in the rebuilt admin (`admin-ui`) per store that lists the findings with links to the editor element or product, a summary traffic light, and an export as Markdown for the session checklist.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `store-layout-management`: store-level readiness report across layout, products and beacons.

## Impact

- Owner: Person B „Backend & Betrieb“ (Windows). Branch `pilot/store-readiness`, created from `main` **after** `codex/admin-platform-rebuild` is merged; pull request to `main`.
- Backend: new resource and service under `backend/indooro_server/src/main/java/at/htl/admin/` (readiness), tests; reads `layout_versions` (PostgreSQL), products (OpenSearch), beacon assignments.
- Admin UI: new route and page in `admin-ui/src/`, unit and mocked browser tests; built output per the admin rebuild's build process.
- API: one new protected GET route; no public route changes; `shared-api/openapi.yaml` updated.
- No iOS change.
