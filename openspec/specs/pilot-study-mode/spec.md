# pilot-study-mode Specification

## Purpose
Defines the on-device study mode for test leads: sessions, tasks, outcomes and anonymous CSV/JSONL export.
## Requirements
### Requirement: Study mode is available only on configured loan devices
The iOS app SHALL show the test-lead entry „Testleitung“ only WHEN the Info.plist key `IndooroStudyMode` is true. A study session SHALL require a test id matching `T` followed by one to three digits and SHALL NOT accept names or other free text as identifier.

#### Scenario: Customer build
- **GIVEN** `IndooroStudyMode` is false or missing
- **WHEN** the settings sheet is opened
- **THEN** no „Testleitung“ entry is visible

#### Scenario: Invalid test id
- **GIVEN** study mode is enabled
- **WHEN** the test lead enters „Anna“ as test id
- **THEN** the session cannot be started and the hint „Test-ID im Format T07“ is shown

### Requirement: Study tasks record time, outcome and navigation counters
For each task the study mode SHALL record start and end time, condition (`app` or `ohne_app`), positioning mode, outcome (`gefunden`, `hilfe`, `abgebrochen`), and for condition `app` the number of manual position settings, route rebuilds after the start, and active-stop changes without a completion, skip, list change or re-plan event during the task.

#### Scenario: Task with app
- **GIVEN** a running session with test id T07 and task 3 „Backpulver“ in condition `app`
- **WHEN** the test person sets the position once and the test lead taps „Gefunden“ after 48 seconds
- **THEN** the task row contains duration 48.0, outcome `gefunden`, manual_position_count 1

#### Scenario: Task without app
- **GIVEN** task 4 in condition `ohne_app`
- **WHEN** the test lead starts and stops the timer
- **THEN** the task row contains the duration and positioning_mode `-`

### Requirement: Study data is exported locally in a fixed format
The study mode SHALL export each session as a CSV file with the header defined in this change's design and as a JSON Lines event file via the system share sheet, SHALL store files only on the device until shared, SHALL NOT send study data to any server, and SHALL offer deleting all stored sessions after confirmation.

#### Scenario: Export
- **GIVEN** a finished session T07 with five tasks
- **WHEN** the test lead taps „Exportieren“
- **THEN** a CSV with five data rows and the documented header and a JSONL file are offered in the share sheet and no network request is made

