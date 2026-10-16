## ADDED Requirements

### Requirement: Shelf location is described in customer words
The target card and the tour panel SHALL describe the location of a product with the label of the matched shelf element as primary text and, WHEN the `fach` and `reihe` segments of the product's `layoutCode` are numeric, with the detail „<fach>. Boden von unten · Position <reihe>“. WHEN the matched shelf has no label, the primary text SHALL be „Regal <meter>“. Customer-facing views SHALL NOT display the category code segment of `layoutCode`. WHEN no shelf matches, the card SHALL show „Nicht im Testbereich – bitte Personal fragen“.

#### Scenario: Labeled shelf
- **GIVEN** a product with layoutCode `800/1/3/2` and a matching shelf labeled „Gang 4 · links · Backzutaten“
- **WHEN** the target card is shown
- **THEN** it shows „Gang 4 · links · Backzutaten“ and „3. Boden von unten · Position 2“ and does not show „800“

#### Scenario: Shelf without label
- **GIVEN** a product with layoutCode `310/2/1/1` and a matching shelf without label
- **WHEN** the target card is shown
- **THEN** it shows „Regal 2“ and „1. Boden von unten · Position 1“

#### Scenario: No matching shelf
- **GIVEN** a product whose layoutCode matches no shelf in the active layout
- **WHEN** the customer selects it
- **THEN** the card shows „Nicht im Testbereich – bitte Personal fragen“ and no route is drawn

### Requirement: Customer can set the position with „Ich bin hier“
The indoor map SHALL offer an „Ich bin hier“ action WHILE a store layout is shown. Activating it SHALL show the hint „Tippe auf deinen Standort“, and the next tap on the map SHALL set the manual position at the nearest walkable point regardless of the „Tippen setzt Ziel“ setting, then end the one-shot mode. The tour panel SHALL show „Route ab Eingang“ or „Route ab <Stopp>“ WHILE the route starts from a fallback origin.

#### Scenario: Correcting the position
- **GIVEN** „Tippen setzt Ziel“ is on and the route starts at the entrance
- **WHEN** the customer taps „Ich bin hier“ and then taps a point in aisle 5
- **THEN** the manual position is set to the nearest walkable point in aisle 5, the route is rebuilt from there, and the next map tap sets a target again

#### Scenario: Fallback origin is visible
- **GIVEN** no trusted position and a completed stop „Kaffee“
- **WHEN** the tour panel is shown
- **THEN** it contains „Route ab Kaffee“
