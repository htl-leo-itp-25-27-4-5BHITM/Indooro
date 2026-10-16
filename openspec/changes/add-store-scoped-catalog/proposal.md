## Why

All live products have `storeId: null` (checked 2026-10-16: `GET /api/products?size=1` returns `"storeId":null,"storeCode":null`). The catalog is global: the demo supermarket's 153 products and the pilot store's products would be mixed in one search, and a product can point to a shelf code that exists in one store but not in another. For a real pilot store (EUROSPAR Leonding/Hart, `SPAR-Leonding-001`) the app must show only that store's products and positions.

## What Changes

- Make product documents store-scoped: every product belongs to exactly one store (`storeId`, `storeCode`), ids unique per store.
- Mobile search and product list filter by store; requests without store keep working for legacy clients but return only products of a configured default store.
- Admin product pages and bulk import require a store and enforce store-manager scope.
- Migration script assigns the existing 153 demo products to the demo store and documents how pilot store products are imported.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `product-catalog-search`: products are store-scoped; mobile search filters by store.

## Impact

- Owner: Person B (Windows). Branch `pilot/store-catalog` from `main` after the admin rebuild merge.
- Backend: `OpenSearchService`, `ProductResource`, `AdminProductResource`, bulk import, scope checks, tests; admin UI products page store selector.
- iOS: already sends `storeId`/`storeCode` after `prepare-pilot-ios-build` 4.4; verify only.
- Data: one-time migration on LeoCloud after backup (executed by Erik).
