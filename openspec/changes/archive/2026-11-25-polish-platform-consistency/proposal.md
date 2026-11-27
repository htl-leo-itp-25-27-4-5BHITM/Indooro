## Why

Indooro should be production-ready on every platform. Today the REST create endpoints answer inconsistently (some return the full entity with 200, some upsert), the admin web has needless intermediate pages, cut-off tables and a layout editor that scrolls the whole page, and the iOS app and the pilot showcase have open layout and consistency issues. The product owner wants every platform polished, consistent and clean.

## What Changes

- **BREAKING (wire format):** every backend POST endpoint that creates a single resource answers `201 Created` with a `Location` header that points to the new resource and an empty body. Upsert POST endpoints answer `201` when they create and `204 No Content` with the same `Location` header when they update. Action endpoints (reindex, activate, assign, release, export, import, bulk, mobile upsell) keep their current responses.
- Every `Location` target is readable by a `GET` endpoint with the same role rules; missing `GET` endpoints are added.
- Clients (`admin-ui` API layer, `api-tests`, OpenAPI contract) follow the `Location` header or re-fetch. The admin client accepts both the old body and the new `Location` form during rollout.
- Admin web: after "Store anlegen" the user lands directly on the new store; tables fit the content column or switch to a responsive layout without a cut-off; the layout editor fills the viewport without page scrolling; all admin pages get consistent spacing, buttons, labels, German copy, and empty, loading and error states.
- iOS app: sweep for overflow, truncation, Dynamic Type, safe-area and copy consistency issues and fix them.
- Pilot showcase and legacy web (`app/`): sweep for overflow and consistency issues. `android/` contains only planning documents and is checked for stale API statements only.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `shared-api`: create endpoint response contract.
- `admin-platform-management`: navigation after create, responsive tables, editor viewport, consistent page states.
- `ios-client-architecture`: layout and copy consistency.
- `customer-web-experience`: pilot showcase layout consistency.

## Impact

- Backend: `backend/indooro_server/src/main/java/at/htl/resource/**` and tests.
- Contract: `api/openapi/**`, `api-tests/httpyac/**`.
- Admin web: `admin-ui/src/**`.
- iOS: `swift/indooro-EinkaeuferFinal/**`.
- Web: `pilot-showcase/**`, `app/**`, `android/*.md`.
- Deploy: backend and admin web must roll out together; the tolerant admin client removes the ordering risk.
