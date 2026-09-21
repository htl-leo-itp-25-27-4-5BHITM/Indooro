## Why

The canonical iOS app works, but its structure blocks safe evolution:

- `BeaconManager` (2 735 LOC) combines CoreBluetooth, CoreLocation, CoreMotion, store detection, networking, layout fallback, navigation, and debug logging; it is not actor-isolated and cannot be tested in isolation.
- The project builds in Swift 5 language mode with minimal concurrency checking; four of six stores rely on manual `DispatchQueue.main.async` hops; networking uses completion handlers without cancellation or retries.
- The API base URL is hard-coded four times; App Transport Security is disabled globally.
- There is no test target and no iOS CI; the only safety net is manual simulator testing.
- Shopping lists live in one `UserDefaults` blob and a decoding failure silently replaces all lists with a new default list.
- The multi-stop planner rebuilds the full grid graph and runs O(n²) A* searches with an O(V) open-set scan on every position update.
- Dead code, presentation files, and six unused layout JSONs ship inside the app; there is no asset catalog and no app icon.
- Client and backend models are hand-maintained in parallel although the backend already exposes an OpenAPI document.

Now that the as-is behavior is specified (`2026-09-17-integrate-ios-client-specs`) and the contract defects are addressed (`fix-ios-contract-and-spec-drift`), the app can be restructured without changing user-visible behavior.

## What Changes

- Introduce the local Swift package `IndooroKit` with the targets `IndooroModels`, `IndooroNetworking`, `IndooroNavigation`, `IndooroPositioning`, `IndooroPersistence`, `IndooroDesignSystem`, and feature targets `FeatureStart`, `FeaturePlanning`, `FeatureRecipes`, `FeatureShopping`, `FeatureMap`, `FeatureUpsell`, `FeatureAR`; the app target becomes a thin composition root.
- Switch to Swift 6 language mode with complete strict concurrency; the app target uses default `MainActor` isolation; package types are `Sendable`.
- Replace `ObservableObject` stores with `@Observable @MainActor` models injected through `AppEnvironment` and SwiftUI `environment`.
- Split `BeaconManager` into `BeaconRadio` (CoreBluetooth/CoreLocation adapter), `HeadingProvider`, `MotionProvider`, `PositioningEngine` (actor), `StoreDetectionService`, `LayoutRepository`, and the `PositioningModel`/`StoreContextModel`/`LayoutModel` view models.
- Add `APIClient` (actor, `async/await`, typed `Endpoint`, `APIError`, retry policy for idempotent reads, cancellation, per-endpoint timeouts) and remove all direct `URLSession.shared.dataTask` calls.
- Read the API base URL from build configuration (`Debug-Local`, `Debug-LeoCloud`, `Release` xcconfig files); remove `NSAllowsArbitraryLoads` and allow insecure loads only for `localhost` in `Debug-Local`.
- Export the backend OpenAPI document, commit a filtered mobile contract, and generate or verify Swift wire models with `swift-openapi-generator`; keep domain models separate from wire models.
- Replace the `UserDefaults` list blob with a versioned file repository (`schemaVersion 2`) with atomic writes, backup, corruption quarantine, and one-time migration from `shoppingListStore.v1`.
- Cache the walkable graph per layout revision, use a binary-heap A*, and compute multi-stop order from a per-snapshot distance matrix; rebuild tour snapshots only on relevant changes.
- Replace `print` debug logging with `os.Logger` (privacy-aware); keep the in-app debug log only in DEBUG builds.
- Add Swift Testing unit tests, fixture-based contract tests, and XCUITest smoke tests; add `.github/workflows/ios.yaml`; make backend CI run tests with JDK 21.
- Add `Assets.xcassets` (AppIcon, AccentColor), a German String Catalog, VoiceOver labels for map and tour, and Dynamic Type support; move unused layouts and presentation files out of the app target.
- Add per-client rate limiting for anonymous cost-bearing backend routes (`/api/mobile/upsell/plan`, `/api/mobile/upsell/suggestions`).
- Retire the legacy trees `swift/indooro-` and `swift/indooroApp` and the untracked archive `swift/indooro-EinkaeuferFinal.zip`; ignore `xcuserdata`.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `ios-client-architecture`: modular package structure, Swift 6 isolation, environment-based state, off-main positioning, efficient route planning, file persistence, tests, CI, resources, localization and accessibility, legacy retirement.
- `ios-backend-integration`: configurable base URL, single async API client, retry policy, OpenAPI-verified contracts, ATS, no embedded secrets, backend rate limiting for cost-bearing anonymous routes.

## Impact

- iOS: every file under `swift/indooro-EinkaeuferFinal/indooroApp` moves into `IndooroKit` or is rewritten; `MCindooroApp.xcodeproj` build settings; new `Config/*.xcconfig`; new test targets.
- Backend: `application.properties` (OpenAPI schema export), `@Schema` annotations on mobile DTOs, new `MobileRateLimitFilter`, CI workflow.
- Repository: `api/openapi/indooro-mobile.yaml`, `.github/workflows/ios.yaml`, `.gitignore`, removal of legacy Swift trees.
- User-visible behavior: unchanged except for performance, accessibility, and the app icon.
- Public/protected routes: unchanged; rate limiting returns HTTP 429 for abusive anonymous clients.
