## Context

- Recorder: DEBUG builds, Einstellungen → Debug → „Messungen aufzeichnen“; JSON Lines in `Documents/NavigationRecordings/<ISO timestamp>.jsonl`; long press 0.6 s on the map writes a `truth` line; „Aufzeichnung teilen“ exports via share sheet (`swift/indooro-EinkaeuferFinal/TESTING.md`).
- Replay: `NavigationRecordLine.parse(jsonl:)`, `NavigationReplay.run(recording:layout:config:)`, metrics printed as `REPLAY <name> …` (reroutes/min, stopChanges, jumps, maxStep, lagMean, lagP95, offRouteDelays, lowConfToggles, planning).
- Synthetic results on `pilot/first-store` (run 2026-10-15): walkClean lagMean 3.22 m / lagP95 5.02 m; stationary60s 0.09 / 0.15 m; determinism and wrongAisle maxStep ≈ 17.1 m.
- Positioning needs at least three beacons (`StabilizedNavigationConfig.swift:17`), distances 0.35–11 m, path loss exponent 2.8, default TX −72 dBm (`BeaconManager.swift:171-186`).
- Beacon name fallback matching by trailing number can mis-assign foreign beacons (`BeaconManager.swift:877-905, 1810-1830`); a unique UUID avoids this.

## Goals / Non-Goals

Goals: first real error numbers; repeatable protocol; documented hardware; evidence-only calibration.

Non-goals: new filters or algorithms; PDR/step detection; AR alignment; changing navigation session logic (owned by `add-pilot-guided-tour-fallbacks`).

## Decisions

1. **Beacon identity.** One project UUID generated once (`uuidgen`), stored in `docs/pilot-readiness/hardware/BEACON_STANDARD.md`. `major` = site number (1 = test room, 2 = large test room, 10+ = stores), `minor` = beacon number printed on the device. Store detection on the backend uses the same identity (admin beacon management).
2. **Configuration record.** `docs/pilot-readiness/hardware/beacons.csv` with columns `minor, major, site, x_m, y_m, height_m, mount, tx_power_dbm, interval_ms, battery_date, notes`. Coordinates in layout meters (1 cell = 1 m, convention from `prepare-pilot-store-operations`).
3. **Hardware criteria.** iBeacon with configurable UUID/major/minor/TX/interval, replaceable battery, adhesive mounting, vendor configuration app available on iOS. Pick one model, buy 12 units.
4. **Ground truth.** Floor markers with known coordinates; the recorder's long-press `truth` line at each marker; walking loops pass markers in fixed order.
5. **Report.** One Markdown report per session in `docs/pilot-readiness/hardware/reports/<date>-<site>.md` using `REPORT_TEMPLATE.md`; metrics from replay plus a small script that computes error statistics at truth points (Swift test helper or `scripts/field/` Python with `-I`, no network).
6. **Calibration rule.** A provisional parameter may change only with (a) at least two recordings from the target site, (b) before/after metrics in `NavigationFixtures/BASELINE.md`, (c) no regression in the synthetic replay tests. Remove the `// provisional` marker only after that.
7. **17 m step.** Investigate first whether it is a scenario artefact (truth jump in the synthetic recording, intended teleport) or a pipeline defect (e.g. jump gate releasing after confirmations, projection to a distant edge). Fix only if defect; otherwise document and adjust the scenario's expectation.

## File ownership

Owns `docs/pilot-readiness/hardware/`, `NavigationFixtures/`, replay-related tests, the test-room `layout.json`, and positioning pipeline files listed in the proposal. Must not edit `NavigationSessionCore.swift`, UI views or `BeaconManager.swift` beyond pipeline wiring. Coordinate with Erik before changing any public type used by `NavigationSession`.

## Risks / Trade-offs

- Results from a classroom do not transfer to a supermarket; the larger test room with shelves reduces but does not remove that gap.
- Device variance: measure with at least two iPhone models.
- Beacon delivery time can delay the plan; start with the four existing beacons for the protocol dry run.

## Migration / Rollback

Fixture and documentation additions are additive. Parameter changes are isolated commits that can be reverted individually.
