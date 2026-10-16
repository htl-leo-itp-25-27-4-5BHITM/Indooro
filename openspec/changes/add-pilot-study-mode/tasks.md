## 1. Setup

- [x] 1.1 Start only after `prepare-pilot-ios-build` is merged into `pilot/first-store`. Check out `pilot/ios-study-mode` and merge `origin/pilot/first-store`; confirm `swift test` and the simulator build pass.
- [x] 1.2 Read this change, `add-pilot-guided-tour-fallbacks/design.md` (NavigationSession) and `prepare-pilot-evaluation/design.md` (consumer of the export).
- [x] 1.3 Check which counters `NavigationSession` exposes (design decision 2); for missing ones add a request in `docs/pilot-readiness/team/STATUS.md` „Blocker“ for Erik and continue with timing/outcome first.
- [x] 1.4 Run `npx -y @fission-ai/openspec@1.3.1 validate add-pilot-study-mode --strict`.

## 2. Model and Store

- [x] 2.1 Add `Models/StudyModels.swift` (session, task, outcome, condition, event) with `Codable`; test id validation `^T\d{1,3}$`.
- [x] 2.2 Add `Managers/StudySessionStore.swift`: create session, load task list (`study-tasks.json` in bundle or manual), start/stop tasks, snapshot counters, write JSONL events, persist under `Documents/StudySessions/`.
- [x] 2.3 Implement the CSV writer exactly per design decision 4 (header order, enums, ISO timestamps, one decimal).
- [x] 2.4 Put pure logic (validation, CSV formatting, duration and counter differences) into a testable unit; add tests (SwiftPM target if platform-independent, otherwise the XCTest target from `add-ios-app-test-target` (Erik)).

## 3. UI

- [x] 3.1 Add `IndooroStudyMode` to `Info.plist` (default false) and read it via `AppEnvironment`.
- [x] 3.2 Add „Testleitung“ entry in `SettingsSheet` visible only in study mode.
- [x] 3.3 Add `Views/Study/StudySessionView.swift`: test id input, task list, condition switch per task, big buttons „Start“, „Gefunden“, „Hilfe gebraucht“, „Abgebrochen“, running timer, notes field for the test lead (stored only as `note` event, warning not to enter names).
- [ ] 3.4 For condition `app`, „Start“ sets the product as target (single target or adds to a study list) and switches to the map; „Gefunden“ etc. reachable from an overlay on the map while a study task runs.
- [x] 3.5 Add export via `ShareLink` (CSV + JSONL) and „Alle Sitzungen löschen“ with confirmation.

## 4. Verification

- [ ] 4.1 Simulator run: session T01 with 3 tasks (2 app, 1 ohne_app) in „Ohne Ortung“ mode; export; compare files against the format; commit the anonymized result as `docs/pilot-readiness/kit/study-export-sample/` (CSV + JSONL).
- [ ] 4.2 Verify no network request is made during export (DEBUG network log).
- [ ] 4.3 Run `swift test`, the simulator build, `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] 4.4 Open a pull request `pilot/ios-study-mode` → `pilot/first-store`; notify Person C that the sample export exists; update `STATUS.md`.
