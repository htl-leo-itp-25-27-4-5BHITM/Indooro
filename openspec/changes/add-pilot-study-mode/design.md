## Context

- `NavigationSession` (`Utilities/NavigationSession.swift`, `NavigationSessionCore.swift`) owns route, active stop and progress; replay metrics already count reroutes and stop changes (`NavigationReplay.swift`, `ReplayMetrics`).
- `AppEnvironment` and the feature profile come from `prepare-pilot-ios-build`.
- Manual position setting („Ich bin hier“) comes from `add-pilot-guided-tour-fallbacks`.

## Goals / Non-Goals

Goals: reliable per-task data for phase 3 with minimal effort for the test lead; a fixed export format for the evaluation tooling.

Non-goals: server upload, analytics SDK, questionnaires in the app (paper/separate form), identification of persons.

## Decisions

1. **Activation.** `IndooroStudyMode` Info.plist boolean (default false). When true, the settings sheet shows „Testleitung“. No PIN; loan devices stay with the team.
2. **Counters.** `NavigationSession` exposes (or gets, via Erik) monotonically increasing counters: `routeBuildCount`, `rerouteCount`, `stopChangeWithoutEventCount`, `manualPositionCount`. The study store snapshots them at task start and end and records the differences.
3. **Task list.** `study-tasks.json` in the bundle (`[{ "no": 1, "productId": 123, "condition": "app" }]`) or manual entry by product search. Condition can be switched per task.
4. **Export format (contract for prepare-pilot-evaluation).**
   CSV `study-<testId>-<yyyyMMdd-HHmmss>.csv`, UTF-8, comma-separated, header:
   `test_id,session_id,store_code,task_no,product_id,product_name,condition,positioning_mode,started_at,ended_at,duration_s,outcome,manual_position_count,reroute_count,stop_change_without_event_count,app_error_count`
   - `condition` ∈ `app`, `ohne_app`; `positioning_mode` ∈ `mit_ortung`, `ohne_ortung`, `-` (ohne App); `outcome` ∈ `gefunden`, `hilfe`, `abgebrochen`; timestamps ISO 8601 UTC; `duration_s` with one decimal.
   JSONL `study-<testId>-<…>.jsonl`: one event per line `{ "t": <ISO>, "type": "taskStart|taskEnd|manualPosition|reroute|stopChange|error|note", … }`.
   A sample of both files is committed under `docs/pilot-readiness/kit/study-export-sample/`.
5. **Storage.** `Documents/StudySessions/`; share via `ShareLink`; „Alle Sitzungen löschen“ with confirmation.

## Risks / Trade-offs

- Counters depend on Erik's session code; if not available in time, record only times and outcomes and mark counters `-`.
- Test lead workload: two taps per task.

## Migration / Rollback

Flag off = feature invisible.
