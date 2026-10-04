## ADDED Requirements

### Requirement: AR is optional and permission gated
AR SHALL start only after support/install/camera checks and a valid route; unsupported, declined or unavailable cases MUST preserve 2D navigation.

#### Scenario: Nicht unterstützt
- **GIVEN** das Gerät unterstützt ARCore nicht
- **WHEN** AR gewählt wird
- **THEN** steht eine verständliche Nicht-verfügbar-Meldung mit Zur Karte bereit

#### Scenario: Kamera verweigert
- **GIVEN** der Benutzer lehnt Kamera ab
- **WHEN** AR starten angefordert wird
- **THEN** bleiben Karte und Tour unverändert nutzbar

### Requirement: Alignment requires explicit spatial evidence
AR markers MUST remain hidden until tracking, floor and map alignment are valid; arbitrary zero yaw SHALL NOT be treated as confirmed orientation.

#### Scenario: Unkalibriert
- **GIVEN** Tracking läuft, Map-Ausrichtung fehlt
- **WHEN** der AR-Frame gerendert wird
- **THEN** erscheint Kalibrieren statt räumlich geratener Pfeile

### Requirement: AR renders the same route with bounded preview
The AR renderer SHALL preserve route geometry, use the reference sampling/preview/pool bounds and stop at the next decision point.

#### Scenario: Kurve
- **GIVEN** eine L-Route hat einen nahen Entscheidungspunkt
- **WHEN** die Vorschau aufgebaut wird
- **THEN** endet sie dort, enthält höchstens drei Waypoints und schneidet die Ecke nicht ab

### Requirement: Tracking loss cannot leave misleading arrows
Tracking loss, low radio confidence, missing floor or stale alignment SHALL hide or clearly suppress guidance, offer recalibration and keep a 2D exit.

#### Scenario: Trackingverlust
- **GIVEN** Pfeile waren ausgerichtet
- **WHEN** ARCore PAUSED oder Funk low confidence meldet
- **THEN** verschwinden verlässliche Richtungspfeile und der Status erklärt die Ursache

### Requirement: Camera lifecycle is local and bounded
AR SHALL release camera/session resources when no longer visible, reacquire alignment after restart and never upload camera frames or anchors.

#### Scenario: Appwechsel
- **GIVEN** AR ist aktiv
- **WHEN** die App in Hintergrund geht und zurückkehrt
- **THEN** wird die Kamera freigegeben und Führung erst nach neuer Gültigkeitsprüfung angezeigt
