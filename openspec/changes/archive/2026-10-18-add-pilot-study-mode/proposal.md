## Why

Phase 3 of the pilot (`docs/pilot-readiness/03_PILOT_READINESS.md` 6.3) must measure whether test persons find products faster and with less help: task success, search time with and without the app, manual position corrections, unjustified route and stop changes, aborts. Measuring this with paper and a stopwatch is error-prone and does not capture the navigation events. The DEBUG navigation recorder (`Utilities/NavigationRecorder.swift`) records raw beacon data for replay, but not study tasks, outcomes or times, and it is not available in the pilot build.

## What Changes

- Add a study mode for the test lead, enabled by the Info.plist key `IndooroStudyMode` (true only on loan devices) and hidden from customers otherwise.
- The test lead enters a test id (e.g. `T07`, never a name), chooses the condition per task (with app / without app) and starts tasks from a task list (product ids) bundled as JSON or entered on the device.
- Per task the app records start, outcome („Gefunden“, „Hilfe gebraucht“, „Abgebrochen“), duration, positioning mode, number of manual position corrections, route rebuilds and active-stop changes without event (read-only from the navigation session), and app errors.
- „Ohne App“ tasks use the same screen as a stopwatch for the test lead.
- Export as CSV (one row per task) and JSON Lines (events) via the share sheet; nothing is sent to a server.

## Capabilities

### New Capabilities

- `pilot-study-mode`: test-lead study sessions with task timing, outcomes, navigation counters and local export.

### Modified Capabilities

- None.

## Impact

- Owner: Person A „iOS“ (Mac), branch `pilot/ios-study-mode` from `pilot/first-store` after `prepare-pilot-ios-build` is merged (uses `AppEnvironment`).
- iOS: new `Managers/StudySessionStore.swift`, new `Views/Study/*`, new `Models/StudyModels.swift`, `Info.plist` key, one entry point in `SettingsSheet` (owned by Person A); read-only observation of `NavigationSession` counters (owned by Erik; if a counter is missing, request it from Erik via `STATUS.md`).
- Export format is the input of `prepare-pilot-evaluation` (Person C); it is defined in `design.md` and must not change without updating that change.
- Privacy: only test ids; files stay on the loan device until shared to the team laptop; deleted after evaluation.
