## Why

The permanent OpenSpec baseline describes the iOS customer app only through four coarse `mobile-*` capabilities. The canonical Swift project `swift/indooro-EinkaeuferFinal` (scheme `MCindooroApp`, 52 Swift files, 16.7k LOC) has since grown a five-tab app shell, product planning, recipe browsing, a store overview map, a shopping tour, upsell prompts, list sharing, and a tuned positioning pipeline — none of which has a durable, testable contract. `openspec/config.yaml` even pointed to the outdated `swift/indooro-` tree as the current app. Without an explicit iOS contract, future backend changes cannot be checked against client expectations and client regressions (for example the reintroduced store-coordinate fallback) go unnoticed.

This change is documentation-only: it records the verified as-is behavior of the Swift client as permanent requirements so that the follow-up changes `fix-ios-contract-and-spec-drift`, `modernize-ios-client-architecture`, and `protect-legacy-write-endpoints` can modify a precise baseline. Behavior that violates existing requirements is intentionally **not** specified here; it is listed as drift in `design.md` and fixed by `fix-ios-contract-and-spec-drift`.

## What Changes

- Add `ios-client-architecture`: canonical source tree, build baseline (iOS 18.5, iPhone/iPad), five-tab shell, store ownership, permissions and usage descriptions, document type registration, bundled layout fallback, debug logging bounds, legacy project status.
- Add `ios-backend-integration`: the complete list of backend routes consumed by the app, base URL, request parameters, tolerant decoding rules, stale-response protection, HTTP status handling, timeouts, and privacy constraints for anonymous calls.
- Add `ios-product-planning`: the „Planung“ tab with free-text search, 13 category shortcuts backed by layout-code prefixes, certification filter, contextual quick suggestions, planned-item list, and add-to-list behavior.
- Add `ios-store-map-experience`: the „Karte“ tab with the MapKit store overview, manual store selection, indoor layout rendering, zoom bounds, markers, target card, shopping-tour panel, settings sheet, and debug mode.
- Add `ios-recipe-experience`: the „Rezepte“ tab with list, search, pull-to-refresh, detail, store-aware mapping status, ingredient selection, and the add-to-list sheet.
- Extend `mobile-store-detection` with the iOS detection pipeline (identity refresh, RSSI threshold, lookup de-duplication, failure cooldown, ranging constraints, layout load generations).
- Modify `mobile-positioning-navigation` so the platform baseline matches the project (iOS 18.5) and add the positioning pipeline parameters, manual calibration, debug tracking mode, heading handling, and walkable-graph construction.
- Extend `mobile-shopping-lists` with list management rules, persistence keys, the shopping-tour lifecycle, stop completion, selective sharing with quantities, and import merge semantics.
- Extend `mobile-ar-navigation` with render bounds, tracking-state messaging, camera permission, and recalibration.
- Update `openspec/config.yaml` so the canonical Swift tree is `swift/indooro-EinkaeuferFinal/indooroApp`.

No runtime code, API, schema, or deployment behavior changes.

## Capabilities

### New Capabilities

- `ios-client-architecture`: Structural and platform contract of the canonical iOS customer app.
- `ios-backend-integration`: Client-side contract for every backend route the iOS app consumes.
- `ios-product-planning`: Behavior of the product planning tab.
- `ios-store-map-experience`: Behavior of the store overview and indoor map tab.
- `ios-recipe-experience`: Behavior of the recipe tab and recipe-to-list flow in the iOS app.

### Modified Capabilities

- `mobile-store-detection`: Adds the iOS-side detection pipeline requirements.
- `mobile-positioning-navigation`: Updates the platform baseline to iOS 18.5 and adds pipeline, calibration, heading, and graph requirements.
- `mobile-shopping-lists`: Adds list management, persistence, tour lifecycle, and sharing requirements.
- `mobile-ar-navigation`: Adds render-bound, tracking-state, permission, and recalibration requirements.

## Impact

- Documentation sources: Swift sources under `swift/indooro-EinkaeuferFinal/indooroApp`, `MCindooroApp.xcodeproj/project.pbxproj`, `Info.plist`, `TESTING.md`, backend DTOs under `backend/indooro_server/src/main/java/at/htl/admin/dto`, `application.properties`.
- Impacted systems: none at runtime. OpenSpec baseline and `openspec/config.yaml` only.
- Protected/public routes: unchanged. All routes referenced here are the existing anonymous `/api/mobile/*`, `/api/products*`, and `/api/layout*` read routes.
- Companion documentation: `docs/specs/AUDIT.md`, `docs/specs/FSD.md`, `docs/specs/TSD.md`, `docs/specs/ARCHITECTURE_BLUEPRINT.md`, `docs/specs/ROADMAP.md`.
