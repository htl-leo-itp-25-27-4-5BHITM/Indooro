## ADDED Requirements

### Requirement: Only fresh configured anchors establish trust
The positioning engine MUST use exact configured beacon identities and SHALL require at least three usable fresh anchors for a trusted radio pose.

#### Scenario: Zwei Anker
- **GIVEN** eine zuvor gute Position existiert
- **WHEN** nur zwei Anker jünger als zwei Sekunden sind
- **THEN** wird der Marker unsicher und keine vertrauenswürdige Funkposition veröffentlicht

#### Scenario: Fremdanker
- **GIVEN** ein starker Beacon fehlt im aktiven Layout
- **WHEN** er eintrifft
- **THEN** beeinflusst er die Positionslösung nicht

### Requirement: Radio filtering has reproducible timing
The engine SHALL window RSSI, reject sentinels, filter distance and solve bounded positions using monotonic timestamps and an injectable configuration.

#### Scenario: Stale
- **GIVEN** die Wallclock wird zurückgestellt
- **WHEN** zwei monotone Sekunden ohne Probe verstreichen
- **THEN** wird der Anker trotzdem stale

#### Scenario: Ausreißer
- **GIVEN** ein Fenster enthält einen extremen Ausreißer
- **WHEN** es gefiltert wird
- **THEN** bleibt die Lösung innerhalb der Layoutgrenzen und entspricht dem versionierten Replay-Erwartungsbereich

### Requirement: Confidence controls presentation and calibration
Low confidence SHALL freeze automatic rerouting, expose an uncertainty indicator and a Position setzen action; manual calibration SHALL reset fusion/matching/display and snap to a walkable point.

#### Scenario: Kalibrieren
- **GIVEN** der Marker ist unsicher
- **WHEN** ein gültiger Kartenpunkt bestätigt wird
- **THEN** wird die manuelle Position sichtbar, der aktuelle Zielpfad neu berechnet und der Modus als manuell gekennzeichnet

### Requirement: Displayed motion suppresses unconfirmed jumps
The display filter SHALL use the documented interval, staleness, speed and jump confirmation thresholds while keeping underlying routing state separate.

#### Scenario: Einzelsprung
- **GIVEN** ein einzelner Kandidat liegt unplausibel weit entfernt
- **WHEN** danach normale Proben eintreffen
- **THEN** springt der sichtbare Marker nicht zu diesem Kandidaten

### Requirement: Sensor absence and lifecycle are explicit
Missing heading sensors, permission loss or background transition SHALL stop the relevant acquisition and invalidate pose freshness; resuming SHALL restart warmup without inventing motion.

#### Scenario: Hintergrund
- **GIVEN** die Tour läuft
- **WHEN** die App nicht mehr sichtbar ist
- **THEN** enden Sensor-/Scanarbeit und bei Rückkehr ist keine alte Pose trusted

#### Scenario: Kein Kompass
- **GIVEN** kein brauchbarer Heading-Sensor existiert
- **WHEN** eine BLE-Position berechnet wird
- **THEN** bleibt Positionsführung verfügbar und ein unzuverlässiger Richtungspfeil wird nicht gezeigt
