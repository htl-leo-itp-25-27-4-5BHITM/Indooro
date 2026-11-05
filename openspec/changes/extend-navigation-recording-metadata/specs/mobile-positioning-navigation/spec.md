## ADDED Requirements

### Requirement: Recordings carry anonymous session metadata
A DEBUG recording SHALL start with exactly one `session` line of schema `indooro-recording/2` that contains the app version, the hardware model identifier (not the device name or a device identifier) and the iOS version, and optionally a scenario (`S1` to `S4`) and a role (`calibration` or `evaluation`). `truth` lines SHALL carry the marker selected in the settings as `marker` matching `^M[0-9]{1,3}$` and SHALL omit the field when none is selected. The recorder SHALL write `sync` lines with a label matching `^sync-[0-9]{1,4}$`, numbered consecutively per recording. These lines SHALL contain no free text. Recordings without them SHALL remain readable, and the replay SHALL ignore `session` and `sync` lines.

#### Scenario: Recording with scenario, marker and sync mark
- **GIVEN** scenario S1, role evaluation and marker M3 selected in the DEBUG settings
- **WHEN** a recording is started, a long press sets a truth point and a sync mark is set
- **THEN** the first line is a `session` line with scenario `S1` and role `evaluation`, the `truth` line has `"marker":"M3"` and a `sync` line has label `sync-1`

#### Scenario: Old recording without session line
- **GIVEN** a recording from an earlier build without `session`, `sync` or `marker`
- **WHEN** it is parsed and replayed
- **THEN** it decodes unchanged and yields the same replay metrics

#### Scenario: Anonymization check of the new lines
- **GIVEN** a `session` line with an additional free-text field or a `truth` line with marker `Punkt A`
- **WHEN** the anonymization checker runs
- **THEN** it reports a violation and a recording with only the specified fields and patterns passes
