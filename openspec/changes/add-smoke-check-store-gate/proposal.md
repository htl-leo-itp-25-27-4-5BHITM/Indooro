## Why

On 2026-10-19 the store `SPAR-Leonding-002` received its catalog through the admin CSV import. `scripts/ops/smoke_check.sh` stayed green (exit 0) while `GET /api/products?storeCode=SPAR-Leonding-002` returned `[]`, because the OpenSearch index mapping did not match and the store filter found nothing. The check only compared the HTTP status of "Produkte je Markt" and "Suche je Markt" with 200, so an empty store passed.

## What Changes

- `scripts/ops/smoke_check.sh` treats the store-scoped product list and the store-scoped search as required checks that need HTTP 200 **and** at least one item in the JSON list. An empty list, a non-JSON body or a non-200 status is a FAIL.
- `scripts/ops/tests/test_smoke_check.py` covers an empty store list, an empty store search, an explicit `storeCode`/query, a non-list body and a 5xx.
- The script stays read-only: GET only, no credentials.

## Impact

- Affected: `scripts/ops/smoke_check.sh`, `scripts/ops/tests/test_smoke_check.py`, spec `deployment-operations`.
- No backend, admin or iOS change. No live access needed for the tests.
