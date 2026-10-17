## Decisions

1. **Document id** = `<storeCode>:<productId>` so equal product ids in two stores do not collide; `productId` stays visible.
2. **Default store** for requests without store: configuration `indooro.catalog.default-store-code` (the demo store) to keep old clients working.
3. **Admin**: product list and edit always within one selected store; store managers only see their store.
4. **Migration**: script `scripts/ops/migrate_products_to_store.py` (export → rewrite → bulk into new index → alias switch), coordinated with `improve-product-search-quality` (same alias mechanism; whichever lands first introduces the alias).

## Implementation notes

- Document id: products with a store are indexed as `<storeCode>:<productId>` (`OpenSearchService.documentId`); products without store (legacy data before the migration) keep `<productId>`. Reads never depend on the document id: `getProductById` searches on the `id` field plus an optional store filter.
- Writes require a store. `storeId` (UUID) and `storeCode` are resolved against the `stores` table (`CatalogStoreResolver`); both fields are then written from the database record. Single writes and admin writes answer 400 for a missing or unknown store, and for a storeId/storeCode pair that refers to two stores.
- Bulk: `storeId`/`storeCode` query parameters are the default store for items without their own store. An item that contradicts the parameter (or names an unknown store) is reported as a `failed` row; a request without any store is rejected with 400.
- Default store: `indooro.catalog.default-store-code` (env `CATALOG_DEFAULT_STORE_CODE`, empty = not set). It only applies to `GET /api/products/search`, `GET /api/products` and `GET /api/products/{id}` when neither `storeId` nor `storeCode` is given. Unset keeps the previous unfiltered behavior.
- Upsell: the fallback candidate pool is limited to products without any store (`findUnscopedUpsellCandidates`), so it never suggests products of other markets. The checked product is looked up within the request store.
- Roles: `/api/admin/products` (GET, POST, DELETE) accepts `admin`, `region-manager` and `store-manager`; every call names one store and runs `AdminAccessService.requireStoreAccess`. The legacy `POST /api/products` and `POST /api/products/bulk` stay `admin`-only.
