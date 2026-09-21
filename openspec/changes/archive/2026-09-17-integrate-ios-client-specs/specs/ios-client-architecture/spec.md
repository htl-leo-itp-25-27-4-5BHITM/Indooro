## ADDED Requirements

### Requirement: Canonical iOS source tree is explicit
The project SHALL treat `swift/indooro-EinkaeuferFinal/indooroApp` with the Xcode project `swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj`, scheme `MCindooroApp`, and bundle identifier `at.ac.htl.leonding.indooroswift2` as the only canonical iOS customer app. The trees `swift/indooro-/indooroApp` and `swift/indooroApp/indooroApp` SHALL be treated as legacy references that receive no new features.

#### Scenario: A change targets the iOS app
- **GIVEN** a proposal modifies iOS customer behavior
- **WHEN** its tasks name Swift files or build commands
- **THEN** they reference `swift/indooro-EinkaeuferFinal` and the `MCindooroApp` scheme

#### Scenario: A legacy tree differs from the canonical tree
- **GIVEN** `swift/indooro-` contains a fix that the canonical tree lacks
- **WHEN** the behavior is evaluated against OpenSpec
- **THEN** only the canonical tree counts as implemented behavior

### Requirement: iOS build baseline is declared
The canonical iOS app SHALL build as a SwiftUI application with deployment target iOS 18.5, targeted device families iPhone and iPad, automatic signing, and Xcode file-system-synchronized groups. The app SHALL declare portrait and landscape orientations on iPhone and all four orientations on iPad.

#### Scenario: Simulator build is executed
- **GIVEN** Xcode with an iOS 18.5 or later simulator SDK is installed
- **WHEN** `xcodebuild -project swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj -scheme MCindooroApp -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' build` runs
- **THEN** the build produces the `MCindooroApp` application without requiring external Swift packages

#### Scenario: A newer API is adopted
- **GIVEN** the deployment target is iOS 18.5
- **WHEN** a change uses an API introduced after iOS 18.5
- **THEN** the change guards the call with availability checks or raises the deployment target through an OpenSpec delta

### Requirement: App shell uses a five-tab navigation
WHEN the app launches, the iOS app SHALL present a `TabView` with the tabs „Start“ (`house.fill`), „Planung“ (`plus.circle.fill`), „Rezepte“ (`fork.knife`), „Einkaufen“ (`checklist.checked`), and „Karte“ (`map.fill`) in this order, SHALL select „Start“ initially, SHALL apply the tint color RGB(0.12, 0.46, 0.39), and SHALL force the light color scheme.

#### Scenario: App starts
- **GIVEN** the app is launched without an incoming document
- **WHEN** the first frame is rendered
- **THEN** the „Start“ tab is selected and all five tabs are visible in the tab bar

#### Scenario: Dashboard shortcut is used
- **GIVEN** the „Start“ tab is visible
- **WHEN** the customer taps the planning, recipe, shopping, or map card
- **THEN** the corresponding tab becomes selected without resetting the state of the other tabs

### Requirement: Start dashboard summarizes the shopping context
The „Start“ tab SHALL show the Indooro brand header, the headline „Finde alles. Schnell und einfach.“, the selected shopping list with its open and completed counts, an active-tour card WHILE a shopping session is active, entry cards for recipes and the store map, and a tutorial sheet titled „So nutzt du Indooro am einfachsten“ that is dismissed with „Fertig“.

#### Scenario: Shopping tour is active
- **GIVEN** a shopping session has a current stop
- **WHEN** the „Start“ tab is shown
- **THEN** the „Aktive Einkaufstour“ card shows the list name, current stop title, remaining stops, remaining products, and unresolved products

#### Scenario: No shopping tour is active
- **GIVEN** no shopping session is active
- **WHEN** the „Start“ tab is shown
- **THEN** the active-tour card is not shown and the planning entry remains available

### Requirement: Feature stores are owned by the root view
The iOS app SHALL create exactly one instance each of `BeaconManager`, `ShoppingListManager`, `ShoppingSessionManager`, `RecipeStore`, and `UpsellSuggestionStore`, plus two independent `ProductSearchStore` instances (one for the map tab, one for the planning tab), as state objects of the root `ContentView`, and SHALL pass them explicitly to the tab views that need them.

#### Scenario: Map search and planning search run in parallel
- **GIVEN** the customer has results in the planning tab
- **WHEN** the customer searches on the map tab
- **THEN** the planning results remain unchanged because the two tabs use separate search stores

#### Scenario: Layout changes while a tour is active
- **GIVEN** a shopping session is active
- **WHEN** `BeaconManager.layoutRevision`, `userPosition`, `rawUserPosition`, or `ShoppingListManager.revision` changes
- **THEN** the root view re-synchronizes the shopping session snapshot

### Requirement: Cross-tab navigation actions are centralized
The root view SHALL implement the actions „focus product on map“, „add product to list“, „add upsell suggestion“, „start shopping session“, and „stop shopping session“. WHEN a product is focused on the map, the iOS app SHALL stop an active shopping session, set the target product, select the „Karte“ tab, and clear the map search. WHEN a shopping session starts, the iOS app SHALL select the list, reset the upsell session, clear the target product, request opening the last store layout, select the „Karte“ tab, and clear both product searches.

#### Scenario: Product is shown on map from planning
- **GIVEN** a shopping session is active
- **WHEN** the customer chooses „Auf Karte zeigen“ for a product
- **THEN** the session stops, the map tab opens, and the route targets that product

#### Scenario: Tour is started from the shopping tab
- **GIVEN** a list has at least one open item
- **WHEN** the customer taps „Tour starten“
- **THEN** the map tab opens with the tour panel and the first stop as route target

### Requirement: Runtime permissions are declared with German usage descriptions
The iOS app SHALL declare `NSBluetoothAlwaysUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, and `NSMotionUsageDescription` with German explanations of beacon search, iBeacon measurement, AR navigation, and motion-based positioning. The app SHALL request only When-In-Use location authorization.

#### Scenario: Location authorization is not determined
- **GIVEN** the app starts for the first time
- **WHEN** `BeaconManager` initializes
- **THEN** the app requests When-In-Use authorization and does not request Always authorization

#### Scenario: Location authorization is denied
- **GIVEN** location authorization is denied or restricted
- **WHEN** positioning starts
- **THEN** the app publishes „Bitte Standortfreigabe erlauben, damit iBeacon-Ranging funktioniert.“ and stops heading updates

#### Scenario: Location services are disabled
- **GIVEN** system location services are disabled
- **WHEN** positioning starts
- **THEN** the app publishes „Ortungsdienste sind deaktiviert. iBeacon-Ranging braucht Standortfreigabe.“

### Requirement: Indooro shopping-list document type is registered
The iOS app SHALL export the uniform type `at.ac.htl.leonding.indooro.shopping-list` conforming to `public.json` with file extension `indoorolist` and MIME type `application/vnd.indooro.shopping-list+json`, SHALL register as owner and editor of that type, SHALL support opening documents in place, and WHEN a file URL is opened THEN the app SHALL decode it as a transfer package and select the „Einkaufen“ tab.

#### Scenario: Customer opens a shared list from Files or AirDrop
- **GIVEN** a valid `.indoorolist` file
- **WHEN** iOS hands the URL to the app
- **THEN** the „Einkaufen“ tab shows the import preview for that package

#### Scenario: Customer opens an invalid file
- **GIVEN** a `.indoorolist` file that cannot be decoded
- **WHEN** iOS hands the URL to the app
- **THEN** the „Einkaufen“ tab shows the alert „Aktion fehlgeschlagen“ with the localized transfer error

### Requirement: Bundled layout guarantees a first map
The iOS app SHALL bundle `Resources/layout.json` and SHALL apply it synchronously during `BeaconManager` initialization before any network request completes, so the indoor map always has a layout to render.

#### Scenario: App starts offline
- **GIVEN** the device has no network connection
- **WHEN** the app starts
- **THEN** the indoor map renders the bundled layout and the layout description starts with „Bundle-Layout“

#### Scenario: Bundle layout is missing
- **GIVEN** the bundle does not contain `layout.json`
- **WHEN** the bundle fallback is requested
- **THEN** the layout description is „Kein Bundle-Layout verfuegbar“ and the loading indicator stops

### Requirement: In-app debug log is bounded
The positioning manager SHALL keep an in-memory debug log of at most 80 lines with `HH:mm:ss.SSS` timestamps, SHALL rate-limit repeated keyed messages by a per-key minimum interval, SHALL append log lines on the main thread only, and SHALL allow clearing the log.

#### Scenario: Log exceeds limit
- **GIVEN** the debug log contains 80 lines
- **WHEN** another message is appended
- **THEN** the oldest line is removed

#### Scenario: Repeated advertisement message
- **GIVEN** a keyed message was logged less than its minimum interval ago
- **WHEN** the same key is logged again
- **THEN** the new message is dropped
