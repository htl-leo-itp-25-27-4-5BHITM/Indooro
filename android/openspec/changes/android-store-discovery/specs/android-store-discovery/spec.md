## ADDED Requirements

### Requirement: Store overview never fabricates locations
The store screen SHALL show active stores with name/address, real-coordinate pins, a separate selectable group without coordinates, loading/error/empty states and refresh.

#### Scenario: Ohne Koordinaten
- **GIVEN** eine Filiale hat null latitude
- **WHEN** die Übersicht lädt
- **THEN** bleibt sie in Ohne Kartenposition auswählbar und es erscheint kein erfundener Pin

#### Scenario: Karte offline
- **GIVEN** Kartenkacheln fehlen, Store-Cache ist vorhanden
- **WHEN** die Übersicht geöffnet wird
- **THEN** bleiben Filialliste und manuelle Auswahl nutzbar

### Requirement: Store selection is a guarded context transition
Manual store selection SHALL invalidate old request generations and SHALL require confirmation before replacing the store of an active tour; lookup failures MUST NOT erase a valid manual context.

#### Scenario: Konflikt
- **GIVEN** eine Tour in A läuft und Beacon B wird erkannt
- **WHEN** der Treffer eintrifft
- **THEN** erscheint ein Wechselangebot; A bleibt bis Bestätigung aktiv

#### Scenario: 404
- **GIVEN** A ist manuell ausgewählt
- **WHEN** ein unbekannter Beacon 404 liefert
- **THEN** bleibt A samt Liste unverändert

### Requirement: Beacon advertisements are parsed by exact identity
The scanner SHALL decode bounded iBeacon manufacturer data into normalized UUID, unsigned major/minor and signed TxPower; invalid packets and RSSI 0/127 SHALL be ignored.

#### Scenario: Parser
- **GIVEN** ein synthetisches Paket mit Major 65535 und TxPower -72 liegt vor
- **WHEN** es gelesen wird
- **THEN** bleiben beide Werte korrekt und UUID normalisiert

#### Scenario: Fremdpaket
- **GIVEN** ein Paket ist zu kurz oder hat falsche Kennung
- **WHEN** es eintrifft
- **THEN** werden weder Store-Lookup noch Pose erzeugt

### Requirement: Detection requests are bounded and revocable
The detector SHALL enforce full-identity in-flight deduplication, the -95 dBm threshold, 15-second failure cooldown and 60-second catalog refresh while active.

#### Scenario: Gleiche UUID
- **GIVEN** zwei Beacons teilen eine UUID mit unterschiedlichen Minor-Werten
- **WHEN** beide stark genug gemessen werden
- **THEN** werden getrennte Identitäten ausgewertet statt einander dauerhaft zu unterdrücken

#### Scenario: Katalog leer
- **GIVEN** der gültige Katalog war befüllt
- **WHEN** ein erfolgreicher Refresh eine leere Liste liefert
- **THEN** werden entfernte Identitäten nicht weiter als autorisierte Store-Beacons verwendet

### Requirement: Unavailable scanning preserves manual use
Denied permission, disabled Bluetooth, unsupported BLE or scanner failure SHALL stop scanning and offer manual store selection without blocking planning.

#### Scenario: Bluetooth aus
- **GIVEN** Bluetooth wird während Erkennung deaktiviert
- **WHEN** der Adapterzustand wechselt
- **THEN** endet Scanning und Filialauswahl bleibt bedienbar
