## Why

The first supermarket pilot (see `docs/pilot-readiness/03_PILOT_READINESS.md`) must work even when BLE positioning is inaccurate or unavailable, because no field measurement exists yet and RSSI positioning in a store with metal shelves is expected to be in the range of several meters. The pilot audit found four gaps on the stabilized navigation code (branch `codex/stabilize-ios-navigation`, now `pilot/first-store`):

- Without a known position, `NavigationSessionCore.beginRoute` only sets `needsRoute = true` and draws no route (`Utilities/NavigationSessionCore.swift:358-366`). In the planned hybrid pilot, customers start without a trusted position, so they would see no route at all.
- The target card shows „Gang“ = category code and „Regal“ = meter from `layoutCode` (`Views/Main/StoreMapPage.swift:852-862`), for example „Gang 310 · Regal 1“. Customers in a real store cannot relate this to any sign.
- The manual position control „Ich stehe hier“ lives in `Views/Main/HeaderView.swift`, which is never instantiated; map taps set the position only when „Tippen setzt Ziel“ is off (`Views/Main/MapView.swift:140-146`).
- Without network, the app falls back to the bundled test-room layout instead of the last loaded store layout (`Managers/BeaconManager.swift:1345-1407`). The open change `fix-ios-contract-and-spec-drift` (section 7) already specifies a layout cache; it is implemented here because the pilot depends on it.

In addition, the pilot branch must later absorb `codex/admin-platform-rebuild` once that branch lands on `main`; three Swift files conflict (`BeaconManager.swift`, `LayoutData.swift`, `StoreMapPage.swift`).

## What Changes

- Add a route origin fallback to the navigation session: if no trusted projected position exists, the route to the active stop starts at the layout entrance at tour start and at the walkable access point of the last completed or skipped stop afterwards. A trusted position always wins.
- Add a visible „Ich bin hier“ action on the indoor map that switches the next map tap to „set position“, independent of the „Tippen setzt Ziel“ setting, and calls the existing manual calibration path.
- Show a customer-readable shelf location: the shelf element `label` from the layout (maintained in the admin editor field „Bezeichnung“) as primary text, plus the shelf board („Fach“) and position („Reihe“) from `layoutCode` in words. Category codes are no longer shown to customers.
- Implement the layout cache and offline fallback from `fix-ios-contract-and-spec-drift` tasks 7.1–7.4 on the pilot branch and mark them there.
- Implement the degraded position rendering and „Position setzen“ banner from `fix-ios-contract-and-spec-drift` tasks 8.1–8.4, adapted to the stabilized pipeline, and mark them there.
- Integrate `main` into `pilot/first-store` after `codex/admin-platform-rebuild` has been merged into `main`, resolving the three known conflicts in favor of the stabilized navigation session.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `mobile-positioning-navigation`: route origin fallback without a trusted position (entrance, last completed stop).
- `ios-store-map-experience`: „Ich bin hier“ action, customer-readable shelf location text.

## Impact

- iOS code (owner: Erik Bergmair, branch `pilot/erik-guided-tour`): `Utilities/NavigationSessionCore.swift`, `Utilities/NavigationSession.swift`, `Views/Main/StoreMapPage.swift` (target card, tour panel, banner), `Views/Main/MapView.swift`, `Models/LayoutData.swift` (location descriptor), `Managers/BeaconManager.swift` (layout loading, cache, fallback, trusted-position publishing only), new `Utilities/LayoutCacheStore.swift`, tests in `Tests/IndooroNavigationCoreTests/`.
- Other open changes: `fix-ios-contract-and-spec-drift` sections 7 and 8 are implemented through this change; `stabilize-ios-navigation-pipeline` stays open until its field tasks are done (owned by `establish-pilot-field-measurement`).
- Backend, admin UI, API: unchanged. The shelf label uses the existing layout element field `label`.
- Privacy: unchanged. Layout cache contains only store layout data, no customer data.
