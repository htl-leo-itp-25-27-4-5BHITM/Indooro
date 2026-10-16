## Decisions

1. **Document id** = `<storeCode>:<productId>` so equal product ids in two stores do not collide; `productId` stays visible.
2. **Default store** for requests without store: configuration `indooro.catalog.default-store-code` (the demo store) to keep old clients working.
3. **Admin**: product list and edit always within one selected store; store managers only see their store.
4. **Migration**: script `scripts/ops/migrate_products_to_store.py` (export → rewrite → bulk into new index → alias switch), coordinated with `improve-product-search-quality` (same alias mechanism; whichever lands first introduces the alias).
