## ADDED Requirements

### Requirement: Release smoke check fails on empty stores
When `scripts/ops/smoke_check.sh` runs with a store code (given or read from `GET /api/mobile/stores`), it SHALL require that `GET /api/products?size=5&storeCode=<code>` and `GET /api/products/search?q=<query>&storeCode=<code>` each answer HTTP 200 with a JSON list of at least one item, and SHALL count an empty list, a non-JSON body or any other status as a failure that makes the script exit non-zero. The script SHALL remain read-only (GET only) and SHALL NOT send credentials.

#### Scenario: Store with an empty index
- **GIVEN** the store product list answers 200 with `[]`
- **WHEN** the smoke check runs
- **THEN** it prints `FAIL` for "Produkte je Markt" with the item count and exits with code 1

#### Scenario: Store with products
- **GIVEN** both store endpoints answer 200 with at least one item
- **WHEN** the smoke check runs
- **THEN** both checks print `OK` with the item count
