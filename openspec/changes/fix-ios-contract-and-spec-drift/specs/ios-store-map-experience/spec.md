## MODIFIED Requirements

### Requirement: Store overview renders stores on MapKit
The store overview SHALL render a SwiftUI `Map` with realistic elevation, the system user annotation, and one pin per mobile store whose persisted latitude is within −90…90 and longitude within −180…180. The app SHALL NOT derive coordinates from city names, store codes, or any other fallback. Stores without valid coordinates SHALL be excluded from pins and camera fitting and SHALL be listed in a selectable chip row „Ohne Kartenposition“. The initial camera SHALL center on latitude 48.3069 and longitude 14.2858 with span 0.34 × 0.48 degrees. WHEN the store list changes or the customer taps the locate button, the camera SHALL fit all pins with span `max(0.045, 1.8·Δlat + 0.035)` × `max(0.055, 1.8·Δlon + 0.045)`. The header SHALL show the title „Filialen“, the subtitle „Filialen werden geladen“, „1 Filiale“, or „<n> Filialen“ counting all active stores, and buttons to fit pins, reload stores (disabled while loading), and open settings. Store cards SHALL show name, address (or city), and store code.

#### Scenario: Three stores are loaded
- **GIVEN** three active stores with coordinates
- **WHEN** the overview is shown
- **THEN** three pins and three horizontally scrollable store cards with name, address, and store code are shown and the subtitle reads „3 Filialen“

#### Scenario: Store without coordinates
- **GIVEN** one of three active stores has no latitude
- **WHEN** the overview is shown
- **THEN** two pins are shown, the third store appears under „Ohne Kartenposition“, and tapping it loads its layout

#### Scenario: Store loading fails
- **GIVEN** `GET /mobile/stores` fails and no stores exist
- **WHEN** the overview is shown
- **THEN** the bottom panel shows the error message with a retry button

#### Scenario: Stores are loading for the first time
- **GIVEN** no stores are loaded yet and a request is running
- **WHEN** the overview is shown
- **THEN** a large progress indicator is centered on the map

### Requirement: Indoor view header and search
The indoor view SHALL show a back button that returns to the store overview (clearing target product and search and refitting pins), the active store name or „Marktkarte“, the active layout description, a warning badge WHILE the applied layout is a server fallback or an offline copy, a settings button, and a search field „Produkte oder Kategorien suchen“. WHEN the trimmed search text has more than two characters, the app SHALL search products with `size=50` scoped to the active store; otherwise it SHALL clear the results. Results SHALL be shown in a floating panel of at most 320 points height with rows whose navigate action is labeled „Auf Karte zeigen“, and SHALL show „Produkte werden gesucht...“, „Suche fehlgeschlagen“ with the error and „Erneut versuchen“ WHEN the request failed, or an empty state with „Probiere einen anderen Suchbegriff oder suche in der Planung über Kategorien.“.

#### Scenario: Customer searches on the map
- **GIVEN** the indoor view is visible
- **WHEN** the customer types „butter“
- **THEN** a product search for „butter“ is sent and results appear above the map

#### Scenario: Customer returns to overview
- **GIVEN** a target product is set
- **WHEN** the customer taps the back button
- **THEN** the store overview is shown and the target product is cleared

#### Scenario: Search while offline
- **GIVEN** the device is offline
- **WHEN** the customer types „butter“
- **THEN** the panel shows „Suche fehlgeschlagen“ and „Erneut versuchen“

#### Scenario: Default layout delivered for a store
- **GIVEN** the store has no active layout and the server returns `fallback: true`
- **WHEN** the indoor view is shown
- **THEN** the header shows a warning badge and the description „<store> • Standard-Layout (kein aktives Filial-Layout)“

## ADDED Requirements

### Requirement: Untrusted positions are rendered as degraded
WHILE the tracking mode is beacon and the navigation state is low confidence or fewer than three beacon measurements are active, the indoor map SHALL draw the user marker at 45 % opacity with a dashed uncertainty ring of 3 m radius and SHALL show a banner with the current navigation status message or „Position ungenau“ and the action „Position setzen“. WHEN „Position setzen“ is tapped, the app SHALL disable „Tap setzt Ziel“ so that the next map tap calibrates the position.

#### Scenario: Two beacons visible
- **GIVEN** only two beacons have fresh measurements
- **WHEN** the map renders the user marker
- **THEN** the marker is translucent with an uncertainty ring and the banner „Position ungenau“ is shown

#### Scenario: Confidence recovers
- **GIVEN** the banner is shown
- **WHEN** confidence reaches 0.55 with at least three beacons
- **THEN** the marker is drawn fully opaque and the banner disappears

#### Scenario: Debug mode
- **GIVEN** tracking mode is „Debug (ohne Beacons)“
- **WHEN** the customer calibrates the position by tap
- **THEN** the marker is drawn fully opaque without banner
