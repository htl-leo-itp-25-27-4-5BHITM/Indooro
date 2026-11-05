## 1. Format and App

- [x] 1.1 Add `SessionRecord`, `SyncRecord` and `TruthRecord.marker` to `NavigationRecordLine`; replay ignores `session` and `sync`.
- [x] 1.2 DEBUG recorder writes the `session` line first, adds the selected marker to `truth` lines and writes `sync-<n>` lines with a per-recording counter.
- [x] 1.3 DEBUG settings: pickers for scenario, role and marker, button for a sync mark.
- [ ] 1.4 Swift tests: round trip, old line without marker, format-conform values, replay ignores new lines. Written; to be confirmed by the CI job `swift-tests`.

## 2. Field Tooling and Documentation

- [x] 2.1 Extend the allowlist of `check_recording_anonymized.py` and add unit tests for accepted and rejected lines.
- [x] 2.2 Update `MEASUREMENT_PROTOCOL.md`, `TESTING.md` and `scripts/field/README.md`.
- [x] 2.3 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
