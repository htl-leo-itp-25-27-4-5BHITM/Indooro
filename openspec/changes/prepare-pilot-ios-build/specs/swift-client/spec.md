## ADDED Requirements

### Requirement: Pilot feature profile limits visible features
The Swift client SHALL read a feature profile from the Info.plist key `IndooroFeatureProfile` with the values `pilot` and `full`. In profile `pilot` the client SHALL hide the Rezepte tab and all dashboard shortcuts to it, SHALL NOT send any upsell request, SHALL NOT show upsell prompts, SHALL hide the AR entry, and SHALL NOT switch the active store automatically after beacon-based store detection. Profile `full` SHALL keep the existing behavior. DEBUG builds MAY override the profile in the settings sheet.

#### Scenario: Pilot profile hides recipes and upsell
- **GIVEN** `IndooroFeatureProfile` is `pilot`
- **WHEN** the app starts and the customer completes a shopping stop
- **THEN** the tab bar shows Start, Planung, Einkaufen and Karte, and no request to `/api/mobile/upsell/*` is sent

#### Scenario: Detected store does not override the selection
- **GIVEN** profile `pilot` and the customer has opened store A
- **WHEN** beacons of store B are detected
- **THEN** store A stays active and at most a suggestion to open store B is shown

### Requirement: API base URL and timeouts are configured centrally
The Swift client SHALL obtain the API base URL from one `AppEnvironment` value that reads the Info.plist key `IndooroAPIBaseURL` and falls back to the LeoCloud URL, and SHALL use a request timeout of at most 15 seconds for all backend requests. No other source file SHALL contain the API host literal.

#### Scenario: Single source for the base URL
- **WHEN** the source tree is searched for `it220209.cloud.htl-leonding.ac.at`
- **THEN** the only hits are `AppEnvironment` defaults and documentation

### Requirement: Permissions are requested in context
The Swift client SHALL NOT request location or Bluetooth permission at app launch. It SHALL request them WHEN the customer switches positioning to „Mit Ortung“. WHILE positioning is „Mit Ortung“ and location permission is denied, the indoor map SHALL show a banner „Standortzugriff fehlt“ with a button that opens the iOS settings of the app. WHILE Bluetooth is powered off or unauthorized, the indoor map SHALL show „Bluetooth ist aus – Ortung nicht möglich“. In „Ohne Ortung“ no permission banner SHALL be shown.

#### Scenario: First launch without prompts
- **GIVEN** a fresh install
- **WHEN** the app starts and shows the introduction
- **THEN** no system permission dialog appears

#### Scenario: Bluetooth off
- **GIVEN** positioning is „Mit Ortung“ and Bluetooth is off
- **WHEN** the indoor map is shown
- **THEN** the banner „Bluetooth ist aus – Ortung nicht möglich“ is visible and the app keeps working without position

### Requirement: Customer-facing labels are German and free of developer terms
Release builds SHALL label the positioning modes „Mit Ortung“ and „Ohne Ortung“ and SHALL NOT show the terms „Debug“, „Tracking“, „Beacon“, „Tap“, „LeoCloud“ or raw layout codes in customer-facing views. Developer controls (map tap mode, debug log, recorder, layout source) SHALL be visible only in DEBUG builds.

#### Scenario: Release settings sheet
- **GIVEN** a Release build
- **WHEN** the settings sheet is opened
- **THEN** it shows the positioning choice „Mit Ortung“/„Ohne Ortung“ and map options, and no section titled „Debug“

### Requirement: First launch shows a one-screen introduction
On first launch the Swift client SHALL show one introduction screen that explains in at most three short points how to search a product, how to read the shelf location, and that positioning is optional, with a single button „Los geht's“. The screen SHALL be reachable again from the Start tab help button.

#### Scenario: Introduction once
- **GIVEN** a fresh install
- **WHEN** the customer taps „Los geht's“ and restarts the app
- **THEN** the introduction is not shown again automatically
