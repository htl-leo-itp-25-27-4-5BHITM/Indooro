# Beispieldateien

Alle Dateien hier sind **SYNTHETISCH** (vom Lab-Generator bzw. aus der synthetischen iOS-Test-Fixture) – keine
Messergebnisse. Sie dienen zum Ausprobieren des Imports (Format-Details: `docs/IMPORT_FORMATS.md`) und werden im Test
`src/data/samples.test.ts` automatisch importiert.

| Datei | Format | Gehört zu Layout | Zeigt |
|---|---|---|---|
| `synthetic-example-long-format.csv` | CSV, Semikolon, deutsche Spaltennamen (`Zeit;Beacon;Signal;Gerät;x_ref;y_ref;Marker;Hinweis`) | **fiktiver Demo-Markt** (`demoFloorPlan()`, Beacons `LAB-B01`, `LAB-B05`, `LAB-B08`) | automatische Spaltenzuordnung per Synonymen, Dezimalkomma-Umwandlung (nur wegen `;`, mit Eintrag in den Transformationen), Referenzpositionen (`x_ref`/`y_ref`/`Marker`) auf der ersten und letzten Zeile jeder Haltephase, nicht zugeordnete Spalte `Hinweis` |
| `synthetic-example.json` | Indooro Lab JSON (`samples` + `references`) | **fiktiver Demo-Markt** (gleiche drei Beacons) | getrennte Referenzliste, Metadaten (`origin: "synthetic"`, `runName`, `kind`) als Vorschläge |
| `synthetic-indooro-recording.jsonl` | echte Indooro-Aufzeichnung (JSON Lines, iOS `NavigationRecorder`), erste 200 Zeilen der synthetischen Fixture `synthetic-testraum-2026-10-19-1.jsonl` | **synthetischer Testraum** (`layout-synthetic-testraum.json`, Beacons `Indooro1`–`Indooro4`) | `measurement`, `truth`, `layout` und `scan`-Zeilen (Info „unmatched iBeacon major-minor“ für Major/Minor 7‑99) |
| `layout-synthetic-testraum.json` | Indooro-Layout-JSON | – | Layout zum JSONL-Beispiel; Name enthält „SYNTHETISCH“ → `origin: "synthetic"`. Import über „Grundriss aus Indooro-Layout“ |

Hinweise

* CSV und Lab‑JSON passen zum **Demo-Markt**; wird eine andere Kampagne gewählt, erscheint die Warnung „unbekannte Beacon-IDs“
  (die Zeilen bleiben erhalten, können aber nicht positioniert werden).
* Die Zeitstempel der CSV/JSON sind relative Sekunden, die der Aufzeichnung Epoch-Sekunden (iOS).
* Echte SPAR-Layouts sind bewusst **nicht** enthalten (keine dokumentierte Nutzungserlaubnis).
