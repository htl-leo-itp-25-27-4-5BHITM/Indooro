# ios-store-map-experience Specification

## Purpose
Defines the „Karte“ tab of the iOS app: the MapKit store overview, manual store selection, the scaled indoor layout map with markers and route line, target and tour panels, upsell preloading triggers, the settings sheet, and tap-based target or position setting.
## Requirements
### Requirement: Map tab switches between store overview and indoor map
The „Karte“ tab SHALL show either the outdoor store overview or the indoor layout view. WHEN the tab appears, the iOS app SHALL load mobile stores if none are loaded, SHALL open the indoor view IF a pending „open last store layout“ request exists and a store layout is active, and otherwise SHALL show the indoor view only WHILE the active layout was activated by beacon detection.

#### Scenario: Store detected by beacon before opening the tab
- **GIVEN** the active layout store was activated by beacon detection
- **WHEN** the customer opens the map tab
- **THEN** the indoor layout view is shown

#### Scenario: No store activated
- **GIVEN** no store layout is active
- **WHEN** the customer opens the map tab
- **THEN** the store overview is shown

#### Scenario: Tour starts with a manually selected store
- **GIVEN** the customer selected a store manually earlier
- **WHEN** a shopping tour starts
- **THEN** the map tab opens directly in the indoor view of that store

### Requirement: Store overview renders stores on MapKit
The store overview SHALL render a SwiftUI `Map` with realistic elevation, the system user annotation, and one pin per mobile store with a valid coordinate. The initial camera SHALL center on latitude 48.3069 and longitude 14.2858 with span 0.34 × 0.48 degrees. WHEN the store list changes or the customer taps the locate button, the camera SHALL fit all pins with span `max(0.045, 1.8·Δlat + 0.035)` × `max(0.055, 1.8·Δlon + 0.045)`. The header SHALL show the title „SPAR-Filialen“, the subtitle „Filialen werden geladen“, „1 Filiale“, or „<n> Filialen“, and buttons to fit pins, reload stores (disabled while loading), and open settings.

#### Scenario: Three stores are loaded
- **GIVEN** three active stores with coordinates
- **WHEN** the overview is shown
- **THEN** three pins and three horizontally scrollable store cards with name, city, and store code are shown and the subtitle reads „3 Filialen“

#### Scenario: Store loading fails
- **GIVEN** `GET /mobile/stores` fails and no pins exist
- **WHEN** the overview is shown
- **THEN** the bottom panel shows the error message with a retry button

#### Scenario: Stores are loading for the first time
- **GIVEN** no stores are loaded yet and a request is running
- **WHEN** the overview is shown
- **THEN** a large progress indicator is centered on the map

### Requirement: Manual store selection loads the store layout
WHEN the customer taps a store pin or store card and no other selection is pending, the iOS app SHALL authorize upsell plan preloading for that store with reason `manual_store_tap`, mark the store as pending (showing a loading pin and disabling other pins), clear the target product, and load `GET /mobile/stores/{storeId}/layout/current`. WHEN the layout load finishes for the pending store, the app SHALL clear the search, dismiss the keyboard, and animate to the indoor view; WHEN it finishes for another store or fails, the app SHALL clear the pending state.

#### Scenario: Store tap succeeds
- **GIVEN** the overview shows „EUROSPAR Leonding/Hart“
- **WHEN** the customer taps its pin and the layout loads
- **THEN** the indoor view shows that store's layout and the header shows the store name

#### Scenario: Double tap during loading
- **GIVEN** a store selection is pending
- **WHEN** the customer taps another pin
- **THEN** the tap is ignored

### Requirement: Indoor view header and search
The indoor view SHALL show a back button that returns to the store overview (clearing target product and search and refitting pins), the active store name or „Marktkarte“, the active layout description, a settings button, and a search field „Produkte oder Kategorien suchen“. WHEN the trimmed search text has more than two characters, the app SHALL search products with `size=50`; otherwise it SHALL clear the results. Results SHALL be shown in a floating panel of at most 320 points height with rows whose navigate action is labeled „Auf Karte zeigen“, and SHALL show „Produkte werden gesucht...“ or an empty state with „Probiere einen anderen Suchbegriff oder suche in der Planung über Kategorien.“.

#### Scenario: Customer searches on the map
- **GIVEN** the indoor view is visible
- **WHEN** the customer types „butter“
- **THEN** a product search for „butter“ is sent and results appear above the map

#### Scenario: Customer returns to overview
- **GIVEN** a target product is set
- **WHEN** the customer taps the back button
- **THEN** the store overview is shown and the target product is cleared

### Requirement: Indoor map renders the layout to scale
The indoor map SHALL render the active layout grid at `pixelsPerMeter = max(220, viewWidth − 44) / max(1, gridWidth)`, reduced so the full grid fits inside the visible area with padding 12/22/18/22 points, inside a zoomable scroll view with minimum zoom 0.65 and maximum zoom 2.5. The z-order SHALL be: canvas and grid lines, route line (80), shelves and zones, target marker (110), inactive stop markers (96), active stop marker (120), and user marker (130).

#### Scenario: Wide layout on a narrow phone
- **GIVEN** a 30 m × 12 m layout on a 390-point wide screen
- **WHEN** the map renders
- **THEN** the complete layout width is visible without horizontal scrolling at zoom 1.0

#### Scenario: Customer pinches
- **GIVEN** the map is at zoom 1.0
- **WHEN** the customer pinches beyond 2.5
- **THEN** the zoom stays at 2.5

### Requirement: Layout elements are drawn with zone styling
The indoor map SHALL draw every non-beacon layout element at its `x`, `y`, `width`, and `height` in meters, rotated by `rotation` degrees, colored by a zone palette derived from the element label or category, and titled with the element label WHEN space allows. Beacons and axes SHALL only be drawn WHILE the debug tracking mode is active.

#### Scenario: Rotated shelf
- **GIVEN** a shelf with `rotation: 90`
- **WHEN** the map renders
- **THEN** the shelf is drawn rotated by 90 degrees around its center

#### Scenario: Normal customer mode
- **GIVEN** tracking mode is „Beacon“
- **WHEN** the map renders
- **THEN** beacon icons and coordinate axes are hidden

### Requirement: User marker shows heading only when reliable
The indoor map SHALL draw the user marker at the displayed user position with a 0.5-second ease-in-out position animation, and SHALL rotate the marker arrow by the published heading only WHILE `isUserHeadingReliable` is true; otherwise the arrow SHALL point north on screen.

#### Scenario: Heading is unreliable
- **GIVEN** the compass heading is unavailable or its accuracy is worse than 25 degrees
- **WHEN** the marker is drawn
- **THEN** the arrow is not rotated

### Requirement: Route line is drawn from the navigation route
WHILE the navigation route contains points, the indoor map SHALL draw the route polyline scaled to the map and SHALL display the remaining route length as „Noch ca. <n> m“ or „Noch unter 1 m“, falling back to straight-line distance between user and target WHEN the route has fewer than two points, and SHALL show „Ziel ist auf der Karte markiert“ WHEN no distance is available.

#### Scenario: Route of 12.4 m
- **GIVEN** the route polyline length is 12.4 meters
- **WHEN** the target card is shown
- **THEN** it displays „Noch ca. 12 m“

### Requirement: Target card offers route and planning actions
WHILE a target product is set and no shopping tour is active, the indoor view SHALL show a target card with the product name, the matching shelf title or „Ziel in der Shop-Karte markiert“, the price, a close button that clears the target, the metrics „Gang“ (first layout-code segment) and „Regal“ (second segment, or „-“), a „Route starten“ button, the distance pill, and an „Einplanen“ button that adds the product to the selected list.

#### Scenario: Customer starts the route
- **GIVEN** the target card for „Butter“ is visible
- **WHEN** the customer taps „Route starten“
- **THEN** the route to the matching shelf is calculated and drawn

### Requirement: Tour panel controls the active shopping session
WHILE a shopping session snapshot exists, the indoor view SHALL show the tour panel instead of the target card. The panel SHALL show the current stop title, a preview of up to two item names with „+<n>“, the route-mode button („Optimiert“ or „Listenreihenfolge“), „<n> Stopps · <m> offen“, an „Erledigt“ button, an „Überspringen“ button, and „<n> Artikel nicht im Layout“ WHEN unresolved items exist. WHEN no stop remains, the panel SHALL show „Alle Stopps erledigt!“ with „Einkaufen öffnen“. WHEN a stop is marked done or skipped, the app SHALL request the upsell opportunity `station:<stopId>` with source `shopping_session` and then preload plans for the remaining stops.

#### Scenario: Stop is completed
- **GIVEN** the current stop „Molkerei“ contains two open items
- **WHEN** the customer taps „Erledigt“
- **THEN** both items become done, the next stop becomes the route target, and the upsell opportunity for „Molkerei“ is evaluated

#### Scenario: Route mode toggled
- **GIVEN** route mode is „Optimiert“
- **WHEN** the customer taps the mode button
- **THEN** route mode becomes „Listenreihenfolge“, is persisted, and the stop order is rebuilt

### Requirement: Map tab preloads upsell plans on tour changes
WHILE a shopping session is active, the map tab SHALL call upsell plan preloading with the ordered stops, unresolved items, the active store (active layout store, otherwise detected store), and source `shopping_session` WHEN the tab appears, the active list changes, the current stop changes, the active store changes, or a layout load finishes.

#### Scenario: Layout finishes loading during a tour
- **GIVEN** a tour is active
- **WHEN** the store layout finishes loading
- **THEN** the session is re-synchronized and plan preloading is requested

### Requirement: Settings sheet exposes tracking and map options
The settings sheet SHALL be presented at medium detent with the title „Einstellungen“ and SHALL contain: section „Tracking“ with the picker „Modus“ („Beacon“, „Debug (kein Beacon)“) and the current position as „<x>m / <y>m“ with one decimal; section „Karte“ with „Kartengröße“ as percentage and a slider from 0.65 to 2.5 in steps of 0.05, and the toggle „Tap setzt Ziel“; section „AR“ with „AR Route starten“, disabled WHILE the route has fewer than two points together with the hint „Wähle zuerst ein Ziel, damit eine Route berechnet werden kann.“. WHEN „AR Route starten“ is tapped, the app SHALL dismiss the sheet and present the AR view full screen after 0.35 seconds.

#### Scenario: No route exists
- **GIVEN** no target is set
- **WHEN** the settings sheet is opened
- **THEN** „AR Route starten“ is disabled and the hint is shown

### Requirement: Map taps set target or position only when enabled
WHILE the debug tracking mode is active or „Tap setzt Ziel“ is disabled, the indoor map SHALL accept taps and convert the tap location to meters; IF „Tap setzt Ziel“ is enabled THEN the tap SHALL set the route target, otherwise it SHALL perform a manual position calibration. The map SHALL show the badge „Tippen setzt Ziel“ or „Tippen setzt Position“ WHILE taps are accepted.

#### Scenario: Manual calibration by tap
- **GIVEN** tracking mode is „Beacon“ and „Tap setzt Ziel“ is disabled
- **WHEN** the customer taps at 4.2 m / 7.9 m
- **THEN** the user position is calibrated to the nearest walkable edge near that point

#### Scenario: Customer mode with target taps enabled
- **GIVEN** tracking mode is „Beacon“ and „Tap setzt Ziel“ is enabled
- **WHEN** the customer taps the map
- **THEN** no target or position change happens

