## Why

Sprint story #195 decides from data whether the new `PositioningEngine` is switched on. The shadow mode from the iOS architecture merge (`ShadowPositioning`, flag `IndooroShadowPositioning`) runs the engine next to the legacy `BeaconManager`, but it only writes an `os_log` line every 5 seconds, so a recording holds no engine coordinates. With the flag on, `NavigationSession` also switches route ticks to the engine while the map dot stays legacy, so one measurement mixes two sources. The students who do the field walks are not developers: they need one Debug build that records everything, shows which beacons are heard and exports the file without a Mac or a terminal.

## What Changes

- New recorder line type `shadow` (additive to `indooro-recording/2`): per engine epoch the legacy and the engine position with status, and the engine confidence. Older readers skip it; replay and analysis ignore it.
- Shadow mode becomes record-only. A separate, explicit flag `IndooroEngineDrivesNavigation` (default off) makes `NavigationSession` use the engine snapshots. With all flags off nothing changes in a Release build.
- Role `exploration` for recordings (never counts for the decision, like `calibration`); optional `shadowMode` flag in the `session` line; display name `Indooro`.
- Debug settings (DEBUG builds only), persisted in `UserDefaults` and overriding Info.plist and environment: shadow-mode toggle, "engine drives navigation" toggle, marker quick picker M1 to M8 (writes truth and marker at the cell centre), live beacon list (UUID, major, minor, RSSI, last seen, sorted by RSSI), export through the share sheet (the Files app view of the recordings comes from the existing `UIFileSharingEnabled`, which this change does not touch).
- `scripts/field/compare_positioning.py` reads `shadow` lines directly (no Swift, no layout) and writes `<name>-comparison.json` (`indooro-position-comparison/1`, `origin: "shadow"`); the hook `shadow_comparison` in `evaluate_field_day.py` uses it. The anonymization check knows the line type; `positioning_verdict.py` counts `origin: "shadow"` as field data. Synthetic shadow recordings for the rehearsal.
- German guide `docs/pilot-readiness/hardware/APP_AUFS_IPHONE.md` for installing the Debug build with a Personal Team.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mobile-positioning-navigation`: shadow recording and a separate engine-navigation flag.

## Impact

- Affected: `indooroApp/` (`AppEnvironment`, `BeaconManager`, `ShadowPositioning`, `NavigationRecorder`, `NavigationSession`, `SettingsSheet`, new DEBUG-only `LiveBeaconStore`), package `IndooroNavigation` (`ShadowRecord`, `TestRoomMarkers`), `scripts/field/`, docs under `docs/pilot-readiness/hardware/`.
- Not affected: Release behaviour with all flags off, backend, admin UI, OpenAPI contract, database. No deployment, nothing is sent to a server.
- Marker coordinates assume 1 grid cell = 1 m in the test room `SPAR-Leonding-002` (grid 5 x 9, origin at the Indooro3 corner).
- Switches are read when the app starts; changing them in the settings takes effect after a restart.
