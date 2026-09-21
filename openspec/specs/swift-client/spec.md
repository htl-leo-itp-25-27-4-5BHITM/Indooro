# swift-client Specification

## Purpose
Defines the cross-cutting platform contract of the canonical iOS client: how iOS behavior is split across the `ios-*` and `mobile-*` capabilities, the supported platforms, the native framework inventory, on-device data ownership, the absence of server sync and push notifications, anonymous HTTPS transport, and the strict-concurrency debt baseline.
## Requirements
### Requirement: Swift client behavior is split across named capabilities
The canonical iOS client (`swift/indooro-EinkaeuferFinal`) SHALL be specified by this capability for cross-cutting platform rules and by the feature capabilities `ios-client-architecture`, `ios-backend-integration`, `ios-product-planning`, `ios-store-map-experience`, `ios-recipe-experience`, `mobile-store-detection`, `mobile-positioning-navigation`, `mobile-shopping-lists`, and `mobile-ar-navigation`. A change that alters iOS behavior SHALL name the feature capability it modifies and SHALL only modify `swift-client` when a cross-cutting platform rule changes.

#### Scenario: A change adds a planning feature
- **GIVEN** a proposal adds a filter to the „Planung“ tab
- **WHEN** its spec deltas are written
- **THEN** the delta targets `ios-product-planning` and does not duplicate the rule in `swift-client`

#### Scenario: A change introduces a new platform framework
- **GIVEN** a proposal adds WidgetKit to the app
- **WHEN** its spec deltas are written
- **THEN** the delta modifies the platform feature inventory in `swift-client`

### Requirement: Swift client targets iOS and iPadOS only
The Swift client SHALL be built as a single iOS application target for iPhone and iPad. The repository SHALL NOT contain a macOS, watchOS, visionOS, or Mac Catalyst target unless a change adds one explicitly.

#### Scenario: Supported destinations are listed
- **GIVEN** the Xcode project `MCindooroApp.xcodeproj`
- **WHEN** the build settings are inspected
- **THEN** `TARGETED_DEVICE_FAMILY` is `1,2` and no macOS destination is configured

#### Scenario: A macOS build is requested
- **GIVEN** a stakeholder asks for a macOS version
- **WHEN** the request is evaluated
- **THEN** it requires a new OpenSpec change because no macOS target exists

### Requirement: Swift client platform feature inventory is explicit
The Swift client SHALL use only the following Apple frameworks for product functionality: SwiftUI, UIKit (bridging), Combine, Foundation, CoreGraphics, simd, CoreBluetooth, CoreLocation (iBeacon ranging and heading), CoreMotion, MapKit, ARKit, RealityKit, and UniformTypeIdentifiers. The client SHALL NOT use push notifications, background modes, background tasks, widgets, App Intents, iCloud, Keychain items, or third-party Swift packages unless a change adds them to this inventory.

#### Scenario: Info.plist is inspected
- **GIVEN** `swift/indooro-EinkaeuferFinal/indooroApp/Info.plist`
- **WHEN** background and notification keys are searched
- **THEN** neither `UIBackgroundModes` nor an `aps-environment` entitlement is present

#### Scenario: A developer adds a Swift package
- **GIVEN** a change adds a package reference to the Xcode project
- **WHEN** the change is reviewed
- **THEN** the change also updates this inventory and states the package's purpose and license

### Requirement: Customer data stays on the device
The Swift client SHALL keep shopping lists, the active shopping session, the selected route mode, and layout selection preferences only on the device, SHALL share lists only through user-initiated `.indoorolist` documents, and SHALL NOT upload shopping lists, positions, or identifiers that link a person to a shopping session. Identifiers that the client sends with upsell requests (the local shopping list UUID and the optional session identifier) SHALL be random local UUIDs, and the backend SHALL persist them only as SHA-256 hashes.

#### Scenario: A shopping list is created offline
- **GIVEN** the device has no network connection
- **WHEN** the customer creates a list and adds items
- **THEN** the list is stored locally and remains available after an app restart

#### Scenario: A list is shared
- **GIVEN** a shopping list with three items
- **WHEN** the customer shares the list
- **THEN** the app writes a `.indoorolist` file and passes it to the system share sheet without calling the backend

### Requirement: Swift client has no server synchronization or push channel
The Swift client SHALL NOT synchronize shopping lists or sessions with a server and SHALL NOT receive push notifications. Data freshness for stores, layouts, recipes, products, and upsell plans SHALL come from explicit requests made while the corresponding screen or session is active.

#### Scenario: Recipes change on the server
- **GIVEN** an admin publishes a new recipe
- **WHEN** the customer opens or refreshes the „Rezepte“ tab
- **THEN** the new recipe appears; no push message is involved

#### Scenario: Two devices use the same list
- **GIVEN** a list was imported on a second device from a `.indoorolist` file
- **WHEN** the list is edited on the first device
- **THEN** the second device keeps its own copy unchanged

### Requirement: Swift client uses anonymous HTTPS transport
The Swift client SHALL call the backend only through HTTPS on the configured host, SHALL NOT send user credentials, cookies, or bearer tokens, and SHALL NOT store secrets on the device. Customer-facing features SHALL work without an account.

#### Scenario: A mobile route is called
- **GIVEN** the client requests `GET /api/mobile/stores`
- **WHEN** the request is sent
- **THEN** it carries no `Authorization` header and no session cookie

#### Scenario: A secret is proposed for the client
- **GIVEN** a change needs an API key in the app
- **WHEN** the change is reviewed
- **THEN** the key is moved to the backend instead, because the client must not store secrets

### Requirement: Concurrency debt must not grow
The Swift client SHALL be buildable with `SWIFT_STRICT_CONCURRENCY=complete`. The measured baseline of 2026-09-17 is 120 unique concurrency diagnostics (76 in `Managers/BeaconManager.swift`, 35 in `AR/RouteMarkerPool.swift`, 4 in `Managers/ProductSearchStore.swift`, 2 in `Models/LayoutData.swift`, 2 in `AR/ARNavViewController.swift`, 1 in `Views/Main/StoreMapPage.swift`). A change SHALL NOT increase this count, and new observable UI state types SHALL be isolated to the main actor.

#### Scenario: Strict build is executed
- **GIVEN** Xcode 26 or later
- **WHEN** `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO SWIFT_STRICT_CONCURRENCY=complete` runs
- **THEN** the build succeeds and reports at most 120 unique concurrency diagnostics

#### Scenario: A new store type is added
- **GIVEN** a change adds a new observable store for UI state
- **WHEN** the type is declared
- **THEN** it is annotated with `@MainActor` or uses the Observation framework on the main actor

