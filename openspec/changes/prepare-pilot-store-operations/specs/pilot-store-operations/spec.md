## ADDED Requirements

### Requirement: Pilot store layouts follow documented conventions
A store layout used in a pilot SHALL use 1 grid cell = 1 meter, SHALL contain exactly one element of type `entrance`, and every shelf element that is a product target SHALL have `category`, `meter` and a customer-readable `label` in the format „Gang <n> · <links|rechts> · <Warengruppe>“. Board numbers (`fach`) SHALL be counted from the floor starting at 1 and positions (`reihe`) from the left when facing the shelf.

#### Scenario: Layout review before publishing
- **GIVEN** a pilot layout draft with two shelves without label
- **WHEN** the onboarding checklist is applied
- **THEN** the layout is not activated until both shelves have a label in the documented format

### Requirement: Product spreadsheets are converted and validated against the layout
The pilot data tooling SHALL convert a semicolon-separated CSV based on the documented template into bulk NDJSON for `POST /api/products/bulk`, SHALL generate `layoutCode` as `kategorie/meter/fach/reihe`, and SHALL reject the conversion with a per-row error list WHEN a row has no matching shelf in the given layout JSON, a duplicate id, an empty name, or a non-numeric `fach` or `reihe`.

#### Scenario: Valid spreadsheet
- **GIVEN** a CSV with 150 rows whose shelves all exist in the layout
- **WHEN** the converter runs
- **THEN** it writes 150 products as bulk NDJSON and exits with code 0

#### Scenario: Unknown shelf
- **GIVEN** a CSV row with kategorie 812 and meter 3 that matches no shelf
- **WHEN** the converter runs
- **THEN** it reports the row number and reason and exits with a non-zero code without writing a partial file

### Requirement: Pilot sessions use a checklist and documented consent
Before each in-store pilot session the team SHALL complete the store onboarding checklist (agreement signed, area and dates fixed, layout activated, product sample of 20 checked at the shelf, beacons recorded, backup taken, smoke check passed, test devices charged with the pilot build). Test persons SHALL sign the consent form before taking part; recordings and questionnaires SHALL use a test id instead of a name, and consent forms SHALL be stored separately from data.

#### Scenario: Missing backup blocks the session
- **GIVEN** a planned session and no backup from the same day
- **WHEN** the checklist is reviewed
- **THEN** the session does not start until a backup exists

#### Scenario: Test person data
- **GIVEN** a test person completes a task
- **WHEN** results are recorded
- **THEN** the recording and questionnaire carry only the test id

### Requirement: Mobile pilot endpoints have a smoke check
The operations tooling SHALL provide a smoke check that, for a given store id, verifies HTTP 200 and non-empty content for `GET /api/mobile/stores`, `GET /api/mobile/stores/{storeId}/layout/current` and `GET /api/products/search?q=<sample>`, and reports the number of shelves, beacons and products.

#### Scenario: Smoke check before a session
- **WHEN** the smoke check runs against LeoCloud for the pilot store
- **THEN** it prints status, shelf count, beacon count and product count and exits non-zero on any failure
