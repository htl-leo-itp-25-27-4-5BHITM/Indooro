## 1. Setup

- [ ] 1.1 Branch `pilot/store-catalog` from `origin/main` after the admin rebuild merge; copy this change; baseline tests; coordinate alias work with `improve-product-search-quality` in `STATUS.md`.

## 2. Backend

- [x] 2.1 Store-scoped document ids and required `storeId`/`storeCode` on writes; validation errors in German.
- [x] 2.2 Search and list filter by store; default store configuration; tests.
- [x] 2.3 Admin product endpoints: required store, scope checks; `@QuarkusTest` for admin/region/store manager/anonymous.
- [x] 2.4 Bulk import requires store; NDJSON from `scripts/pilot-data` accepted unchanged.

## 3. Admin UI

- [x] 3.1 Store selector on products page; list/edit within store; tests.

## 4. Migration

- [x] 4.1 `scripts/ops/migrate_products_to_store.py` with dry run; tests with sample data.
- [ ] 4.2 Local rehearsal; document LeoCloud commands for Erik (after backup).
- [ ] 4.3 Verify the iOS app sends store parameters (search request log); report gaps to Person A.

## 5. Handover

- [ ] 5.1 Checks green; PR → `main`; `STATUS.md`.
