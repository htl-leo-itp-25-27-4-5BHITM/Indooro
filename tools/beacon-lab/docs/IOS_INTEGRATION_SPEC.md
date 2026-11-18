# Integrationsspezifikation: iOS-Messdaten → Positioning Lab

Status: **Format festgelegt (v2)**. Die App-Umsetzung erfolgt in einem separaten PR; dieses Dokument selbst verändert die App nicht. Es beschreibt, was die App heute schon liefert,
was der Lab direkt importieren kann und welche additiven Erweiterungen eine spätere, separate Änderung bringen sollte.
Die Umsetzung sollte über eine eigene OpenSpec-Change laufen (`openspec/changes/…`), nicht über diesen Branch.

## 1. Ist-Zustand (geprüft im Repository)

| Aspekt | Stand | Quelle |
| --- | --- | --- |
| Aufzeichnung | JSON Lines nach `Documents/NavigationRecordings/<ISO>.jsonl` | `indooroApp/Utilities/NavigationRecorder.swift` |
| Build-Typ | **Nur DEBUG-Builds** (`#if DEBUG`), Release enthält keinen Recorder | `NavigationRecorder.swift:1` |
| Zeilentypen | `measurement`, `truth`, `layout`, `scan`, `step`, `heading`, `event` | `NavigationReplay.swift` (`NavigationRecordLine`) |
| `measurement` | `t` (Epoch-s), `source` (`rssi` / `ranging`), `beacon` (Layout-`beaconId`), `rssi` (Int), `accuracy?`, `proximity?`, `txPower?` | `NavigationReplay.swift:37` |
| Ground Truth | `truth` {t, x, y} durch langes Drücken (0,6 s) auf die Karte, Layout-Einheiten | `NavigationRecorder.swift` (`recordTruth`), `MEASUREMENT_PROTOCOL.md` |
| Nicht zugeordnete iBeacons | `scan` {major, minor, rssi}, gedrosselt auf 1/s je Beacon | `recordUnmatchedBeacon` |
| Layout-Bezug | `layout` {layoutId?, revision, shopName?} – nur Metadaten, keine Geometrie | `recordLayout` |
| Gerätekennung | **keine** (bewusst, wegen Anonymisierung, siehe `scripts/field/check_recording_anonymized.py`) | – |
| Bestehende Auswertung | `scripts/field/*` (Python, Replay über `swift test`) | `scripts/field/README.md` |

**Der Lab importiert dieses Format direkt** (Format `indooro-jsonl`, siehe `IMPORT_FORMATS.md`).
Die Beacon-Positionen kommen aus dem Layout-JSON (`scripts/field/fetch_layout.py` oder Admin-Export), das im Lab
als Grundriss importiert wird. `measurement.beacon` muss dem `beaconId` im Layout entsprechen.

## 2. Bekannte Lücken für belastbare Auswertungen

1. **Keine Lauf-Metadaten.** Gerätemodell, iOS-Version, Szenario (S1–S4), Rolle (Kalibrierung/Evaluation) und
   Marker-Namen stehen nicht in der Datei. Der Lab fragt sie beim Import ab; sie gehen aber nicht aus der Datei hervor.
2. **Ground Truth durch Antippen.** Die Genauigkeit der Referenz hängt am Kartenmaßstab und an der Treffsicherheit
   beim Antippen. Ein Marker-Name (z. B. `M3`) würde die Zuordnung zur vermessenen Marker-Koordinate eindeutig machen.
3. **Gemischte Quellen.** `ranging`-Werte (CoreLocation, etwa 1 Hz, bereits geglättet) und `rssi`-Werte
   (CoreBluetooth-Advertisements) haben eine unterschiedliche Statistik. Der Lab behält `source` pro Sample,
   Analysen sollten sie getrennt betrachten.
4. **Measured Power wird nicht ausgelesen.** Byte 24 des iBeacon-Frames (kalibrierte Sendeleistung bei 1 m) wird nicht
   geparst; `txPower` ist meist leer. Für die Kalibrierung reicht die Lab-Kalibrierung (Fit aus Standzeiten).
5. **Nur DEBUG.** Feldmessungen mit TestFlight-/Release-Builds zeichnen nichts auf.
6. **Keine Uhrensynchronisation** zu externen Referenzen (z. B. Video). Für Gehversuche mit Video-Ground-Truth wäre
   ein Sync-Event nötig.

## 3. Format `indooro-recording/2` (verbindlich für App und Lab)

Additiv und abwärtskompatibel: alte Aufnahmen (ohne `session`) bleiben gültig. Neue Zeilentypen erfordern die
Anpassung von `NavigationRecordLine` (der Decoder wirft heute bei unbekanntem `type`) und des Anonymisierungs-Prüfers
`scripts/field/check_recording_anonymized.py` (strikte Feld-Allowlist).

### 3.1 `session` – genau eine, erste Zeile nach Start der Aufnahme
```json
{"type":"session","t":1792000000.0,"schema":"indooro-recording/2","app":"1.4.0 (123)",
 "deviceModel":"iPhone15,3","os":"iOS 18.1","scenario":"S1","role":"evaluation"}
```
| Feld | Typ | Regel |
| --- | --- | --- |
| `schema` | String | immer `indooro-recording/2` |
| `app` | String | `CFBundleShortVersionString (CFBundleVersion)`, max. 32 Zeichen |
| `deviceModel` | String | Hardware-Modellkennung (`utsname.machine`, z. B. `iPhone15,3`) – **keine** Geräte-ID, kein Gerätename |
| `os` | String | `iOS <Version>` |
| `scenario` | optional | `S1` · `S2` · `S3` · `S4` (Messprotokoll) |
| `role` | optional | `calibration` · `evaluation` |

Keine Freitextfelder (Anonymisierung).

### 3.2 `truth` mit optionalem Marker
```json
{"type":"truth","t":1792000004.9,"x":11.0,"y":5.0,"marker":"M3"}
```
`marker` erfüllt `^M[0-9]{1,3}$`. Die App setzt den aktuell in den Einstellungen gewählten Marker. Ohne Auswahl entfällt das Feld.

### 3.3 `sync`
```json
{"type":"sync","t":1792000100.0,"label":"sync-1"}
```
`label` erfüllt `^sync-[0-9]{1,4}$` (fortlaufend je Aufnahme). Dient der zeitlichen Zuordnung externer Referenzen.

### 3.4 Lab-Verhalten
- `session.role` und `session.scenario` werden beim Import als Vorschlag übernommen (Rolle, Laufart: S1 → stationär,
  S2–S4 → Gehversuch), `deviceModel`/`os`/`app` als Gerät in der Provenienz.
- `truth.marker` wird zum Label des Referenzpunkts.
- `sync`-Zeilen werden gezählt und als Info gemeldet (keine Samples).
- Measured Power (Byte 24) ist **nicht** Teil von Version 2 (CoreBluetooth liefert iBeacon-Frames auf iOS
  vermutlich nicht, siehe Review C.7) und bleibt offen.

## 4. Abnahmekriterien für die spätere iOS-Change

- Eine Aufnahme mit allen neuen Zeilen importiert im Lab ohne Fehler; `session.role` setzt die Laufrolle vor.
- `scripts/field/check_recording_anonymized.py` meldet keine Verstöße.
- `swift test` (`FieldExportTests`, `NavigationReplay`) bleibt grün; alte Aufnahmen sind weiterhin lesbar.
- Optional: Recorder in einem internen TestFlight-Build per Schalter verfügbar (Entscheidung des Teams, Datenschutz prüfen).
