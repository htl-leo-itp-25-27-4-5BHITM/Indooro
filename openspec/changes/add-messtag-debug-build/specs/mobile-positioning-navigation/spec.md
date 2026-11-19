## ADDED Requirements

### Requirement: Shadow recording is record-only
When the shadow switch is on, the app SHALL run `PositioningEngine` next to the legacy positioning and SHALL write one `shadow` line per engine epoch into the running recording (`indooro-recording/2`, additive line type). The line SHALL carry the timestamp, the legacy side (x, y if any, status) and the engine side (x, y if any, status, confidence). Shadow mode alone SHALL NOT change route ticks, map position or arrival detection; they stay on the legacy path. Route ticks SHALL use the engine only when the separate switch "engine drives navigation" is on, which defaults to off and requires shadow mode. With all switches off no shadow engine SHALL be started and Release behaviour SHALL be unchanged.

#### Scenario: Shadow on, engine navigation off
- **GIVEN** shadow mode on and "engine drives navigation" off
- **WHEN** a navigation session attaches to the position source
- **THEN** it consumes the legacy samples and not the engine snapshots, and the recording gains `shadow` lines

#### Scenario: All switches off
- **GIVEN** no switch is set in Info.plist, environment or settings
- **WHEN** the app starts
- **THEN** no shadow engine is created and no `shadow` line is written

#### Scenario: Older reader
- **GIVEN** a recording with `shadow` lines
- **WHEN** a reader without the line type parses it, or replay runs on it
- **THEN** the lines are skipped and the replay result does not change

### Requirement: Field-day debug build
DEBUG builds SHALL offer in the settings: the shadow switch, the engine-navigation switch, recording role and scenario pickers, a quick picker M1 to M8 that writes the truth marker at the cell centre of the test room without a map tap, start and stop of the recording, export of recordings through the share sheet, and a live list of heard beacons (UUID, major, minor, RSSI, last seen) sorted by RSSI. The switches SHALL persist and SHALL override Info.plist and environment in DEBUG. Release builds SHALL NOT contain these controls.

#### Scenario: Marker quick pick
- **GIVEN** a recording is running
- **WHEN** the person taps M3
- **THEN** a truth line with marker `M3` at (4.5, 5.5) is written

### Requirement: Evaluation of shadow recordings
`scripts/field/compare_positioning.py` SHALL, for a recording with `shadow` lines, compute per-epoch errors of both paths against the truth markers with the metric definitions of the replay comparison and write `<name>-comparison.json` of schema `indooro-position-comparison/1` with `origin: "shadow"`, without Swift and without a layout. `evaluate_field_day.py` SHALL use it as the shadow source.

#### Scenario: Synthetic shadow recording
- **GIVEN** a synthetic rehearsal recording with `shadow` lines
- **WHEN** the field-day evaluation runs
- **THEN** the report names "Schattenbetrieb" as the comparison source and the replay comparison is not started
