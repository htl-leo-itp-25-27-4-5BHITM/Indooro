## 1. Recorder and flags

- [x] 1.1 `ShadowRecord` and line type `shadow` in `NavigationRecordLine`; replay ignores it; round-trip and unknown-type tests.
- [x] 1.2 `ShadowPositioning` writes one `shadow` line per epoch; separate flag `IndooroEngineDrivesNavigation`; `BeaconManager.positionSnapshots()` only with that flag; tests for flags off, shadow only, both.
- [x] 1.3 `TestRoomMarkers` M1 to M8 and `NavigationRecorder.recordTestRoomMarker`.

## 2. Debug settings

- [x] 2.1 Switches (persisted, override Info.plist and environment), marker quick picker, live beacon list (`LiveBeaconStore`), export hints in `SettingsSheet` (DEBUG only).

## 3. Evaluation tooling

- [x] 3.1 `compare_positioning.py` shadow mode, `evaluate_field_day.py` hook, anonymization check, verdict origin, synthetic `--shadow`, Python tests, `scripts/field/README.md`.

## 4. Documentation

- [x] 4.1 `docs/pilot-readiness/hardware/APP_AUFS_IPHONE.md` (German, step by step, typical errors).

## 5. Verification

- [x] 5.1 `python3 -I -m unittest discover -s scripts/field -p 'test_*.py'`; `swift test` in `Packages/IndooroKit`.
- [ ] 5.2 CI `ios.yaml` (simulator build, Release build, unit tests) and `swift-tests` green.
