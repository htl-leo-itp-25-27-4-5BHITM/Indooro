## MODIFIED Requirements

### Requirement: Route line is drawn from the navigation route
WHILE the active route contains points, the indoor map SHALL draw only the remaining route, from the current route progress point to the destination, scaled to the map, and SHALL display the remaining route length as „Noch ca. <n> m“ or „Noch unter 1 m“, falling back to straight-line distance between the projected position and the target WHEN the route has fewer than two points, and SHALL show „Ziel ist auf der Karte markiert“ WHEN no distance is available. The user marker SHALL animate between consecutive published positions.

#### Scenario: Route of 12.4 m
- **GIVEN** the remaining route length is 12.4 meters
- **WHEN** the target card is shown
- **THEN** it displays „Noch ca. 12 m“

#### Scenario: Customer walks along the route
- **GIVEN** a 30 m route and the customer has progressed 10 m along it
- **WHEN** the map is drawn
- **THEN** the first 10 m of the route are not drawn and the card shows „Noch ca. 20 m“ without a new route being built

### Requirement: Tour panel controls the active shopping session
WHILE a shopping session snapshot exists, the indoor view SHALL show the tour panel instead of the target card. The panel SHALL show the active stop title, a preview of up to two item names with „+<n>“, the route-mode button („Optimiert“ or „Listenreihenfolge“), a „Neu planen“ button, „<n> Stopps · <m> offen“, an „Erledigt“ button, an „Überspringen“ button, and „<n> Artikel nicht im Layout“ WHEN unresolved items exist. WHEN no stop remains, the panel SHALL show „Alle Stopps erledigt!“ with „Einkaufen öffnen“. WHEN a stop is marked done or skipped, the app SHALL request the upsell opportunity `station:<stopId>` with source `shopping_session` and then preload plans for the remaining stops.

#### Scenario: Stop is completed
- **GIVEN** the active stop „Molkerei“ contains two open items
- **WHEN** the customer taps „Erledigt“
- **THEN** both items become done, the next planned stop becomes the route target, and the upsell opportunity for „Molkerei“ is evaluated

#### Scenario: Route mode toggled
- **GIVEN** route mode is „Optimiert“
- **WHEN** the customer taps the mode button
- **THEN** route mode becomes „Listenreihenfolge“, is persisted, and the remaining stops are re-planned

#### Scenario: Re-planning on request
- **GIVEN** a tour is active in optimized mode
- **WHEN** the customer taps „Neu planen“
- **THEN** the remaining stops are re-planned from the current projected position and the route is rebuilt to the new active stop
