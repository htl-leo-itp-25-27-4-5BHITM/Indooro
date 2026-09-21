## Context

As-is structure (commit `63a42d4`, see `docs/specs/AUDIT.md` §1.2): one app target, 52 files, `ObservableObject` stores created in `ContentView`, completion-handler networking, `UserDefaults` persistence, Swift 5 mode, no tests. Target structure and ADRs are described in `docs/specs/ARCHITECTURE_BLUEPRINT.md`; this document records the binding decisions.

## Goals / Non-Goals

**Goals**

- Compiler-verified data-race safety (Swift 6).
- Testable core logic without simulator hardware (navigation, persistence, networking, upsell state).
- One place for API configuration, error mapping, retries, and logging.
- No user-visible regressions; every existing `ios-*` and `mobile-*` requirement stays satisfied.

**Non-Goals**

- No Android client, no customer accounts, no backend list sync, no push notifications, no background BLE scanning.
- No TCA or other third-party architecture framework.
- No SSL certificate pinning (see Decision 9).

## Decisions

### 1. Module layout (local Swift package `IndooroKit`)

| Target | Depends on | Content |
| --- | --- | --- |
| `IndooroModels` | – | `Product`, `MobileStoreSummary`, `LayoutData`, `LayoutElement`, `ShoppingList*`, `Recipe*`, `Upsell*`, `ShoppingTransferPackage`, `BeaconUUIDNormalizer`; all `Sendable`, `Hashable`, `Codable` |
| `IndooroNetworking` | Models | `APIEnvironment`, `Endpoint`, `APIClient` (actor), `APIError`, `RetryPolicy`, `JSONCoding`, endpoint definitions, generated OpenAPI wire types + mappers |
| `IndooroNavigation` | Models | `IndoorGraph`, `IndoorGraphBuilder`, `BinaryHeap`, `AStar`, `RouteManager`, `MapMatcher`, `PoseFusionService`, `BeaconPositionSolver`, `KalmanFilter`, `NavigationStateMachine`, `StabilizedNavigationConfig`, `MultiStopRoutePlanner`, `ShoppingStopResolver` (pure, no Apple UI frameworks) |
| `IndooroPositioning` | Models, Navigation | `BeaconRadio` protocol + `CoreLocationBeaconRadio`, `HeadingProvider`, `MotionProvider`, `PositioningEngine` (actor), `StoreDetectionService` (actor) |
| `IndooroPersistence` | Models | `ShoppingListRepository` (file, schema v2, migration), `LayoutCacheStore`, `SettingsStore` |
| `IndooroDesignSystem` | – | colors, typography, `MapFloatingSurface`, `ProductSearchRow`, markers, state views |
| `FeatureStart`, `FeaturePlanning`, `FeatureRecipes`, `FeatureShopping`, `FeatureMap`, `FeatureUpsell`, `FeatureAR` | above | SwiftUI views and `@Observable` models per tab |
| `IndooroTestSupport` | Models, Networking | `StubURLProtocol`, fixtures loader, fake radio/clock |

The app target `MCindooroApp` contains `IndooroApp.swift`, `AppEnvironment.swift`, `RootView.swift`, resources, and configuration.

### 2. State and dependency injection

- `AppEnvironment` (struct, `Sendable`) holds protocol-typed dependencies: `APIClientProtocol`, `ShoppingListRepository`, `LayoutCacheStore`, `BeaconRadio`, `HeadingProvider`, `MotionProvider`, `Clock`, `Logger` factory. Variants: `.live(configuration:)`, `.preview`, `.test(...)`.
- The root creates `@Observable @MainActor` models once: `StoreContextModel`, `LayoutModel`, `PositioningModel`, `ShoppingListModel`, `ShoppingSessionModel`, `ProductSearchModel` (two instances, planning and map), `RecipeModel`, `UpsellModel`, `AppRouter` (selected tab and cross-tab actions).
- Models are passed with `.environment(model)`; views read them with `@Environment(Model.self)`. Cross-tab actions (focus product, start/stop tour, add suggestion) live in `AppRouter`, replacing the closures in `ContentView`.
- `TabView` uses the iOS 18 `Tab(_:systemImage:value:)` API.

### 3. Concurrency model

- App target: `SWIFT_VERSION = 6.0`, `SWIFT_STRICT_CONCURRENCY = complete`, `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`.
- Packages: Swift tools 6.0, no default isolation; value types are `Sendable`; reference types are actors or `@MainActor`.
- `CLLocationManager` and `CBCentralManager` are created on the main actor inside `CoreLocationBeaconRadio`; delegate callbacks yield `BeaconSample` values into an `AsyncStream`.
- `PositioningEngine` (actor) consumes samples, runs the 0.35 s tick with `ContinuousClock`, owns graph, solver, fusion, matcher, route manager, and emits `PositionSnapshot` (displayed point, raw point, heading, trusted flag, status, route polyline, revision) through an `AsyncStream` consumed by `PositioningModel` on the main actor.
- `CMMotionManager` delivers to a dedicated `OperationQueue`; samples are forwarded to the engine; prediction runs inside the engine, not on the main thread.
- Network work uses structured concurrency; each model keeps the `Task` of its latest request and cancels it when a newer request starts (replacing request-id comparison).

### 4. Networking

```swift
public protocol Endpoint: Sendable {
    associatedtype Response: Decodable & Sendable
    var method: HTTPMethod { get }
    var path: String { get }
    var query: [URLQueryItem] { get }
    var body: (any Encodable & Sendable)? { get }
    var timeout: Duration { get }
    var retry: RetryPolicy { get }
}

public actor APIClient: APIClientProtocol {
    public func send<E: Endpoint>(_ endpoint: E) async throws(APIError) -> E.Response
    public func fire<E: Endpoint>(_ endpoint: E) async   // best effort, errors logged only
}

public enum APIError: Error, Sendable, Equatable {
    case offline
    case transport(URLError.Code)
    case http(status: Int, message: String?)
    case decoding(String)
    case cancelled
}
```

- `URLSession` with `URLSessionConfiguration.default`, `waitsForConnectivity = false`, `requestCachePolicy = .useProtocolCachePolicy`, `httpAdditionalHeaders = ["Accept": "application/json", "Accept-Language": "de-AT"]`.
- Timeouts: reads 15 s, layout 20 s, upsell plan 25 s, events/dismiss 3 s.
- `RetryPolicy.idempotentRead`: max 2 retries, delay `0.5 s · 2^attempt` + jitter ≤ 250 ms, retry on `URLError.timedOut`, `.networkConnectionLost`, `.cannotConnectToHost`, HTTP 502/503/504; no retry on `.notConnectedToInternet` (→ `.offline`). `RetryPolicy.none` for all POST requests; the bounded plan retry of `stabilize-upsell-quality-and-request-lifecycle` stays in `UpsellModel`.
- Backend error bodies from `ApiWebApplicationExceptionMapper` are decoded into `message`.
- Authentication/token refresh: not applicable (anonymous API). `APIClient` exposes an `AuthorizationProvider` hook that is `nil` in all builds so a future authenticated feature cannot bypass the client.

### 5. Configuration and transport security

- `Config/Shared.xcconfig`, `Config/Debug-Local.xcconfig` (`INDOORO_API_BASE_URL = http:/$()/localhost:8080/api`), `Config/Debug-LeoCloud.xcconfig` and `Config/Release.xcconfig` (`https:/$()/it220209.cloud.htl-leonding.ac.at/api`).
- `Info.plist` key `IndooroAPIBaseURL = $(INDOORO_API_BASE_URL)`; `APIEnvironment.current` reads it and fails fast in DEBUG if missing.
- `NSAppTransportSecurity` without `NSAllowsArbitraryLoads`; only `Debug-Local` adds `NSExceptionDomains.localhost.NSExceptionAllowsInsecureHTTPLoads = true` via a separate Info.plist fragment.
- Schemes: `MCindooroApp (Local)`, `MCindooroApp (LeoCloud)`, `MCindooroApp (Release)`.

### 6. Type-safe contract

- Backend schema export, annotations, the reviewed contract `openspec/specs/shared-api/openapi.yaml`, and the filtered export `api/openapi/indooro-mobile.yaml` are owned by `establish-shared-api-contract` (see „Ownership With Parallel Changes“).
- `IndooroNetworking` uses the `swift-openapi-generator` build plugin with `generate: [types]` (types only; `APIClient` stays hand-written so retry and logging stay uniform). Generated `Components.Schemas.*` are mapped to `IndooroModels` in `Mappers/*.swift`.
- Layout payloads (`JsonNode`) are free-form in OpenAPI; `LayoutData` keeps its tolerant hand-written decoder, protected by fixture tests.
- CI step fails when `target/openapi` differs from the committed filtered document after filtering.

### 7. Persistence

- `ShoppingListRepository` (actor) stores `Application Support/ShoppingLists/lists.json` as `{ "schemaVersion": 2, "selectedListID": …, "activeTourListID": …, "routeMode": …, "lists": [...] }`.
- Writes: encode → write `lists.json.tmp` → replace `lists.json` atomically → keep previous file as `lists.json.bak`.
- Load order: `lists.json` → `lists.json.bak` → migration from `UserDefaults["shoppingListStore.v1"]` plus `shoppingSession.*` keys (the keys are removed only after two consecutive successful v2 loads) → default list. A file that fails to decode is renamed to `lists.corrupt-<ISO8601>.json` and never overwritten silently.
- Writes are debounced by 300 ms; the revision counter stays in `ShoppingListModel`.
- ADR: SwiftData rejected for now (see blueprint ADR-004).

### 8. Route planning performance

- `IndoorGraph` is built once per `layoutRevision` inside `PositioningEngine` and shared read-only with `ShoppingSessionModel` through a `LayoutGraphSnapshot` (`Sendable`, immutable).
- A* uses a binary min-heap with lazy deletion; closed set as `Set<Int>`; expected complexity O(E log V).
- Multi-stop ordering: one Dijkstra run per stop plus one from the user position (k + 1 runs) → distance matrix → nearest-neighbor order (unchanged semantics) → optional 2-opt improvement for k ≤ 12 behind a feature flag (default off to keep behavior).
- Snapshot rebuild triggers: list revision change, route mode change, layout revision change, or displayed position moved ≥ 1.0 m since the last rebuild.
- Performance budget: snapshot rebuild ≤ 16 ms for a 40 × 30 m layout with 25 stops on iPhone 12.

### 9. Security

- The app embeds no secrets and stores no credentials; Keychain is not used. Any future device-bound secret must use Keychain with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- No certificate pinning: the LeoCloud ingress certificate is rotated by the school infrastructure; pinning would risk outages. ATS (TLS ≥ 1.2, forward secrecy) is enforced.
- Backend rate limiting: `MobileRateLimitFilter` keyed by `X-Forwarded-For` first hop (proxy forwarding is enabled), token bucket 20 requests per 10 minutes for `POST /api/mobile/upsell/plan` and `/suggestions`, 120 per 10 minutes for events/dismiss; response 429 with `Retry-After`. iOS treats 429 as empty suggestions without retry.
- App Attest is evaluated as P2 (blueprint ADR-007) and not part of this change.

### 10. Logging and diagnostics

- `Logger(subsystem: "at.ac.htl.leonding.indooro", category: "network" | "positioning" | "upsell" | "persistence" | "ar")`.
- Identifiers use `privacy: .private(mask: .hash)`; status codes and durations are public; bodies are never logged in Release.
- The in-app debug log (80 lines) exists only in DEBUG builds and is reachable from the settings sheet section „Diagnose“.

### 11. Tests and CI

- Swift Testing suites: `LayoutDecodingTests`, `StoreDecodingTests`, `BeaconUUIDNormalizerTests`, `IndoorGraphTests`, `AStarTests`, `RouteManagerTests`, `NavigationStateMachineTests`, `BeaconPositionSolverTests`, `ShoppingStopResolverTests`, `MultiStopRoutePlannerTests`, `ShoppingListRepositoryTests`, `ShoppingListMergeTests`, `TransferPackageTests`, `APIClientRetryTests`, `UpsellModelTests`.
- XCUITest smoke: add product and start tour in debug mode; open recipe and add to list; import `.indoorolist` fixture.
- Coverage target (report-only first): ≥ 70 % line coverage for `IndooroNavigation`, `IndooroPersistence`, `IndooroNetworking`.
- `.github/workflows/ios.yaml`: `macos-15` runner, Xcode 16.4 or later, `xcodebuild -scheme MCindooroApp -destination 'platform=iOS Simulator,name=iPhone 16' test`, SwiftLint optional.
- `.github/workflows/ci.yaml`: JDK 21 (single Java version per `docs/audit/MODERNIZATION_BLUEPRINT.md` BP-ADR-02), `mvn -B verify` (tests enabled), JaCoCo report artifact.

### 12. Resources, localization, accessibility

- `Assets.xcassets` with AppIcon (1024 px) and AccentColor RGB(0.12, 0.46, 0.39).
- `Localizable.xcstrings`, development language `de`; all user-facing strings use `String(localized:)`/`LocalizedStringKey`; ASCII transliterations in error texts are replaced by umlauts.
- Map accessibility: the indoor map container exposes `accessibilityLabel("Marktkarte")` and `accessibilityValue` with remaining distance and next stop; stop markers are accessibility elements „Stopp <n>: <Titel>“.
- `preferredColorScheme(.light)` is kept until a dark palette is designed (tracked in roadmap P2).
- Only `Resources/layout.json` remains in the app target; other layouts move to `swift/indooro-EinkaeuferFinal/Fixtures/Layouts/`; `presentation-airdrop-swift/` moves to `presentations/swift-airdrop/`; `README.md` is excluded from the target.

## Ownership With Parallel Changes

| Topic | Owner | This change |
| --- | --- | --- |
| Backend OpenAPI annotations, schema export, `scripts/export-mobile-openapi.mjs`, contract diff CI | `establish-shared-api-contract` | consumes `api/openapi/indooro-mobile.yaml`, owns the Swift type generation and mappers |
| `MobileRateLimitFilter` implementation and backend tests | `harden-platform-security-baseline` (task 4.9) | owns the iOS handling of HTTP 429 and the limit values in `ios-backend-integration` |
| `/api/v1` base path | `establish-shared-api-contract` | `APIEnvironment` base URL follows the versioned prefix once available |
| Removal of `NSAllowsArbitraryLoads` | this change | – |

## Risks / Trade-offs

- Large refactor → executed in phases (tasks sections 2–13), each ending with a green build and the manual smoke flow; behavior-preserving tests are written before moving code.
- Swift 6 migration may surface many diagnostics → migrate packages first, app target last; use `@preconcurrency import CoreBluetooth` where Apple SDKs lack annotations.
- OpenAPI generator adds a build plugin dependency (`apple/swift-openapi-generator`, `apple/swift-openapi-runtime`) → pinned versions, types-only generation.
- CoreLocation delegate behavior differs when not on main → radio adapter stays main-actor bound.

## Migration Plan

1. Tooling, config, tests for current behavior.
2. Extract pure modules (Models, Navigation) with tests.
3. Networking and persistence with migration.
4. Positioning split.
5. Observable models and views.
6. Swift 6 switch, CI, resources, legacy removal.

Rollback: each phase is a separate PR; reverting a phase restores the previous build. The persistence migration keeps the `UserDefaults` blob until the first successful v2 load has been confirmed on two launches, so rolling back the app does not lose lists.
