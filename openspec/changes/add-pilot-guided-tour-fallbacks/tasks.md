## 1. Setup

- [ ] 1.1 Create branch `pilot/erik-guided-tour` from `origin/pilot/first-store` in its own worktree; confirm `swift test` in `swift/indooro-EinkaeuferFinal` reports 77 passing tests before any change.
- [ ] 1.2 Re-read `design.md` of this change and `fix-ios-contract-and-spec-drift` sections 7 and 8; record in this `design.md` any task of those sections that no longer fits the stabilized pipeline, with the adaptation.
- [ ] 1.3 Run `npx -y @fission-ai/openspec@1.3.1 validate add-pilot-guided-tour-fallbacks --strict`.

## 2. Route Origin Fallback (navigation core, testable without simulator)

- [ ] 2.1 Add `fallbackOrigin: SIMD2<Float>?` and an `entrancePoint: SIMD2<Float>?` input to `NavigationSessionCore`; pass the entrance from the layout (first element of type `entrance`, projected to the nearest walkable node) through the initializer and `layoutChanged`.
- [ ] 2.2 Set `fallbackOrigin = entrancePoint` in `startTour` and `setSingleTarget` WHEN no trusted position exists; in `advanceToNextStop` set `fallbackOrigin` to the map point of the stop that was left.
- [ ] 2.3 Change `beginRoute()` to build from `lastPosition` if trusted, else from `fallbackOrigin`, else keep `needsRoute = true`.
- [ ] 2.4 Clear `fallbackOrigin` on the first trusted `positionUpdated` and rebuild the route exactly once from the trusted position.
- [ ] 2.5 Expose `routeOriginKind` (`.position`, `.entrance`, `.lastStop(title)`) for the UI.
- [ ] 2.6 Add `NavigationSessionTests`: tour start without position builds from entrance; stop completed without position builds from the completed stop; trusted position replaces the fallback with exactly one rebuild; layout without entrance draws no route; skip behaves like complete for the origin.
- [ ] 2.7 Add a replay test with a recording that has no measurements for the first 10 s and verify `stopChanges == 0` and one rebuild when measurements start.

## 3. Trusted Position (BeaconManager, adapted from fix-ios-contract-and-spec-drift 8.1)

- [ ] 3.1 Publish `isPositionTrusted` from `BeaconManager` according to the requirement „Tour route has an origin without a trusted position“; feed it into `NavigationSession` so the core receives positions only with their trust flag.
- [ ] 3.2 Treat a manual calibration as trusted until the next confident solver update.
- [ ] 3.3 Mark `fix-ios-contract-and-spec-drift` task 8.1 as done with a note „implemented in add-pilot-guided-tour-fallbacks“.

## 4. „Ich bin hier“ and Degraded Marker (UI)

- [ ] 4.1 Add one-shot state `nextTapSetsPosition` in the indoor map; add the button „Ich bin hier“ to the indoor header area of `StoreMapPage` (visible WHILE a layout is shown).
- [ ] 4.2 In `MapView`, route the next tap to the manual calibration path WHEN `nextTapSetsPosition` is true, independent of `tapSetsTarget`; reset the flag afterwards; show the badge „Tippe auf deinen Standort“ while active.
- [ ] 4.3 Implement `fix-ios-contract-and-spec-drift` 8.2–8.4 on top: untrusted marker at 45 % opacity with dashed 3 m ring, banner „Position ungenau“ with „Position setzen“ (calls the same one-shot mode). Mark 8.2–8.4 there.
- [ ] 4.4 Show „Route ab Eingang“ / „Route ab <Stopp>“ in the tour panel and target card from `routeOriginKind`.
- [ ] 4.5 Verify in the simulator in mode „Ohne Ortung“ (renamed by `prepare-pilot-ios-build`; until then „Debug (kein Beacon)“): start tour → route from entrance; „Erledigt“ → route from last stop; „Ich bin hier“ → route from tapped point. Record screenshots under `docs/pilot-readiness/evidence/guided-tour/`.

## 5. Customer-Readable Shelf Location

- [ ] 5.1 Add `ShelfLocationDescriptor` (pure Swift, included in the SwiftPM target) with input `layoutCode` and optional shelf `label`/`meter`, output `primary` and `detail` per the requirement „Shelf location is described in customer words“.
- [ ] 5.2 Add tests: labeled shelf, unlabeled shelf, non-numeric fach/reihe, malformed layoutCode, no matching shelf.
- [ ] 5.3 Replace `targetAisleText`/`targetShelfNumberText` in `StoreMapPage` with the descriptor; remove the fixed „Etage EG“ metric if the layout has one floor; show the „Nicht im Testbereich – bitte Personal fragen“ state instead of silently clearing the target (`BeaconManager.setTargetProduct`).
- [ ] 5.4 Show the descriptor's primary text for each stop in the tour panel and in the shopping list rows that already show a stop title (`ShoppingFeatureViews`), without changing list logic.
- [ ] 5.5 Keep category codes visible only in DEBUG builds (e.g. as secondary caption).

## 6. Layout Cache and Offline Start (fix-ios-contract-and-spec-drift 7.1–7.4)

- [ ] 6.1 Add `Utilities/LayoutCacheStore.swift` writing/reading `Application Support/LayoutCache/<storeId>.json` and `default.json` with `isExcludedFromBackup = true`.
- [ ] 6.2 Save the decoded store layout after each successful application; persist the last selected store id.
- [ ] 6.3 On store layout failure, apply the cached store layout and set the description „<store> • Offline-Kopie vom <Datum>“; on cold start without network, open the last selected store from cache instead of the bundled test-room layout.
- [ ] 6.4 On default layout failure try `default.json` before history; keep the bundled layout only as the last resort.
- [ ] 6.5 Verify in the simulator: load pilot store online → quit → airplane mode → start → pilot store layout shown with offline description. Mark `fix-ios-contract-and-spec-drift` 7.1–7.4 as done there.

## 7. Integration With the Admin Rebuild (after it is merged to main)

- [ ] 7.1 Wait until `codex/admin-platform-rebuild` is merged into `main` and pushed; record the merge commit hash here.
- [ ] 7.2 Merge `origin/main` into `pilot/first-store` (merge commit, no force push); resolve conflicts in `Managers/BeaconManager.swift`, `Models/LayoutData.swift`, `Views/Main/StoreMapPage.swift` per design decision 7.
- [ ] 7.3 Run `swift test`, the simulator build command from `TESTING.md`, `./mvnw test` in `backend/indooro_server`, and `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`; fix regressions.
- [ ] 7.4 Notify the team (team channel) that every work branch must merge `origin/pilot/first-store`.

## 8. Verification and Handover

- [ ] 8.1 Run `swift test` (all green), the simulator build, and `npx -y @fission-ai/openspec@1.3.1 validate add-pilot-guided-tour-fallbacks --strict`.
- [ ] 8.2 Open a pull request `pilot/erik-guided-tour` → `pilot/first-store` with test output and evidence screenshots.
- [ ] 8.3 After merge, update `docs/pilot-readiness/team/STATUS.md` (row „Erik“) and leave this change open until the device check in the pilot store (task 13.6 of `stabilize-ios-navigation-pipeline`) has passed; then archive.
