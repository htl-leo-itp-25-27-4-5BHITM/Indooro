## ADDED Requirements

### Requirement: Release smoke check fails on empty stores
When `scripts/ops/smoke_check.sh` runs with an explicit store code, it SHALL require that `GET /api/products?size=5&storeCode=<code>` and `GET /api/products/search?q=<query>&storeCode=<code>` each answer HTTP 200 with a JSON list of at least one item, and SHALL count an empty list, a non-JSON body or any other status as a failure that makes the script exit non-zero. Without a store code the script SHALL check every store of `GET /api/mobile/stores`, print the item count per store, and fail only when no store has at least one product; the search is then run against the first store that has products and must answer 200. The script SHALL remain read-only (GET only) and SHALL NOT send credentials.

#### Scenario: Store with an empty index
- **GIVEN** the store product list answers 200 with `[]`
- **WHEN** the smoke check runs
- **THEN** it prints `FAIL` for "Produkte je Markt" with the item count and exits with code 1

#### Scenario: First listed store is empty, another has products
- **GIVEN** no store code is given and the first store of the list has no products while another store has
- **WHEN** the smoke check runs
- **THEN** it prints the per-store counts as `INFO`, an `OK` line naming the store with products, and exits with code 0

#### Scenario: No store has products
- **GIVEN** no store code is given and every listed store returns `[]`
- **WHEN** the smoke check runs
- **THEN** it exits with code 1

#### Scenario: Store with products
- **GIVEN** both store endpoints answer 200 with at least one item
- **WHEN** the smoke check runs
- **THEN** both checks print `OK` with the item count
