## Why

Field recordings carry no session metadata. Device model, app version, scenario and role are noted by hand, and the reference points (`truth`) are matched to the marker table only by coordinate. External references (stopwatch, video) cannot be aligned in time. The measurement lab tooling needs a binding recording format that supplies this information without free text, so that anonymization stays strict.

## What Changes

- Extend the DEBUG recording format to `indooro-recording/2`, additive and backward compatible: a `session` first line (schema, app version, hardware model identifier, iOS version, optional scenario S1 to S4 and role calibration/evaluation), `sync` lines (`sync-<n>`) and an optional `marker` (`M<n>`) on `truth` lines.
- The DEBUG settings get pickers for scenario, role and marker and a button to set a sync mark.
- `NavigationRecordLine` decodes and encodes the new line types; the replay ignores `session` and `sync`. Old recordings without these lines stay valid.
- The anonymization checker accepts exactly these lines and fields with fixed patterns and still rejects everything else (no free text, no device name, no device identifier). Measured power is not part of version 2.

## Impact

- Affected specs: `mobile-positioning-navigation`.
- Affected code: `NavigationReplay.swift`, `NavigationRecorder.swift` (DEBUG), `SettingsSheet.swift` (DEBUG), `scripts/field/check_recording_anonymized.py`, field documentation.
