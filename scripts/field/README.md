# Auswertungsskripte Feldmessung (`scripts/field/`)

Python 3, nur Standardbibliothek. Alle Aufrufe aus dem Repo-Wurzelverzeichnis mit `python -I`.
Grundlage: `docs/pilot-readiness/hardware/MEASUREMENT_PROTOCOL.md`, Abschnitt 7.

## Dateien

| Datei | Zweck | Task |
| --- | --- | --- |
| `check_recording_anonymized.py` | Prueft Aufnahmen (JSON Lines) auf Geraete-, Personen- und Freitext-Kennungen | 4.5 |
| `anonymize_recording.py` | Entfernt `shopName` und ersetzt Stopp-Titel durch `stop-<id>` | 4.5 |
| `import_recordings.py` | Anonymisiert, prueft und uebernimmt Aufnahmen nach `NavigationFixtures/recordings/` | 4.5, 5.2 |
| `field_stats.py` | Positionsfehler je Marker, Gang-Anteil, Reroutes, Stoppwechsel, Replay-Tabelle | 4.4 |
| `analyze_walk.sh` / `analyze_walk.py` | Eine Aufnahme in einem Befehl: anonymisieren, Replay, Statistik, Report | 5.1, 5.2 |
| `walk_report.py` | Hoerbare Beacons je Position, Spruenge, fremde iBeacons (Baustein von `analyze_walk`) | 5.2 |
| `fetch_layout.py` | Aktives Layout eines Marktes lesend holen (zwei GET-Aufrufe) | 5.1 |
| `compare_positioning.sh` / `compare_positioning.py` | Eine Aufnahme durch die aktuelle App-Pipeline **und** die `PositioningEngine` spielen und vergleichen | #195 |
| `positioning_verdict.py` | Wendet die Entscheidungsregel `POSITIONING_DECISION.md` auf mehrere Vergleiche an | #195 |
| `make_synthetic_walk.py` | Erzeugt die synthetische Probe-Aufnahme `NavigationFixtures/synthetic/` (keine Messung) | 5.1 |

Tests: `python -I -m unittest discover scripts/field`

## Eine Aufnahme in einem Befehl (Feldtag)

```text
python -I scripts/field/fetch_layout.py --store SPAR-Leonding-002 --out swift/indooro-EinkaeuferFinal/NavigationFixtures/layouts/spar-leonding-002.json
scripts/field/analyze_walk.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/<datei>.jsonl \
  --layout swift/indooro-EinkaeuferFinal/NavigationFixtures/layouts/spar-leonding-002.json \
  [--markers docs/pilot-readiness/hardware/sites/testraum.md] [--site testraum] [--out REPORT.md]
```

- Ohne Dateiargument gilt die neueste `*.jsonl` in `NavigationFixtures/incoming/`. Das Original bleibt unveraendert.
- Ablauf: anonymisierte Kopie und Pruefung (bei Verstoss Exit 1, kein Replay) -> `swift test --filter FieldExportTests/testFieldReplayOfSingleRecording`
  (unveraenderte App-Pipeline, Standardkonfiguration) -> `field_stats.py` -> Report.
- Ausgabe in `NavigationFixtures/exports/` (gitignored): `<name>.anon.jsonl`, `<name>-ticks.csv`, `<name>-replay.txt`, `<name>-report.md`.
  Der Report folgt `hardware/reports/0000-synthetic-baseline.md` (Replay-Zeile) und ergaenzt Spruenge, Fehler je Marker und hoerbare Beacons je Position.
- Layout: `--layout`, sonst `sites/layout-<site>.json`, `Tests/.../Resources/layout-<site>.json`, `NavigationFixtures/layouts/<site>.json`.
  Akzeptiert auch die Antwort von `layout/current` (mit `layout`-Schluessel).
- Dateien, deren Name mit `synthetic-` beginnt, bekommen im Report den Kasten SYNTHETISCH. Alle anderen gelten als Feldaufnahme.
- Exit 0 Report geschrieben, 1 Anonymisierung oder Replay fehlgeschlagen, 2 Aufruf- oder Eingabefehler (fehlendes Layout, Datei).
- Der Gang-Anteil braucht eine Gang-Tabelle in der Standort-Datei; Layouts aus dem Backend haben keine Elemente vom Typ `aisle`.
- `scan`-Zeilen (iBeacons ohne Layout-Treffer) listet der Report; der Replay ignoriert sie.

## Zwei Pipelines vergleichen (aktuelle Pipeline gegen PositioningEngine)

Beantwortet, ob die neue Positionsberechnung (`PositioningEngine`, Flag aus) auf derselben Aufnahme dasselbe oder etwas anderes zeigt als
die App. Nichts wird eingeschaltet, nichts ans Backend geschrieben. Regel für die Entscheidung: `docs/pilot-readiness/hardware/POSITIONING_DECISION.md`.

```text
scripts/field/compare_positioning.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/<datei>.jsonl --store SPAR-Leonding-002
scripts/field/compare_positioning.sh <datei>.jsonl --layout <layout.json> [--warmup SEKUNDEN] [--work-dir DIR]
python -I scripts/field/positioning_verdict.py swift/indooro-EinkaeuferFinal/NavigationFixtures/exports/*-comparison.json
```

- Ohne Dateiargument gilt die neueste `*.jsonl` in `NavigationFixtures/incoming/`. Das Original bleibt unverändert; ausgewertet wird eine anonymisierte, geprüfte Kopie (wie bei `analyze_walk.sh`).
- Layout: `--layout`, sonst mit `--store` die Datei `NavigationFixtures/layouts/<storeCode klein>.json`. Fehlt sie, wird das Layout **lesend** geholt (zwei GET-Aufrufe, `fetch_layout.py`); `--refresh-layout` holt es neu. Ohne beides sucht das Skript wie `analyze_walk.sh` (synthetische Aufnahmen finden ihr Layout daneben).
- Ablauf: Anonymisierung und Prüfung -> `swift run compare-positioning` (im Ordner `swift/indooro-EinkaeuferFinal`, baut beim ersten Mal einige Minuten) -> Kurzfassung auf der Standardausgabe.
- Beide Wege bekommen dieselben Samples, dieselbe virtuelle Uhr (Tick 0,35 s ab der ersten Zeile), dieselbe Aufwärmphase und dasselbe Layout. Die Kennzahlen (Median, P90, P95, Anteil ≤ 2/3/5 m, Ausfallrate, Sprungrate) folgen `tools/beacon-lab/docs/METRICS.md`.
- Ausgabe in `NavigationFixtures/exports/` (gitignored): `<name>-comparison.csv` (eine Zeile je Tick mit Wahrheit und beiden Wegen), `<name>-comparison.json` (Schema `indooro-position-comparison/1`, vom Lab lesbar: `docs/IMPORT_FORMATS.md`), `<name>-comparison.txt` (Kurzfassung), `<name>-current-ticks.csv` und `<name>-engine-ticks.csv` (Format von `NavigationReplay.csv`, lesbar für `field_stats.py`).
- Dateien, deren Name mit `synthetic-` beginnt, tragen in jeder Ausgabe die Kennzeichnung SYNTHETISCH. Diese Zahlen nie zitieren.
- **Grenze:** Beide Wege nutzen dieselbe `PositioningPipeline`. Der Vergleich zeigt, ob die Engine sie gleich aufruft, nicht wie die Funkschicht der Engine sich im Feld verhält.
- Exit 0 fertig, 1 Anonymisierung oder Vergleich fehlgeschlagen, 2 Aufruf- oder Eingabefehler (Datei, Layout, Markt-Code), 3 keine Epoche mit Referenz (keine Wahrheitsmarken; die Positionen sind geschrieben, Kennzahlen fehlen).
- Direkter Aufruf ohne Wrapper: `cd swift/indooro-EinkaeuferFinal && swift run compare-positioning <datei>.jsonl --layout <layout.json> [--out DIR] [--name NAME] [--warmup S]`. Ohne `--out` wird nichts geschrieben.

## Import und Anonymisierungspruefung

```text
python -I scripts/field/import_recordings.py --site testraum --date 2026-10-20 --move
```

- Liest alle `*.jsonl` aus `swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/` (sortiert).
- Schreibt akzeptierte Dateien als `testraum-2026-10-20-<n>.jsonl` nach `.../recordings/`.
  `n` laeuft ab der hoechsten vorhandenen Nummer fuer dieselbe Standort- und Datumskombination.
- Vorhandene Dateien werden nie ueberschrieben. Abgelehnte Dateien werden nie geschrieben und nie verschoben.
- Ohne `--move` bleibt das Original erhalten. Mit `--move` wird es nach dem Schreiben entfernt.
- `--dry-run` zeigt nur, was passieren wuerde.
- Exit 1, wenn eine Datei abgelehnt wurde. Exit 2 bei Aufrufsfehlern.
- Eigene Ordner: `--incoming DIR` und `--recordings DIR`.

Einzelne Datei pruefen oder anonymisieren:

```text
python -I scripts/field/check_recording_anonymized.py aufnahme.jsonl
python -I scripts/field/check_recording_anonymized.py --allow-uuid 1234ABCD-... aufnahme.jsonl
python -I scripts/field/anonymize_recording.py roh.jsonl anonym.jsonl
```

Format `indooro-recording/2`: Die Pruefung akzeptiert zusaetzlich `session` (Schema, App, Hardware-Modell, iOS-Version, optional Szenario/Rolle), `sync` (`label` = `sync-<n>`) und das optionale Feld `marker` (`M<n>`) in `truth`. Alle drei haben feste Muster und keinen Freitext; `session` mit weiteren Feldern wird abgelehnt. Die Analyse-Skripte ignorieren `session` und `sync`.

- `--allow-uuid` erlaubt zusaetzliche Beacon-UUIDs. Standardmaessig erlaubt ist die Projekt-UUID aus `BEACON_STANDARD.md`.
- `--allow-free-text` erlaubt `shopName` und Stopp-Titel. Fuer Import und Anonymisierung nicht noetig.
- Exit 1 bei Verstoessen, Ausgabe `<datei>:<zeile>: <grund>`. Exit 2, wenn eine Datei nicht lesbar ist.
- `anonymize_recording.py` schreibt die Ausgabe nur, wenn die Pruefung danach keinen Verstoss meldet.

## Statistik

```text
# 1. Ticks exportieren (im Ordner swift/indooro-EinkaeuferFinal)
FIELD_EXPORT_DIR=/pfad/zu/exports swift test --filter FieldExport

# 2. Statistik (im Repo-Wurzelverzeichnis)
python -I scripts/field/field_stats.py \
  --layout docs/pilot-readiness/hardware/sites/layout-testraum.json \
  --markers docs/pilot-readiness/hardware/sites/testraum.md \
  --ticks /pfad/zu/exports/testraum-1-ticks.csv /pfad/zu/exports/testraum-2-ticks.csv \
  --source est --replay-lines replay.txt --out tabelle.md
```

- `--ticks`: eine oder mehrere `*-ticks.csv`-Dateien. Mehrere Aufnahmen werden zusammen gepoolt.
- `--markers`: Standort-Datei mit Marker-Tabelle (`| Marker | x_m | y_m | Beschreibung |`) und optionaler Gang-Tabelle (`| Gang | x_m | y_m | width_m | height_m |`). Zeilen mit `(Mensch` sind Platzhalter und werden ignoriert.
- `--layout`: Gaenge aus dem Layout-JSON (Elemente mit `type: "aisle"`), nur wenn die Standort-Datei keine Gang-Tabelle hat.
- `--source est|proj`: Positionsquelle, Standard `est`.
- `--min-window SEKUNDEN`: Mindestdauer einer Standzeit, Standard 20.
- `--replay-lines FILE`: Zeilen `REPLAY <name> key=value ...` aus `swift test` als Zusatztabelle.
- `--out FILE.md`: Tabellen in Datei schreiben. Ohne Angabe Ausgabe auf der Standardausgabe.

Berechnung:

- Standzeit-Fenster: Truth-Ticks mit gleicher Koordinate, zeitlich nah beieinander (Start und Ende des Long-Press), mindestens `--min-window` lang. Jedes Fenster wird dem naechsten Marker innerhalb von 0,75 m zugeordnet, sonst als `kein Marker (x / y)` gefuehrt.
- Fehler: Abstand zwischen Schaetzung und Wahrheit (Mittel der Truth-Koordinaten des Fensters) fuer alle Ticks im Fenster.
- Gehzeit: Ticks ausserhalb der Standzeit-Fenster zwischen erstem und letztem Truth-Tick. Die Wahrheit wird zwischen den Gruppenmitten zeitlich interpoliert. Der Anteil zaehlt Ticks mit Schaetzung im selben Gang-Rechteck wie die Wahrheit. Wahrheit ausserhalb aller Gaenge wird ausgeschlossen und separat gezaehlt.
- Reroutes: Ticks mit `route_rebuild = 1`. Stoppwechsel: Ticks mit `stop_change = 1`. Die CSV enthaelt keine Events, deshalb ist die Zuordnung zu Events nicht moeglich.
