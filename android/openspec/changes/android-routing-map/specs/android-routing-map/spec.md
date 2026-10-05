## ADDED Requirements

### Requirement: Routes remain inside walkable geometry
The graph and rendered route MUST respect rotated blocked footprints and SHALL return unreachable when no collision-free connection exists.

#### Scenario: Gedrehtes Regal
- **GIVEN** ein Regal ist um 45 Grad gedreht
- **WHEN** eine Route daran vorbeiführt
- **THEN** schneidet kein Routensegment dessen belegte Fläche

#### Scenario: Getrennte Bereiche
- **GIVEN** Start und Ziel liegen in getrennten Graphkomponenten
- **WHEN** Route starten gewählt wird
- **THEN** erscheint Nicht erreichbar statt Luftlinie

### Requirement: Shelf approach is explicit
Product routing SHALL choose a reachable adjacent shelf approach and SHALL label the result as shelf vicinity until a root access-side contract is verified.

#### Scenario: Zwei Seiten
- **GIVEN** accessAngle ist fachlich undefiniert
- **WHEN** ein Regalziel gewählt wird
- **THEN** führt die Route zu einem freien Zugang und behauptet keine bestimmte Regalseite

### Requirement: Offroute rerouting uses sustained evidence
Automatic rerouting SHALL use the documented hold/cooldown/progress thresholds and MUST remain frozen during low confidence.

#### Scenario: Kurzabweichung
- **GIVEN** ein Punkt liegt länger als null aber weniger als sechs Sekunden über acht Meter abseits
- **WHEN** die Position zurückkehrt
- **THEN** bleibt die Route unverändert

#### Scenario: Anhaltend
- **GIVEN** gute Konfidenz und alle Cooldown-/Differenzbedingungen bestehen
- **WHEN** die Abweichung mindestens sechs Sekunden anhält
- **THEN** wird höchstens eine neue Route veröffentlicht

### Requirement: Map interaction shares one coordinate transform
Map rendering, tap calibration, target placement and route overlays SHALL share meter-to-screen transforms across zoom, pan and rotation.

#### Scenario: Gezoomter Tap
- **GIVEN** die Karte ist gezoomt und verschoben
- **WHEN** Position setzen auf einen bekannten Punkt erfolgt
- **THEN** entspricht das Ergebnis demselben Meterpunkt wie im ungezoomten Layout

### Requirement: Map exposes complete target and tour controls
The map SHALL provide search, zoom/settings, target details, add-to-list, clear target, tour mode, done/skip and unresolved status, with confidence visible outside AR.

#### Scenario: Ungeklärte Artikel
- **GIVEN** alle routbaren Stopps sind erledigt, zwei freie Einträge offen
- **WHEN** das Panel angezeigt wird
- **THEN** unterscheidet es Stopps erledigt von gesamte Liste erledigt

#### Scenario: Einzelziel
- **GIVEN** ein Produkt ist fokussiert
- **WHEN** Schließen gewählt wird
- **THEN** verschwindet die Zielroute ohne Listenmutation

### Requirement: Routing computation is reusable and bounded
The app SHALL reuse the graph for unchanged layout revisions and compute paths off the UI thread, with deterministic tie breaks.

#### Scenario: Sensorupdates
- **GIVEN** 25 Stopps und unverändertes Layout bestehen
- **WHEN** 100 Pose-Updates eintreffen
- **THEN** wird kein neuer Layoutgraph pro Update gebaut
