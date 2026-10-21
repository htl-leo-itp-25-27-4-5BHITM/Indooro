## Why

The test store `SPAR-Leonding-002` (profile `testroom`) reported 83 blocking findings on the live system: about 79 `PRODUCT_NO_SHELF` for product ids 20-71, 78-85 and 92-110, plus `DUPLICATE_PRODUCT_ID` warnings for ids that exist in the global catalog and in the store's own catalog. The cause is `StoreProductSource`: besides the store's own products (74 imported products, document id `storeCode:id`) it also loads the global catalog (products with neither `storeId` nor `storeCode`; the 153 legacy products in `products_v1`). The iOS app and the customer web always scope product requests by `storeCode`, so those global products are noise for a store that has its own catalog. A new store with its own products can therefore never turn green.

The readiness page has a second problem: after the Testraum profile is selected the radius input still shows 8 m, so the first result ignores the 10 m radius of the profile.

## What Changes

- Backend: when a store has at least one own product (`storeId` equals the store UUID or `storeCode` equals the store code), the readiness check evaluates only those products. Global products are ignored, so they create neither `PRODUCT_NO_SHELF` nor `DUPLICATE_PRODUCT_ID`. When the store has no own products, the global catalog is checked as before.
- The report counts the ignored products in `counts.skippedGlobalProducts` (0 when the global catalog was checked). This is an additive field of the readiness response; no new finding code. The readiness page and the Markdown export show it.
- Admin UI: the radius input starts at the radius of the store's coverage profile. The first readiness request carries no `radius` parameter, so the server answers with the profile default and the input shows `report.radius`. A radius the user types or applies wins until the profile of a later report differs; then the input falls back to the profile default. The store setup checklist also asks without `radius` now and no longer forces 8 m.

## Impact

- Affected: `backend/indooro_server/.../admin/readiness/` (`StoreProductSource`, `ReadinessDtos`, `StoreReadinessEvaluator`, `StoreReadinessService`), `admin-ui` (`ReadinessPage`, `readiness.ts`, `api/readiness.ts`), shared API contract (`ReadinessReport.counts.skippedGlobalProducts`), spec `store-layout-management`.
- No migration, no change to the product index or the apps. Behaviour changes only for stores that have own products and also see global products; their global findings disappear.
- A global product that is wrong stays unnoticed for a store with its own catalog. That is intended: the global catalog is checked per store only when the store has no catalog of its own.
