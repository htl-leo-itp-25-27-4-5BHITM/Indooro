## 1. Setup

- [ ] 1.1 Branch `pilot/catalog-import` from `origin/main` after `add-store-scoped-catalog` is merged; copy this change; baseline admin and backend checks.

## 2. Parsing and Validation (admin-ui)

- [x] 2.1 CSV parser (separator and BOM detection) with tests incl. Excel exports with umlauts.
- [x] 2.2 XLSX first-sheet parser if a license-compatible offline library is acceptable; otherwise document CSV-only. (decision: CSV only; no XLSX parser, Excel users save as CSV)
- [x] 2.3 Port validation rules from `scripts/pilot-data/csv_to_ndjson.py` with shared fixtures. (rules implemented from the prepare-pilot-store-operations design, because csv_to_ndjson.py does not exist yet; fixtures are synthetic)

## 3. Commit (backend + admin-ui)

- [x] 3.1 Bulk endpoint with per-row results and idempotency key; audit log; tests. (endpoint: POST /api/admin/products/bulk)
- [x] 3.2 UI: error table, overwrite confirmation, batch progress, retry; mocked browser tests. (`ProductCsvImport.tsx`; CSV specs in `products.spec.ts`)
- [x] 3.3 Enable the previously disabled commit only when all tests pass; update `PILOT_CUT.md` successor docs. (product commit enabled; category commit stays review-only and disabled)

## 4. Handover

- [ ] 4.1 Checks green; PR → `main`; `STATUS.md`.
