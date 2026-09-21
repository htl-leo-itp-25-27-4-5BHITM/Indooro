## MODIFIED Requirements

### Requirement: iOS build baseline is declared
The canonical iOS app SHALL build as a SwiftUI application with deployment target iOS 18.5, targeted device families iPhone and iPad, automatic signing, Xcode file-system-synchronized groups, Swift 6 language mode, complete strict concurrency checking, and default `MainActor` isolation for the app target. The app SHALL declare portrait and landscape orientations on iPhone and all four orientations on iPad. The app SHALL provide the build configurations `Debug-Local`, `Debug-LeoCloud`, and `Release`, each with its own scheme.

#### Scenario: Simulator build is executed
- **GIVEN** Xcode 16.4 or later with an iOS 18.5 or later simulator SDK is installed
- **WHEN** `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme 'MCindooroApp (LeoCloud)' -destination 'platform=iOS Simulator,name=iPhone 16' build` runs
- **THEN** the build produces the `MCindooroApp` application with zero concurrency diagnostics

#### Scenario: A newer API is adopted
- **GIVEN** the deployment target is iOS 18.5
- **WHEN** a change uses an API introduced after iOS 18.5
- **THEN** the change guards the call with availability checks or raises the deployment target through an OpenSpec delta

#### Scenario: Data race is introduced
- **GIVEN** a change mutates main-actor state from a background task
- **WHEN** the project is compiled
- **THEN** the compiler reports an error and the build fails

### Requirement: Feature stores are owned by the root view
The iOS app SHALL create exactly one `AppEnvironment` and exactly one instance each of `AppRouter`, `StoreContextModel`, `LayoutModel`, `PositioningModel`, `ShoppingListModel`, `ShoppingSessionModel`, `RecipeModel`, and `UpsellModel`, plus two independent `ProductSearchModel` instances (one for the map tab, one for the planning tab), at the app root. All models SHALL be `@Observable` and `@MainActor`, SHALL receive their dependencies from `AppEnvironment`, and SHALL be provided to views through the SwiftUI environment. Cross-tab actions SHALL be implemented in `AppRouter`.

#### Scenario: Map search and planning search run in parallel
- **GIVEN** the customer has results in the planning tab
- **WHEN** the customer searches on the map tab
- **THEN** the planning results remain unchanged because the two tabs use separate search models

#### Scenario: Layout changes while a tour is active
- **GIVEN** a shopping session is active
- **WHEN** the layout revision, the list revision, or the route mode changes, or the displayed position moves at least 1.0 m
- **THEN** the shopping session snapshot is rebuilt

#### Scenario: Preview uses fake dependencies
- **GIVEN** a SwiftUI preview of the map tab
- **WHEN** it is rendered with `AppEnvironment.preview`
- **THEN** no network request and no Bluetooth or location access happens

### Requirement: Bundled layout guarantees a first map
The iOS app SHALL bundle exactly one layout file, `Resources/layout.json`, and SHALL apply it before any network request completes, so the indoor map always has a layout to render.

#### Scenario: App starts offline
- **GIVEN** the device has no network connection and no cached layout
- **WHEN** the app starts
- **THEN** the indoor map renders the bundled layout and the layout description starts with „Bundle-Layout“

#### Scenario: Bundle layout is missing
- **GIVEN** the bundle does not contain `layout.json`
- **WHEN** the bundle fallback is requested
- **THEN** the layout description is „Kein Bundle-Layout verfügbar“ and the loading indicator stops

### Requirement: In-app debug log is bounded
In DEBUG builds the positioning subsystem SHALL keep an in-memory debug log of at most 80 lines with `HH:mm:ss.SSS` timestamps, SHALL rate-limit repeated keyed messages by a per-key minimum interval, SHALL append log lines on the main actor only, SHALL allow clearing the log, and SHALL expose it in the settings section „Diagnose“. Release builds SHALL NOT contain the in-app debug log. All builds SHALL log through `os.Logger` with subsystem `at.ac.htl.leonding.indooro`, SHALL mark identifiers as private, and SHALL NOT log request or response bodies in Release builds.

#### Scenario: Log exceeds limit
- **GIVEN** a DEBUG build whose debug log contains 80 lines
- **WHEN** another message is appended
- **THEN** the oldest line is removed

#### Scenario: Repeated advertisement message
- **GIVEN** a keyed message was logged less than its minimum interval ago
- **WHEN** the same key is logged again
- **THEN** the new message is dropped

#### Scenario: Release build logs an upsell plan
- **GIVEN** a Release build
- **WHEN** an upsell plan response arrives
- **THEN** only status, duration, and suggestion count are logged and the body is not logged

## ADDED Requirements

### Requirement: Core logic lives in the IndooroKit package
The iOS app SHALL place models, networking, navigation, positioning, persistence, design system, and feature code in the local Swift package `swift/indooro-EinkaeuferFinal/Packages/IndooroKit` with the targets `IndooroModels`, `IndooroNetworking`, `IndooroNavigation`, `IndooroPositioning`, `IndooroPersistence`, `IndooroDesignSystem`, `FeatureStart`, `FeaturePlanning`, `FeatureRecipes`, `FeatureShopping`, `FeatureMap`, `FeatureUpsell`, and `FeatureAR`. `IndooroModels` and `IndooroNavigation` SHALL NOT import SwiftUI, UIKit, CoreBluetooth, CoreLocation, or ARKit. The app target SHALL only contain the app entry point, `AppEnvironment`, the root view, configuration, and resources.

#### Scenario: Navigation logic is tested on macOS
- **GIVEN** the `IndooroNavigation` target
- **WHEN** `swift test` runs for that target
- **THEN** it compiles and runs without iOS-only frameworks

#### Scenario: A feature needs another feature
- **GIVEN** `FeatureRecipes` needs to open the shopping tab
- **WHEN** the dependency is implemented
- **THEN** it goes through `AppRouter` instead of importing `FeatureShopping`

### Requirement: Positioning computation runs off the main actor
The iOS app SHALL run beacon sample processing, trilateration, pose fusion, map matching, route updates, and motion-based prediction inside the `PositioningEngine` actor, SHALL keep CoreLocation and CoreBluetooth managers main-actor bound only for delegate delivery, and SHALL publish `PositionSnapshot` values to `PositioningModel` at most at the display update rate defined by the positioning pipeline.

#### Scenario: Motion samples at 20 Hz
- **GIVEN** device motion updates arrive at 20 Hz
- **WHEN** the customer walks with the map open
- **THEN** pose prediction runs on the engine actor and the main thread performs no map matching

#### Scenario: Engine is tested with a fake radio
- **GIVEN** a fake `BeaconRadio` emitting three beacons and a test clock
- **WHEN** the clock advances past the warm-up
- **THEN** the engine emits a trusted position snapshot without any Apple radio framework

### Requirement: Route planning reuses graph data per layout revision
The iOS app SHALL build the walkable graph once per layout revision, SHALL share it as an immutable snapshot, SHALL run A* with a binary min-heap, SHALL order shopping stops from a distance matrix computed with one shortest-path search per stop plus one from the user position, and SHALL rebuild a 25-stop snapshot for a 40 m × 30 m layout within 16 ms on an iPhone 12 class device.

#### Scenario: Position updates during a tour
- **GIVEN** a tour with 10 stops
- **WHEN** ten position updates arrive
- **THEN** the walkable graph is not rebuilt

#### Scenario: Order is unchanged by the optimization
- **GIVEN** the characterization fixtures from before the refactor
- **WHEN** stops are ordered in optimized mode
- **THEN** the order equals the recorded nearest-neighbor order

### Requirement: Shopping data persists in versioned files
The iOS app SHALL persist lists, selected list, active tour list, and route mode in `Application Support/ShoppingLists/lists.json` with `schemaVersion` 2, SHALL write atomically and keep the previous file as `lists.json.bak`, SHALL debounce writes by 300 ms, SHALL migrate data from the `UserDefaults` keys `shoppingListStore.v1`, `shoppingSession.activeListID`, and `shoppingSession.routeMode` on first launch, SHALL remove those keys only after two consecutive successful loads of the new file, and IF the file cannot be decoded THEN SHALL rename it to `lists.corrupt-<timestamp>.json`, try the backup, and never overwrite unreadable data with a new default list.

#### Scenario: Upgrade from the UserDefaults version
- **GIVEN** a device with lists in `shoppingListStore.v1`
- **WHEN** the modernized app starts for the first time
- **THEN** all lists appear unchanged and `lists.json` is written

#### Scenario: Corrupt file
- **GIVEN** `lists.json` contains invalid JSON and a valid backup exists
- **WHEN** the app starts
- **THEN** the lists from the backup are shown and the corrupt file is kept as `lists.corrupt-<timestamp>.json`

### Requirement: Core logic is covered by automated tests
The iOS code base SHALL contain Swift Testing suites for layout, store, recipe, upsell, and transfer decoding; UUID normalization; graph construction and A*; route manager; navigation state machine; position solver; stop resolution and ordering; list repository and merge rules; API client retries; and upsell model state; SHALL contain XCUITest smoke tests for a debug-mode tour, a recipe add flow, and a list import; and SHALL use only local fixtures without network access in unit tests.

#### Scenario: Unit tests run offline
- **GIVEN** the CI simulator has no network access
- **WHEN** the unit test plan runs
- **THEN** all unit tests pass

### Requirement: iOS CI builds and tests every change
The repository SHALL run `.github/workflows/ios.yaml` on every push and pull request that touches `swift/indooro-EinkaeuferFinal/**`, building the LeoCloud scheme and running the unit test plan on an iOS simulator, and SHALL publish the test result bundle as an artifact.

#### Scenario: Test failure
- **GIVEN** a pull request breaks `AStarTests`
- **WHEN** the workflow runs
- **THEN** the workflow fails and the result bundle is attached

### Requirement: App resources contain only shipped assets
The app target SHALL contain an asset catalog with AppIcon and AccentColor RGB(0.12, 0.46, 0.39), the String Catalog, `Resources/layout.json`, and `Info.plist`, and SHALL NOT contain presentation files, README files, or unused layout JSONs.

#### Scenario: Bundle is inspected
- **GIVEN** a Release build
- **WHEN** the `.app` bundle contents are listed
- **THEN** no `.html`, `.js`, `.md`, or additional layout JSON files are present

### Requirement: UI text is localizable and accessible
All user-facing strings SHALL be defined in `Localizable.xcstrings` with development language German and SHALL use umlauts instead of ASCII transliterations. The indoor map SHALL expose the accessibility label „Marktkarte“ and a value with the remaining route distance and next stop; stop markers SHALL be accessibility elements „Stopp <n>: <Titel>“; all tabs SHALL remain usable with Dynamic Type up to Accessibility XL.

#### Scenario: VoiceOver on the map
- **GIVEN** VoiceOver is enabled and a tour is active
- **WHEN** the map gets focus
- **THEN** VoiceOver reads „Marktkarte“ followed by the remaining distance and the next stop title

### Requirement: Legacy Swift trees are retired
The repository SHALL NOT contain `swift/indooro-`, `swift/indooroApp`, archives of Swift projects, or tracked Xcode user state files, and SHALL ignore `xcuserdata/` directories.

#### Scenario: Repository scan
- **GIVEN** the default branch after this change
- **WHEN** `find swift -name '*.xcodeproj'` runs
- **THEN** only `swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj` is found
