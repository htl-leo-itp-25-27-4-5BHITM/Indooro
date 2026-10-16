## ADDED Requirements

### Requirement: Pilot store layouts follow documented conventions
A store layout used in a pilot SHALL use 1 grid cell = 1 meter, SHALL contain exactly one element of type `entrance`, and every shelf element that is a product target SHALL have `category`, `meter` and a customer-readable `label` in the format „Gang <n> · <links|rechts> · <Warengruppe>“. Board numbers (`fach`) SHALL be counted from the floor starting at 1 and positions (`reihe`) from the left when facing the shelf.

#### Scenario: Layout review before publishing
- **GIVEN** a pilot layout draft with two shelves without label
- **WHEN** the onboarding checklist is applied
- **THEN** the layout is not activated until both shelves have a label in the documented format

### Requirement: Product spreadsheets are converted and validated against the layout
The pilot data tooling SHALL convert a CSV based on the documented template into bulk NDJSON for `POST /api/products/bulk`, SHALL generate `layoutCode` as `kategorie/meter/fach/reihe`, SHALL run on Windows, macOS and Linux with the Python standard library only, and SHALL reject the conversion with a per-row error list and without writing an output file WHEN a row has no matching shelf in the given layout JSON, a duplicate id, an empty name, or a non-numeric `fach` or `reihe`.

#### Scenario: Valid spreadsheet
- **GIVEN** a CSV with 150 rows whose shelves all exist in the layout
- **WHEN** the converter runs
- **THEN** it writes 150 products as bulk NDJSON and exits with code 0

#### Scenario: Unknown shelf
- **GIVEN** a CSV row with kategorie 812 and meter 3 that matches no shelf
- **WHEN** the converter runs
- **THEN** it reports the row number and reason, writes no file, and exits with a non-zero code

#### Scenario: Excel export on Windows
- **GIVEN** a CSV saved by Excel with UTF-8 BOM and semicolons
- **WHEN** the converter runs on Windows
- **THEN** umlauts in names are preserved in the output

### Requirement: Pilot sessions use a checklist and documented consent
Before each in-store pilot session the team SHALL complete the store onboarding checklist (agreement signed, area and dates fixed, layout activated, readiness report without blocking errors, product sample of 20 checked at the shelf, beacons recorded, backup taken, smoke check passed, test devices charged with the pilot build). Test persons SHALL sign the consent form before taking part; recordings and questionnaires SHALL use a test id instead of a name, and consent forms SHALL be stored separately from data and outside the repository.

#### Scenario: Missing backup blocks the session
- **GIVEN** a planned session and no backup from the same day
- **WHEN** the checklist is reviewed
- **THEN** the session does not start until a backup exists

#### Scenario: Test person data
- **GIVEN** a test person completes a task
- **WHEN** results are recorded
- **THEN** the recording and questionnaire carry only the test id
