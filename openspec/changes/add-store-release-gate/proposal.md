## Why

A newly created market is `ACTIVE` at once and appears in the customer market list (`GET /api/mobile/stores`, used by iOS and `/customer/`) before it has a layout or products. Live, customers saw markets in which every search answered "Nichts gefunden". The smoke check only reported such empty markets as INFO.

## What Changes

- Flyway `V20__store_released.sql`: additive column `stores.released BOOLEAN NOT NULL DEFAULT TRUE`, so every existing store stays visible. The application creates new stores with `released = false`.
- `GET /api/mobile/stores` lists only `ACTIVE` stores with `released = true`. The response shape is unchanged (no new field). Layout and beacon lookups by id are not gated, so a field test with an unreleased store keeps working.
- New admin endpoints `PATCH /api/stores/{storeId}/release` and `PATCH /api/stores/{storeId}/withdraw` (role `admin`, idempotent, audit entry `RELEASE` / `WITHDRAW`). A release of an archived store answers 409. `StoreSummaryResponse` and `StoreDetailResponse` get the additive field `released`.
- Admin UI: store detail page section "Kundenansicht" with status and the buttons "Für Kunden freigeben" / "Freigabe zurücknehmen" (admin only).
- `scripts/ops/smoke_check.sh`: a listed market with 0 own products is a `WARN` (counted separately, exit code stays 0).
- Operator guide `MARKT_EINRICHTEN.md`: new step 8.

## Impact

- Affected: backend (`StoreEntity`, `StoreAdminService`, `StoreAdminResource`, `MobileStoreService`, migration), shared API contract (two store endpoints, `released` on two store schemas), generated types, `admin-ui` (`StoreDetailPage`), `scripts/ops/smoke_check.sh`, docs, spec `admin-platform-management`.
- No iOS change; the mobile response is unchanged.
- Release is manual and does not depend on the readiness verdict (open design question).
