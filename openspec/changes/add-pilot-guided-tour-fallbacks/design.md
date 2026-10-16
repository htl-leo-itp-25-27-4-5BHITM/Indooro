## Context

Paths are relative to `swift/indooro-EinkaeuferFinal/indooroApp/` on branch `pilot/first-store` (= `codex/stabilize-ios-navigation` at `2956fe6` plus planning commits).

| Area | Current behavior | Source |
|---|---|---|
| Route without position | `beginRoute()` sets `needsRoute = true` when `lastPosition == nil`; nothing is drawn until a position arrives | `Utilities/NavigationSessionCore.swift:358-366` |
| Stop completion | `stopCompleted()` and `stopSkipped()` both call `advanceToNextStop()`; the completed stop's map point is discarded | `Utilities/NavigationSessionCore.swift:225-232, 335-347` |
| Entrance | Layout elements of type `entrance` are walkable in the graph | `Utilities/IndoorGraph.swift:446` |
| Shelf text | `targetAisleText` returns the first `layoutCode` segment (category), `targetShelfNumberText` the second (meter) | `Views/Main/StoreMapPage.swift:852-862` |
| Manual position | `HeaderView` („Ich stehe hier“) is dead code; map tap sets position only if `tapSetsTarget == false` | `Views/Main/HeaderView.swift`, `Views/Main/MapView.swift:140-146` |
| Offline | Server current → server history → bundled `layout.json` (test room 4×7) | `Managers/BeaconManager.swift:1345-1407` |
| Low confidence | `NavigationSessionCore` exposes a low-confidence message; marker is drawn normally | `Utilities/NavigationSessionCore.swift:106` |

`layoutCode` format: `category/meter/fach/reihe`, e.g. `310/1/3/2` (see `product-catalog-search`, „Layout code format is documented“). Layout elements carry an optional `label` (`Models/LayoutData.swift:51`) that the admin editor edits as „Bezeichnung“.

## Goals / Non-Goals

Goals:

- A customer always sees a route to the active stop, with or without BLE.
- A customer always reads where a product is in words that match the store.
- A customer can correct the position in one tap sequence.
- The pilot store works offline after one successful load.

Non-goals:

- No new positioning filter, threshold, or timer (rule of `stabilize-ios-navigation-pipeline`).
- No automatic arrival detection.
- No admin or backend change; the label convention is documented in `prepare-pilot-store-operations`.
- No turn-by-turn instructions.

## Decisions

1. **Route origin order.** `trusted projected position` → `last completed/skipped stop map point` (only while no trusted position exists) → `layout entrance` (first element of type `entrance`; if none, no route as today). The fallback origin is kept in `NavigationSessionCore` as `fallbackOrigin: SIMD2<Float>?`, set by `startTour` (entrance) and `advanceToNextStop` (map point of the stop that was just left). It is cleared when a trusted position arrives. The session receives the entrance point through its initializer or `layoutChanged` so the core stays platform-independent and testable.
2. **Trusted position.** Reuse the definition from `fix-ios-contract-and-spec-drift` 8.1, adapted: `trackingMode == .debugNoBeacons` with a manually set point, or confidence not low and at least three fresh measurements. A manual calibration counts as trusted until the next confident solver update.
3. **Fallback routes are marked.** When the route starts from a fallback origin, the tour panel shows „Route ab Eingang“ or „Route ab <Stopp>“ so the customer understands it is not their live position.
4. **Shelf location text.** New pure helper `ShelfLocationDescriptor` in `Models/LayoutData.swift` (or its own file inside the SwiftPM target) with input `layoutCode` and the matched shelf element. Output: `primary = shelf.label` if non-empty, else „Regal <meter>“; `detail = "<n>. Boden von unten · Position <reihe>"` when fach/reihe are numeric. Board counting direction (from bottom) is a pilot convention documented in `prepare-pilot-store-operations`. Category codes are never shown in customer UI; they stay available in DEBUG.
5. **„Ich bin hier“.** A button in the indoor map header/tour panel sets a one-shot state `nextTapSetsPosition = true`, shows the badge „Tippe auf deinen Standort“, and the next map tap calls the existing manual calibration path in `BeaconManager` (which forwards to `NavigationSessionCore.manualCalibration(at:)`). This avoids changing the semantics of „Tippen setzt Ziel“. `HeaderView`, `SearchOverlayView`, `MapHeaderView`, `LayoutSelectionSheet` stay untouched (dead code removal belongs to `prepare-pilot-ios-build`).
6. **Layout cache.** Implement exactly `fix-ios-contract-and-spec-drift` 7.1–7.4 (`Application Support/LayoutCache/<storeId>.json`, `default.json`, `isExcludedFromBackup`). Additionally, the last selected store id is persisted so that a cold start without network opens the pilot store, not the test room.
7. **Integration with the admin rebuild.** When `codex/admin-platform-rebuild` is on `main`, merge `origin/main` into `pilot/first-store` (merge commit, no rebase of shared history). Conflict rule: keep `NavigationSession` ownership, keep `LayoutElement.matchesProductLayoutCode` from the stabilization, keep the admin branch's clearing of stale targets on store switch (`eb4d3e8`) if it still applies.

## File ownership

This change owns: `NavigationSessionCore.swift`, `NavigationSession.swift`, `MapView.swift`, the target card/tour panel/banner parts of `StoreMapPage.swift`, `LayoutData.swift`, new `LayoutCacheStore.swift`, and the layout-loading, cache, fallback and trusted-position parts of `BeaconManager.swift`.
Other pilot changes may edit `BeaconManager.swift` only in: the `apiBase` constant and URL construction (`prepare-pilot-ios-build`), Bluetooth/location authorization state publishing (`prepare-pilot-ios-build`), the store auto-detection guard (`prepare-pilot-ios-build`), and the positioning pipeline wiring (`establish-pilot-field-measurement`). Rebase onto `origin/pilot/first-store` before every pull request.

## Risks / Trade-offs

- Fallback origin can be wrong if the customer walked elsewhere after „Erledigt“. Mitigation: label the route origin, offer „Ich bin hier“.
- Shelf labels depend on data quality; an empty label falls back to „Regal <meter>“.
- Merge with the admin rebuild may surface semantic conflicts beyond the three textual ones. Mitigation: run `swift test`, a simulator build and the published-shelf-target check from `a0f9b1f` after the merge.

## Migration / Rollback

All changes are client-side. Rollback = revert the merge request on `pilot/first-store`. Cached layouts are disposable.

## Implementation notes

- 2026-10-16, task 9.1: the four live store layouts (`GET /api/mobile/stores/{id}/layout/current`) contain no element with `rotation` other than 0. The rotated-cell coverage is implemented anyway (task 9.2) because the admin editor offers the field „Winkel“; elements with rotation 0 or a multiple of 360 keep the old axis-aligned coverage, so replay baselines are unchanged (`NavigationFixtures/BASELINE.md` needs no update, task 9.4).
- Task 2.1: the entrance point is the center of the first `entrance` element (`IndoorGraph.entrancePoint(in:)`), projected to the nearest walkable point in the core. `NavigationSession` reads it from `BeaconManager.shelves`, which contains all non-beacon elements.
- Tasks 2.x/3.x: `NavigationSessionCore.tickUpdated(…, trusted:)` ignores untrusted positions for route progress and off-route evidence; a tick without a solution also ends trust, except while a manual position is held (`manualPositionHolds`, cleared by the next trusted tick). `isPositionTrusted` in `BeaconManager` = beacon mode, solver position present, confidence ≥ `confidence.lowThreshold` (existing constant), or manual position held.
- Task 10.1: `stopChangeWithoutEventCount` is a defensive invariant counter (position ticks never change the active stop, so it stays 0); `rerouteCount` counts only off-route rebuilds, not the single rebuild from a fallback origin to the first trusted position.
