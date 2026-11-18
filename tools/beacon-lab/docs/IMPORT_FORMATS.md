# Importformate und Validierung

Der Import (`src/data/import.ts`, `validate.ts`) liest Messdateien in drei Formaten. Leitsatz: **Rohdaten werden nie
stillschweigend „repariert“.** Jede Umwandlung steht in `provenance.transformations`, jede verworfene Zeile in
`provenance.issues` (deutsche Meldung, bis zu 5 Beispiel-Zeilennummern). Mehrdeutigkeit blockiert den Import.

Alle Beispieldateien liegen in `samples/` (siehe `samples/README.md`) und sind **synthetisch**.

## 1. Formate

### a) CSV (Langformat)

Eine RSSI-Messung pro Zeile. Kopfzeile Pflicht. Trennzeichen wird automatisch erkannt (`;`, Tabulator oder `,`; bei
Gleichstand in dieser Reihenfolge). RFC 4180: Felder in `"…"`, `""` als Anführungszeichen, CRLF/LF/CR, UTF‑8‑BOM wird
entfernt. Leere Zeilen werden übersprungen.

| Zielfeld | Pflicht | Bedeutung | Erkannte Spaltennamen (ohne Groß-/Kleinschreibung, `_`/`-`/Leerzeichen egal) |
|---|---|---|---|
| `t` | ja | Zeitstempel | t, timestamp, time, zeit, ts, zeitstempel, zeitpunkt, datetime |
| `beaconId` | ja | Beacon-Kennung | beacon, beaconid, beacon_id, beaconname, name, id |
| `rssi` | ja | Signalstärke in dBm | rssi, signal, dbm, signalstaerke, signalstrength |
| `deviceId` | nein | Empfangsgerät | device, deviceid, geraet (Gerät), geraeteid |
| `refX` | nein | Referenz-x (Layout-Einheiten) | refx, x_ref, truth_x, x_m, referenzx, x |
| `refY` | nein | Referenz-y (Layout-Einheiten) | refy, y_ref, truth_y, y_m, referenzy, y |
| `refLabel` | nein | Marker/Bezeichnung des Referenzpunkts | reflabel, marker, label, markierung |
| `runName` | nein | Laufname (Vorschlag, siehe unten) | runname, run, lauf, laufname, messlauf |
| `kind` | nein | `stationary`/`walk` (auch stationär, statisch, stehen, gehen) | kind, runkind, laufart, lauftyp |

Jede Quellspalte wird höchstens einem Zielfeld zugeordnet. Ist die Zuordnung falsch oder unvollständig, liefert
`prepareImport` `requiredMissing`; die Oberfläche lässt den Nutzer die Zuordnung ändern und ruft `runImport` mit
`mapping` auf.

**Referenzen im Langformat:** Stehen `refX` **und** `refY` in einer Zeile, ist das die Referenzposition zum Zeitpunkt `t`.
Identische Wiederholungen (gleiche Zeit und Position auf mehreren Beacon-Zeilen) werden zu **einem** Referenzpunkt
zusammengefasst (als Transformation vermerkt). Für Haltephasen gilt das Protokoll der iOS-App: ein Referenzpunkt am
Anfang und einer am Ende der Haltephase mit gleicher Position.

**Dezimalkomma:** Wird **nie** stillschweigend umgewandelt.

* Trennzeichen `;`: Werte wie `-72,5` oder `12,5` in den Zahlfeldern (`t`, `rssi`, `refX`, `refY`) werden in Dezimalpunkte
  umgewandelt. Das erscheint als Hinweis `decimal-comma-converted` (Info) **und** in den Transformationen.
* Jedes andere Trennzeichen: Die Werte bleiben ungültig, der Import ist blockiert (`decimal-comma-unconverted`),
  weil die Umwandlung mehrdeutig wäre. Lösung: mit Semikolon exportieren oder Dezimalpunkte verwenden.
* Tausendertrennzeichen (`1.234,5`) werden nicht interpretiert → ungültig.
* Das Unicode-Minuszeichen `−` (U+2212) wird zu `-` normalisiert und als Transformation vermerkt.

### b) JSON

Zwei Varianten, beide mit derselben Spaltenzuordnung/Synonymliste wie CSV (Schlüssel = „Spalten“):

1. **Array von Zeilen-Objekten**: `[ { "t": 0, "beaconId": "A", "rssi": -70, "refX": 1, "refY": 2 }, … ]`
2. **Indooro Lab JSON** (auch das eigene Export-Format):

```json
{
  "format": "indooro-lab-json",
  "origin": "synthetic",
  "runName": "…", "kind": "stationary", "deviceId": "…",
  "samples":    [ { "t": 0.0, "beaconId": "LAB-B01", "rssi": -72, "deviceId": "…", "source": "…" } ],
  "references": [ { "t": 0.0, "x": 10, "y": 5.5, "label": "P1" } ]
}
```

Referenzen dürfen als `x`/`y`, `refX`/`refY` oder `position: {x, y}` angegeben sein. Optional ein Wrapper `{ "run": {…} }`.
`origin`, `runName`, `kind` erscheinen als Vorschläge in `ImportOutcome.suggested`. Ein **Kampagnen-Bundle**
(`schema: indooro-positioning-lab/campaign-bundle`) ist keine Messdatei und wird mit `wrong-file-kind` abgelehnt – es
wird über `parseCampaignBundle` geladen.

### c) Indooro-Aufzeichnung (JSON Lines)

Das **echte Format der iOS-App** (`NavigationRecorder.swift` / `NavigationReplay.swift`). Eine JSON-Zeile pro Eintrag,
Zeitstempel `t` = Epoch-Sekunden (Fließkomma). Erkennung: Endung `.jsonl`/`.ndjson` oder erste Zeile ist ein Objekt mit
bekanntem `type`.

| `type` | Felder | Behandlung |
|---|---|---|
| `measurement` | `t`, `source` (`rssi`\|`ranging`), `beacon`, `rssi` (Int), optional `accuracy`, `proximity`, `txPower` | → RSSI-Messwert (`beaconId = beacon`). **RSSI 0 = „unbekannt“ (CoreLocation) → Zeile verworfen + Hinweis**, nie übernommen. |
| `truth` | `t`, `x`, `y` (Layout-Einheiten, Langdruck auf der Karte) | → Referenzpunkt |
| `layout` | `t`, `revision`, optional `layoutId`, `shopName` | nur Metadaten (`ImportOutcome.layoutInfo`) |
| `scan` | `t`, `major`, `minor`, `rssi` | **kein Messwert** (iBeacon ohne Layout-Zuordnung); gezählt als Info `unmatched-ibeacon` mit den Major-Minor-Paaren |
| `step`, `heading`, `event` | – | ignoriert, gezählt als Info `ignored-lines` |
| anderes | – | ignoriert, Info `unknown-line-type` |

Genauigkeit/Nähe (`accuracy`, `proximity`) werden nicht übernommen; die Rohwerte stehen weiter in der Quelldatei
(SHA‑256 in der Provenienz).

## 2. Zeitformate

Pro Datei gilt **ein** Format (Messwerte und Referenzen gemeinsam). Automatische Erkennung je Zelle:

| Erkannt als | Regel | Umwandlung |
|---|---|---|
| Epoch-Millisekunden | Zahl, Betrag > 1·10¹¹ | ÷ 1000 → Sekunden (Transformation) |
| Epoch-Sekunden | Zahl 1·10⁸ … 1·10¹¹ | keine |
| relative Sekunden | Zahl < 1·10⁸ | keine; Info `relative-time` (kein absoluter Zeitbezug), Warnung `possible-milliseconds` bei unplausiblen Abständen |
| ISO‑8601 | `2026-10-19T10:00:00Z`, `…+02:00`, `2026-10-19 10:00:01`, nur Datum | → Epoch-Sekunden (Transformation). **Ohne Zeitzone wird UTC angenommen** und das als Transformation vermerkt. |

* **Gemischte Formate in einer Datei blockieren den Import** (`mixed-time-formats`), auch „relativ + Epoch“.
* Die Option `timeFormat` (`auto` | `epoch-s` | `epoch-ms` | `iso`) erzwingt ein Format; passt eine Zelle nicht, wird die
  Zeile verworfen. Relative Millisekunden sind nicht erkennbar – bei Bedarf `epoch-ms` erzwingen oder vorher umrechnen.

## 3. Prüfregeln und Hinweis-Codes

Schweregrade: **error** blockiert den Import (`ImportOutcome.ok = false`), **warning** = Daten bleiben/werden zeilenweise
verworfen, aber Nutzer muss es sehen, **info** = Hinweis.

### Import (`runImport`)

| Code | Schwere | Bedeutung / Folge |
|---|---|---|
| `empty-file` | error | Datei leer / keine Kopfzeile |
| `missing-column` | error | Pflichtfeld (`t`, `beaconId`, `rssi`) nicht zugeordnet |
| `unknown-column` | error | zugeordnete Spalte existiert nicht |
| `json-parse-error` | error | JSON nicht lesbar |
| `json-shape` | error | JSON hat nicht die erwartete Struktur |
| `wrong-file-kind` | error | Kampagnen-Bundle statt Messdatei |
| `mixed-time-formats` | error | Zeitspalte mischt Formate |
| `decimal-comma-unconverted` | error | Dezimalkomma bei Trennzeichen ≠ `;` – keine Umwandlung |
| `no-valid-samples` | error | nach dem Verwerfen ist keine gültige Messzeile übrig |
| `missing-value` | warning | Zeit, Beacon oder RSSI leer → Zeile verworfen |
| `invalid-timestamp` | warning | Zeitstempel nicht lesbar → Zeile verworfen |
| `rssi-not-numeric` | warning | RSSI kein Zahlenwert → Zeile verworfen |
| `rssi-out-of-range` | warning | RSSI außerhalb −110…−1 dBm (0, positive Werte) → Zeile verworfen |
| `reference-invalid` | warning | Referenzpunkt ohne gültige Zeit/Position → verworfen |
| `ragged-row` | warning | Zeile hat andere Spaltenzahl als Kopfzeile |
| `jsonl-parse-error` | warning | JSONL-Zeile kein gültiges JSON-Objekt → verworfen |
| `json-non-object-rows` | warning | Array-Einträge sind keine Objekte → verworfen |
| `multiple-runs-in-file` / `mixed-run-kinds` | warning | Datei enthält mehrere Läufe/Arten; es entsteht EIN Lauf – vorher aufteilen |
| `layout-changed` | warning | mehrere unterschiedliche `layout`-Zeilen in der Aufzeichnung |
| `many-rows-rejected` | warning | mehr als 20 % der Messzeilen verworfen |
| `reference-unsorted` | warning | Referenzen waren unsortiert (sortiert, Transformation) |
| `decimal-comma-converted` | info | Dezimalkomma → Punkt (nur bei `;`) |
| `relative-time` | info | Zeit als relative Sekunden gelesen |
| `possible-milliseconds` | warning | Relative Zeitstempel unplausibel (Median-Abstand je Beacon ≥ 50 s oder Dauer > 10⁵ s) – vermutlich Millisekunden. **Keine** automatische Umrechnung. |
| `many-duplicates` | warning | Mehr als 5 % exakte Duplikate entfernt – bei grober Zeitauflösung können das echte Pakete sein |
| `synthetic-origin-column` | warning | Spalte `origin` kennzeichnet Zeilen als synthetisch (z. B. re-importierter Lab-Export) → Lauf wird als SYNTHETISCH vorgeschlagen |
| `unmatched-ibeacon` | info | `scan`-Zeilen (Major‑Minor ohne Layout-Zuordnung) nicht übernommen |
| `ignored-lines` / `unknown-line-type` | info | `step`/`heading`/`event` bzw. unbekannte Zeilentypen ignoriert |

### Validierung (`validateSamples`, `validateReferences`, `assessRunQuality`)

| Code | Schwere | Bedeutung |
|---|---|---|
| `invalid-timestamp`, `rssi-not-finite`, `missing-beacon-id` | error | fehlende/NaN-Zeit, nicht-numerischer RSSI, fehlende Beacon-ID |
| `rssi-out-of-range` | error | RSSI außerhalb −110…−1 dBm (bei bereits gespeicherten Läufen) |
| `unknown-beacon` | warning | Beacon-ID nicht in der Kampagne; Zeilen bleiben, `unknownBeaconIds` listet sie |
| `duplicate-rows` | warning | exakte Duplikate (gleiche Zeit, Beacon, RSSI, Gerät) |
| `unsorted-timestamps` | warning | Zeit nicht aufsteigend |
| `large-gap` | warning | Lücke pro Beacon > 10 s **und** > 10× typischer Abstand |
| `few-samples` | warning | weniger als 30 Messwerte |
| `no-samples` | error | keine Messwerte |
| `no-references` | warning | „keine Ground Truth – Fehlermetriken nicht berechenbar“ |
| `reference-out-of-bounds` | error | Referenz außerhalb des Grundrisses (0…Breite × 0…Höhe) |
| `reference-invalid` | error | Referenz ohne gültige Zeit/Position |
| `few-references` | warning | nur ein Referenzpunkt (Haltephase braucht Start und Ende) |
| `beacon-never-heard` | info | aktivierter Kampagnen-Beacon wurde nie gehört |

`assessRunQuality(...).evaluable` ist `false` bei: keine Messwerte, keine Ground Truth, Kalibrierungslauf
(Datenleck-Schutz), kein Messwert eines bekannten Beacons, irgendeinem Fehler oder < 30 Messwerten; `reasons` nennt die Gründe.

### Layout (`floorPlanFromIndooroLayout`)

`layout-invalid` (error), `unknown-element-type` (info, Typ → `other`), `element-invalid`, `beacon-without-id`,
`duplicate-beacon-id`, `no-beacons`, `missing-grid-size` (warning), `scale-unconfirmed` (info – immer).

### Kampagnen-Bundle (`parseCampaignBundle`)

Fehlercodes `bundle-json`, `bundle-shape`, `bundle-schema`, `bundle-version`, `bundle-campaign`, `bundle-floorplan`,
`bundle-beacons`, `bundle-pathloss`, `bundle-runs`, `bundle-run`, `bundle-sample`, `bundle-sample-range`,
`bundle-reference`. Bei einem Fehler wird kein Bundle zurückgegeben.

## 4. Transformationen, die passieren dürfen

Ausschließlich diese, jeweils mit Eintrag in `provenance.transformations` (inkl. Anzahl):

1. Trennzeichen automatisch erkannt (CSV).
2. Dezimalkomma → Dezimalpunkt (nur bei `;`).
3. Unicode-Minus → ASCII-Minus.
4. Zeit: Millisekunden → Sekunden; ISO‑8601 → Epoch-Sekunden (ohne Zone: UTC angenommen).
5. Verwerfen ungültiger Zeilen (Anzahl; Details unter Hinweisen).
6. Stabiles Sortieren nach Zeit, falls unsortiert (Messwerte, Referenzen).
7. Entfernen **exakter** Duplikate (erstes Vorkommen bleibt; Anzahl).
8. Zusammenfassen identischer Referenz-Wiederholungen im Langformat.

Nicht passiert: Glättung, Ausreißerentfernung, Auffüllen fehlender Werte, Umrechnen von RSSI, Zuordnen unbekannter Beacons.
Filter wirken später auf **Kopien**; `samples` bleiben unverändert.

## 5. Was einen Import blockiert

Fehlende Pflichtspalten · unlesbare/unpassende Datei · gemischte Zeitformate · Dezimalkomma bei Trennzeichen ≠ `;` ·
keine einzige gültige Messzeile. Einzelne ungültige Zeilen blockieren nicht, sie werden verworfen und gemeldet.
Referenzen außerhalb des Grundrisses (Kampagnen-Kontext, `validateReferences`) sind ein Fehler und verhindern die Bewertung.

## 6. Koordinaten und Einheiten

* Positionen (`refX`, `refY`, `truth`) sind **Layout-Einheiten** (Rasterzellen), Ursprung links oben, y wächst nach unten.
* Meter gibt es nur mit bestätigtem Maßstab (`FloorPlan.scale.confirmed`); sonst werden Fehler in „LE“ angezeigt.
* `acceptedRows` zählt Zeilen, die einen Messwert oder Referenzpunkt ergeben haben (vor Duplikat-Entfernung);
  `rejectedRows` die verworfenen. Ignorierte Zeilen (`scan`, `event`, …) zählen weder zu den akzeptierten noch zu den verworfenen Zeilen.
* `ImportProvenance.sha256` ist der SHA‑256 der Datei (als Text). `sourceRow` verweist auf Zeile (CSV/JSONL) bzw. Eintrag (JSON).


### Kalenderprüfung bei ISO-8601

Unmögliche Daten oder Uhrzeiten (z. B. `2024-02-31`, `24:00`) gelten als ungültiger Zeitstempel und werden mit Zeilennummer gemeldet.
Sie werden nicht wie bei `Date.parse` stillschweigend auf den Folgetag verschoben.

## Indooro-Aufzeichnung Version 2 (`indooro-recording/2`)

Format: siehe `docs/IOS_INTEGRATION_SPEC.md`, Abschnitt 3. Der Lab liest zusätzlich:

| Zeile / Feld | Verhalten im Lab |
| --- | --- |
| `session` | Gerät (`deviceModel · os`) → Messgerät der Messreihe. `role` → vorgeschlagene Rolle. `scenario` → vorgeschlagene Laufart (S1 → stationär, S2–S4 → Gehversuch). Alle Vorschläge lassen sich vor der Übernahme ändern. Info `recording-session` |
| `truth.marker` | Label des Referenzpunkts (`M1`…`M999`). Ungültige Namen: Warnung `invalid-marker`, Position bleibt erhalten |
| `sync` | gezählt, Info `sync-markers`, keine Messwerte |
| mehrere `session` | Warnung `multiple-sessions`, nur die erste gilt |
| `schema` ≠ `indooro-recording/2` | Warnung `unknown-recording-schema` |

Aufnahmen ohne `session` (Version 1) importieren unverändert.
