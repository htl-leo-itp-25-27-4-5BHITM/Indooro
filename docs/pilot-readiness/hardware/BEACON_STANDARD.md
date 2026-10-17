# Beacon-Standard Indooro

Status: Entwurf (Task 2.1). Gilt für alle Beacons in Testräumen und Pilotmärkten.
Herkunft der Vorgaben: `openspec/changes/establish-pilot-field-measurement/` (design.md, Decisions 1–3; spec `beacon-deployment`).

## 1. Projekt-UUID

| Feld | Wert |
| --- | --- |
| Projekt-UUID (iBeacon) | `B5CAA23B-BB89-4040-99D2-FCED3EA4A62B` |
| Erzeugt | 2026-10-17, mit `uuidgen` |

Die UUID wird **nicht geändert, sobald der erste Beacon konfiguriert ist.**
Die App ordnet Beacons über UUID, Major und Minor dem Layout zu (`BeaconManager.swift:977–1007`).
Eine andere UUID führt dazu, dass Beacons als „passt zu keinem Beacon im aktiven Layout“ gemeldet werden (`BeaconManager.swift:2294–2295`).
Ein Wechsel erfordert eine Entscheidung im Team und eine Neukonfiguration aller Beacons.

Layouts für Messungen dürfen keine Platzhalter-UUID aus Nullen enthalten (spec `beacon-deployment`).

## 2. Major und Minor

| Feld | Bedeutung | Beispiel |
| --- | --- | --- |
| Major | Standortnummer: 1 = Testraum, 2 = großer Testraum, 10 und höher = Märkte | 2 |
| Minor | Beacon-Nummer, auf dem Gerät gedruckt und auf dem Etikett | 3 |

Regeln:

- Minor ist innerhalb eines Standorts eindeutig.
- Empfehlung: Minor über alle Standorte hinweg eindeutig vergeben. Begründung: Die App hat einen Namens-Fallback, der Beacons anhand der letzten Zahl im Namen zuordnet (`BeaconManager.swift:990–1000`, `1646`). Gleiche Endnummern in verschiedenen Standorten können dort falsch zugeordnet werden (design.md, Kontext).
- Die nächste freie Minor steht in `beacons.csv` (Spalte `minor`).

## 3. Sendeleistung und Sendeintervall

| Parameter | Startwert | Status |
| --- | --- | --- |
| TX-Leistung (Einstellung in der Herstellerapp) | So wählen, dass die gemessene Signalstärke in 1 m etwa −72 dBm beträgt | Startwert, Dry-Run bestätigt: **nein** (offen, Mensch: Dry-Run 4.7) |
| Sendeintervall | 500 ms | Startwert, Dry-Run bestätigt: **nein** (offen, Mensch: Dry-Run 4.7) |

Begründung des Zielwerts:

- Der App-Default `defaultTxPowerDBm = −72` (`StabilizedNavigationConfig.swift:21`) ist der Referenzwert des Pfadverlust-Modells: Entfernung = 10^((TX − RSSI) / (10 · n)), mit n = 2,8 (`PositioningPipeline.swift:199–201`, `StabilizedNavigationConfig.swift:20`).
- Der Wert beschreibt die Signalstärke bei 1 m. Er ist nicht identisch mit der Herstellereinstellung in dBm. Die Einstellung in der Herstellerapp wird deshalb im Dry-Run so gewählt, dass die gemessene Signalstärke in 1 m nahe −72 dBm liegt.
- Die Werte sind keine Messergebnisse. Sie bleiben Startwerte bis zur Bestätigung im Dry-Run (Mensch).

## 4. Etikett

- Format: `IND-<major>-<minor>`, zum Beispiel `IND-2-3` (großer Testraum, Beacon 3).
- Das Etikett zeigt Minor und Major (spec: Etikett zeigt den Minor).
- Das Etikett klebt am Gehäuse oder direkt daneben, nicht auf Ware, Verpackung oder Kühlmöbeln.

## 5. Montage

Pflichtregeln:

1. Montage oberhalb der Kopfhöhe, auf Regaloberkanten oder an Säulen.
2. Nicht hinter Ware.
3. Nicht an Kühlmöbeln.
4. Nicht an Fluchtwegschildern oder in Fluchtwegen.
5. Nur kleben oder klemmen, nicht bohren.

Abstände und Abdeckung:

- Abstand zwischen benachbarten Beacons: 6 bis 8 m.
- Die App nutzt Abstände von 0,35 m bis 11 m (`StabilizedNavigationConfig.swift:18–19`). Bei 6 bis 8 m Abstand liegen Nachbarbeacons im Nutzungsbereich.
- An jeder begehbaren Position müssen mindestens 3 Beacons hörbar sein. Die App braucht für eine Lösung mindestens drei Beacons (`StabilizedNavigationConfig.swift:17`, `BeaconPositionSolver.swift:41`).
- Die Abdeckung wird mit dem Planer geplant (`openspec/changes/add-beacon-placement-planner/`, geplant) und im Feld geprüft (`MEASUREMENT_PROTOCOL.md`, Abschnitt 8).

## 6. Konfigurationsdatensatz

Jeder Beacon hat genau eine Zeile in `beacons.csv` (Header und Spaltenbeschreibung unten).

| Spalte | Bedeutung | Format | Beispiel |
| --- | --- | --- | --- |
| `minor` | Beacon-Nummer (Etikett) | Ganzzahl, 0–65535 | `3` |
| `major` | Standortnummer | Ganzzahl, 0–65535 | `2` |
| `site` | Standortkennung, entspricht `sites/<site>.md` | Text ohne Leerzeichen | `testraum` |
| `x_m` | x-Position der Montage in Layout-Metern (1 Zelle = 1 m) | Dezimalzahl, Punkt als Trennzeichen | `12.0` |
| `y_m` | y-Position der Montage in Layout-Metern | Dezimalzahl | `4.5` |
| `height_m` | Montagehöhe über Boden | Dezimalzahl, Meter | `2.1` |
| `mount` | Montageort | `regal-oberkante`, `saeule` oder `wand-oben` (Vorschlag) | `saeule` |
| `tx_power_dbm` | Eingestellte Sendeleistung laut Herstellerapp | Dezimalzahl, dBm | (Mensch: Wert nach Dry-Run eintragen) |
| `interval_ms` | Sendeintervall | Ganzzahl, ms | `500` (Startwert) |
| `battery_date` | Datum der Inbetriebnahme oder des letzten Batteriewechsels | `JJJJ-MM-TT` | (Mensch: Datum eintragen) |
| `notes` | Freitext ohne Personenbezug | Text | (Mensch: z. B. Montageort in Worten) |

Der Spaltenkopf lautet exakt:

```text
minor,major,site,x_m,y_m,height_m,mount,tx_power_dbm,interval_ms,battery_date,notes
```

Die Koordinaten müssen mit der gemessenen Montageposition auf 0,5 m übereinstimmen. Andernfalls werden Datensatz und Layout korrigiert (spec `beacon-deployment`).

## 7. Verweise

- Konfiguration und Prüfung der Identität: `CONFIGURE_BEACON.md`
- Messungen mit den Beacons: `MEASUREMENT_PROTOCOL.md`
- Hardware-Auswahl: `HARDWARE_SELECTION.md` (offen)
