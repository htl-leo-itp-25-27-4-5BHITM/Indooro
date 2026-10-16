## ADDED Requirements

### Requirement: Pilot metrics are computed against versioned acceptance criteria
The evaluation tool SHALL read study exports in the format defined by `add-pilot-study-mode`, questionnaire results and field measurement summaries, SHALL compute task success without help, paired search time comparison with and without the app, manual position corrections per tour, unjustified stop changes, false reroutes per tour, abort rate, reuse intention share, and technical incident rate, and SHALL report each metric with its criterion from a versioned criteria file and a verdict „erfüllt“, „nicht erfüllt“ or „zu wenig Daten“.

#### Scenario: Synthetic sample
- **GIVEN** the committed synthetic sample with 12 test ids
- **WHEN** the evaluation runs
- **THEN** the report lists every metric with value, criterion, verdict and the criteria version

#### Scenario: Too few pairs
- **GIVEN** fewer than 10 paired tasks
- **WHEN** the time comparison is computed
- **THEN** the verdict is „zu wenig Daten“ and the descriptive values are still shown

### Requirement: Evaluation inputs are validated and anonymous
The evaluation tool SHALL reject input files with missing columns, unknown enum values, or identifiers that do not match `^T\d{1,3}$`, SHALL run with the Python standard library on Windows, macOS and Linux, and SHALL write two reports: a team report and a store report of at most two pages without technical identifiers.

#### Scenario: Name instead of test id
- **GIVEN** a questionnaire row with test id „Max“
- **WHEN** the evaluation runs
- **THEN** it stops with an error naming the file and row and writes no report
