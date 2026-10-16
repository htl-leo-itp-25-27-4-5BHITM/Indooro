## ADDED Requirements

### Requirement: Store staff can import product spreadsheets safely
The admin catalog import SHALL accept CSV files based on the pilot template (and XLSX when supported), SHALL validate every row against the selected store's active layout before commit, SHALL show a per-row error table, SHALL require explicit confirmation before overwriting existing products, SHALL commit in batches with per-row results and an idempotency key, and SHALL write an audit log entry per batch.

#### Scenario: Row without shelf
- **GIVEN** a CSV with 120 rows of which row 37 references a missing shelf
- **WHEN** the store manager uploads it
- **THEN** row 37 is listed with the reason, the commit button stays disabled until the row is fixed or excluded

#### Scenario: Retry after network loss
- **GIVEN** a batch commit whose response was lost
- **WHEN** the user retries
- **THEN** no product is created twice
