## Why

For the pilot, product data is prepared with a Python script (`prepare-pilot-store-operations`). Store staff will not run scripts. The rebuilt admin has a reviewed bulk import, but its commit is disabled (`docs/admin-rebuild/PILOT_CUT.md`) and it accepts only JSON/NDJSON. A store manager should be able to upload the Excel export they already have, see every row that does not match a shelf, fix it, and import safely.

## What Changes

- Admin catalog import accepts CSV (semicolon/comma, UTF-8 with or without BOM) with the column template from `prepare-pilot-store-operations`, and XLSX (first sheet) parsed in the browser.
- Validation against the store's active layout (same rules as `csv_to_ndjson.py`: shelf exists, label present, unique ids, numeric fach/reihe) with a per-row error table.
- Finish the disabled commit: atomic per batch, partial-result reporting, retry for transport-unknown outcomes, overwrite confirmation, audit log.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `catalog-maintenance-operations`: spreadsheet import with layout validation and safe commit.

## Impact

- Owner: Person B (Windows). Branch `pilot/catalog-import` from `main` after the admin rebuild merge and after `add-store-scoped-catalog`.
- Admin UI: `CatalogImport` page; vendored XLSX parser only if license-compatible and offline, otherwise CSV only.
- Backend: bulk endpoint returns per-row results; idempotency key per batch; tests.
