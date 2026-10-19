# Beacon-Planer (`scripts/beacon-planner/`)

**Planungshilfe, keine Messung.** Der Planer schlägt aus einem Layout vor, wie viele Beacons ein Pilotbereich braucht und wo sie hängen sollen. Er rechnet mit einem einfachen Radiusmodell (kein Funkmodell, keine Dämpfung durch Regale, optional ein pauschaler Abschlag je Regal auf der Sichtlinie). Ob die Abdeckung im Markt wirklich reicht, entscheidet die Feldmessung.

## Aufruf

macOS / Linux:

```bash
python3 -I scripts/beacon-planner/plan.py swift/indooro-EinkaeuferFinal/indooroApp/Resources/layout-demosupermarkt.json --out plan-out
```

Windows (PowerShell):

```powershell
python -I scripts\beacon-planner\plan.py swift\indooro-EinkaeuferFinal\indooroApp\Resources\layout-demosupermarkt.json --out plan-out
```

Nur Python 3.10+ und die Standardbibliothek. Wichtige Optionen: `--radius`, `--k`, `--target` (Default 0.95), `--hdop` (Default 2.5), `--max-beacons` (Default 200), `--exclude-keyword`, `--shelf-penalty`, `--no-entrance-edge`, `--no-checkout`, `--rule`.

Exitcodes: `0` Ziel erreicht, `2` Ziel mit der Höchstzahl nicht erreichbar (Dateien werden trotzdem geschrieben), `1` Eingabefehler, `3` Fehler in der Abdeckungsregel.

Ausgabe in `--out`:

| Datei | Inhalt |
|---|---|
| `beacons-plan.csv` | `minor,x_m,y_m,mount,notes`, ein Beacon je Zeile. Minors beginnen nach dem größten vorhandenen Minor des Layouts (ohne Beacons ab 1). |
| `coverage.svg` | Karte im Browser öffnen: begehbare Zellen nach Anzahl Beacons in Reichweite eingefärbt, Beacons nummeriert, Eingang markiert, Maßstabsbalken. |
| `layout-with-beacons.json` | Kopie des Layouts mit den neuen Beacon-Elementen (Platzhalter-UUID `00000000-0000-0000-0000-000000000000`, `beaconId` `Indooro<minor>`). Die Eingabedatei wird nie verändert. |

Gleiche Eingabe und gleiche Parameter geben byte-identische Dateien.

## Gemeinsame Abdeckungsregel

Radius, Mindestanzahl und erlaubter Anteil unterversorgter Zellen stehen **nur** in `backend/indooro_server/src/main/resources/readiness/coverage-rule.json`. Die Store-Readiness-Prüfung (`CoverageRule` → `StoreReadinessEvaluator`) und der Planer lesen dieselbe Datei:

Die Werte oben in der Datei sind das Profil `market` (Standard jeder Filiale). Unter `profiles` können benannte Profile einzelne Werte überschreiben, z. B. `testroom` mit Radius 10 m für einen leeren Testraum. Die Store-Readiness nutzt das Profil der Filiale (Admin: Store bearbeiten, „Abdeckungsprofil“) und zeigt Profil, Regel und den berechneten Anteil an. Der Planer und das Editor-Overlay nutzen weiter nur `market`.

| Wert | Default | Bedeutung |
|---|---|---|
| `radiusMeters` | 8.0 | Beacon deckt eine Zelle (Mittelpunkt), wenn sie höchstens so weit entfernt ist |
| `minBeaconsPerCell` | 3 | so viele Beacons braucht eine Zelle |
| `maxLowCoverageShare` | 0.05 | Readiness warnt, wenn mehr als dieser Anteil der begehbaren Zellen weniger Beacons hat |
| `minRadiusMeters` / `maxRadiusMeters` | 0.5 / 30 | erlaubter Bereich für den `radius`-Parameter der Readiness-API |

Die endgültigen Werte entscheidet das Team (US-31). Zum Ändern nur diese JSON-Datei anpassen; beide Werkzeuge übernehmen sie beim nächsten Start. Der Planer prüft jeden Plan zusätzlich mit einem Python-Spiegel der Java-Rechnung (`coverage.readiness_report`) und plant weiter, bis diese Prüfung „OK“ liefert. Die Parität ist getestet: der Spiegel liefert dieselben Zahlen wie `StoreReadinessEvaluatorTest` (20 × 20 m, 9 Beacons: 136 von 400 Zellen unter k bei 8 m, 8 von 400 bei 10 m).

Zusätzlich verlangt der Planer (strenger als die Readiness) eine Geometrie-Grenze: HDOP ≤ 2.5 der Beacons in Reichweite. Das gilt nur im Planer.

## Teamentscheidungen mit Defaults (US-31 offen)

1. **Kassen-Oberkanten als Montageort** sind Default zulässig (`--no-checkout` schließt sie aus). Ohne sie bleibt die Kassenzone unter 3 Beacons und der Demo-Markt erreicht nur 90,4 % (Readiness WARN 7,5 %). Die Spec-Szene „Demo-Markt erreicht 95 %“ verlangt die Zulassung.
2. **Rasterrand auf der Grenze des Eingangs** ist als Wandmontage neben der Tür zulässig (`--no-entrance-edge` schließt ihn aus). Das Innere des Eingangsbereichs ist immer ausgeschlossen. Kühl-Elemente (Stichworte `kühl`, `tiefkühl`, `fridge`) sind ausgeschlossen.
3. Bestehende Beacon-Elemente der Eingabe werden bei der Planung ignoriert (der Planer rechnet ab null); ihre Minors werden nicht neu vergeben.

## Ergebnisse (Defaults: R 8 m, k 3, HDOP ≤ 2.5, Ziel 95 %)

| Layout | Größe | Beacons | Abdeckung (iOS-begehbare Zellen) | Readiness-Spiegel |
|---|---|---|---|---|
| `layout-demosupermarkt.json` | 40 × 60 m, 1509 begehbare Zellen | **73** | 95,0 % (69 Zellen unter k) | OK (4,6 % unter k) |
| `layout-demosupermarkt.json`, `--no-checkout` | wie oben | Höchstzahl 200 erreicht | 90,4 % | WARN (7,5 %), Exit 2 |
| `layout-demosupermarkt.json`, `--no-checkout --no-entrance-edge` | wie oben | Höchstzahl 200 erreicht | 84,5 % | WARN (12,1 %), Exit 2 |
| `layout.json` (Testraum) | 4 × 7 m, 18 begehbare Zellen | **3** (Minors 5–7) | 100 % | OK (0,0 %) |

Dateien: `docs/pilot-readiness/hardware/planner/demosupermarkt/{beacons-plan.csv,coverage.svg}`, `docs/pilot-readiness/hardware/planner/testraum/{beacons-plan.csv,coverage.svg,layout-with-beacons.json}`. Hinweis zum Testraum: Das Layout hat keinen Eingang (die Readiness-Prüfung verlangt genau einen) und enthält schon vier Beacons; der Planer weist darauf hin.

## Vergleich mit dem 8 × 8-m-Raster der Synthetik-Tests

`python3 -I scripts/beacon-planner/compare_grid.py <layout.json>` setzt die Beacons wie `TestLayouts` (ein Beacon je 8 × 8-m-Zelle, in der Zellmitte) und bewertet sie mit derselben Regel.

| Layout | Raster 8 × 8 | Planer |
|---|---|---|
| Demo-Markt | 40 Beacons, 65,2 % ok-Zellen, Readiness **WARN** (34,8 % unter k) | 73 Beacons, 95,0 %, Readiness OK |
| Testraum | 1 Beacon, 0 % ok, Readiness WARN | 3 Beacons, 100 %, Readiness OK |

Unterschied: Das Raster hat je Zelle genau einen Beacon, die Regel verlangt aber drei in 8 m Reichweite und eine brauchbare Geometrie. Die Synthetik-Tests (`NavigationReplayTests` u. a.) arbeiten mit dem Raster, weil sie Solver und Filter prüfen, nicht die Abdeckungsregel. Für den Markt bedeutet das: etwa doppelt so viele Beacons wie das Raster, und die Zahl hängt stark von der Regel ab (mit Radius 10 m statt 8 m in `coverage-rule.json` braucht der Demo-Markt nur 42 statt 73 Beacons, Abdeckung 95,0 %, Readiness OK mit 3,6 % unter k). Bevor Beacons bestellt werden, sollte das Team US-31 (Radius, k, Anteil) entscheiden und den Planer erneut laufen lassen.

## Grenzen

- Radiusmodell, keine Funkausbreitung. Hinter Metallregalen ist die echte Reichweite kleiner; `--shelf-penalty` (Default 0 = aus) rechnet einen pauschalen Abschlag je gekreuztem Regal ein.
- Greedy-Auswahl mit Aufräumschritt, nicht optimal; für einige Dutzend Beacons ausreichend.
- Begehbarkeit wie der iOS-Graph (inkl. gedrehter Elemente). Die Java-Readiness blockiert Anker-Elemente (`anchor`) und gedrehte Elemente über die Bounding-Box; der Spiegel bildet das genau so ab. Bei Layouts mit Ankern können die zwei Zellmengen deshalb leicht abweichen; der Planer deckt die Vereinigung beider ab.
- Die Montagehöhe und die Sendeleistung (Tx-Power) sind nicht Teil des Modells.

## Tests

```bash
python3 -I -m unittest discover scripts/beacon-planner
```
