# Navigation Baseline

Gemessen mit `swift test` (`BaselineDefectTests`) vor jeder Verhaltensaenderung.

- Basis-Commit: `d372414` (Branch `codex/stabilize-ios-navigation`)
- Datum: 2026-10-15
- Layout: `layout-demosupermarkt.json` (Raster 40 x 60) plus Test-Beacon-Raster
- Zufall: SplitMix64, feste Seeds. MapMatcher-Sprungwerte und Routenform-Anzahl haengen
  zusaetzlich von Tie-Breaks in Graph/A* (Hash-Reihenfolge) ab und schwanken zwischen
  Laeufen (12 Laeufe: Sprungverschiebung 0 bis 2 m, Routenformen 4 bis 8); die Tabelle zeigt den haeufigsten Wert
- Quelle der Defekte: `docs/NAVIGATION_REVIEW.md` C.1-C.13

Die Tests bestehen heute, weil sie den Defekt behaupten. Sie werden in den Tasks
6.10 (PoseFusion, MapMatcher), 8.6 (Routenform) und 9.10 (Nearest-Neighbour) invertiert.

| Kennzahl | Wert |
| --- | --- |
| `mapmatcher.aisleChange.snappedY_m` | 55.500 |
| `mapmatcher.heading.leftSnapsHorizontal` | 0.000 |
| `mapmatcher.heading.rightSnapsHorizontal` | 1.000 |
| `mapmatcher.jump20m.snappedShiftX_m` | 0.000 |
| `mapmatcher.jump2m.snappedShiftX_m` | 0.000 |
| `mapmatcher.jump4m.snappedShiftX_m` | 0.000 |
| `mapmatcher.jump8m.snappedShiftX_m` | 0.000 |
| `posefusion.lag10s_1.2mps_conf0.7.noPredict_m` | 5.676 |
| `posefusion.lag10s_1.2mps_conf0.7.predict20Hz_m` | 0.828 |
| `posefusion.lag20s_1.3mps_conf0.2_m` | 12.099 |
| `posefusion.lag20s_1.3mps_conf0.5_m` | 8.942 |
| `posefusion.lag20s_1.3mps_conf1.0_m` | 5.942 |
| `posefusion.stationary27s_sigma1.path.noPredict_m` | 8.182 |
| `posefusion.stationary27s_sigma1.path.predict20Hz_m` | 38.122 |
| `posefusion.stationary27s_sigma1.path.ratio` | 4.659 |
| `routing.distinctEdgeSequencesFor40Starts` | 4.000 (Bereich 4-8) |
| `routing.nearestNeighbour.distinctFirstStops` | 2.000 |

## Nach den Gruppen 5-6 (Messschicht, Schaetzer, Projektion)

Gemessen mit `swift test` (`PoseEstimatorTests`, `WalkableProjectorTests`; Ausgabe `AFTER56 key=value`).
Gleiche Szenarien wie oben, Tick 0.35 s, exakte Messpunkte beim Lag-Test, Seed 42 beim Stand-Test.
Alle Schaetzer-Werte sind provisional (Spec-Defaults, Kalibrierung in Gruppe 12).

| Kennzahl | Baseline | Nach 5-6 |
| --- | --- | --- |
| Lag 20 s, 1.3 m/s, Konfidenz 1.0 | 5.942 m | 0.534 m |
| Lag 20 s, 1.3 m/s, Konfidenz 0.5 | 8.942 m | 0.967 m |
| Lag 20 s, 1.3 m/s, Konfidenz 0.2 | 12.099 m | 0.816 m (Sprung-Gate greift, siehe unten) |
| Lag 10 s, 1.2 m/s, Konfidenz 0.7 (ohne Prediction) | 5.676 m | 0.697 m |
| Pfadlaenge im Stand 27 s, sigma 1 m (Rohpunkte) | - | 128.634 m |
| Pfadlaenge im Stand 27 s, sigma 1 m (Schaetzwert) | 8.182 m ohne / 38.122 m mit 20-Hz-Prediction | 23.716 m (keine Prediction, kein Mehrfach-Update je Tick) |
| Bestaetigter 20-m-Sprung, projizierte Verschiebung x | 0.000 m (MapMatcher haengt am alten Segment) | 20.000 m |
| Gangwechsel durch Regal, projiziertes y (Zielgang y = 59.5) | 55.500 m (alter Gang) | 59.500 m |
| Links gehen, Abweichung von der horizontalen Gangmitte | Kante hing von der Blickrichtung ab | 0.000 m |

Hinweise:

- Der Stand-Pfad liegt ueber dem Baseline-Wert ohne Prediction (8.2 m), weil alpha jetzt 0.376 statt 0.22 betraegt
  (Konfidenz 0.7); gegenueber den Rohpunkten wird der Jitter um 82 % reduziert, und die 20-Hz-Verstaerkung (38 m) entfaellt.
  Ob 0.46/0.18 im Stand zu unruhig sind, entscheidet die Kalibrierung (Task 12.4).
- Bei Konfidenz 0.2 und 1.3 m/s liegt der stationaere Lag (v * dt * (1 - a) / a, ca. 1.5 m) plus ein Tick Weg ueber dem Gate
  (2.5 * 0.35 + 0.85 = 1.725 m). Folgepunkte werden gehalten und nach drei Bestaetigungen uebernommen (Sagezahn); der gemessene
  Lag ist dort kleiner, die Anzeige springt aber periodisch. Kandidat fuer die Kalibrierung (maxPlausibleSpeed / jumpMargin).
