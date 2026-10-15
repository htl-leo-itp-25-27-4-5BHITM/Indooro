# Navigation Baseline

Gemessen mit `swift test` (`BaselineDefectTests`) vor jeder Verhaltensaenderung.

- Basis-Commit: `d372414` (Branch `codex/stabilize-ios-navigation`)
- Datum: 2026-10-15
- Layout: `layout-demosupermarkt.json` (Raster 40 x 60) plus Test-Beacon-Raster
- Zufall: SplitMix64, feste Seeds. MapMatcher-Sprungwerte und Routenform-Anzahl haengen
  zusaetzlich von Tie-Breaks in Graph/A* (Hash-Reihenfolge) ab und schwanken zwischen
  Laeufen (12 Laeufe: Sprungverschiebung 0 bis 2 m, Routenformen 4 bis 8); die Tabelle zeigt den haeufigsten Wert
- Quelle der Defekte: `docs/NAVIGATION_REVIEW.md` C.1-C.13

Die Tests bestanden zum Messzeitpunkt, weil sie den Defekt behaupteten. Sie wurden in den Tasks
6.10 (PoseFusion, MapMatcher), 8.6 (Routenform) und 9.10 (Nearest-Neighbour) invertiert; `BaselineDefectTests.swift` existiert nicht mehr.

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

## Nach den Gruppen 7-8 (Routing, Navigations-Session)

Gemessen mit `swift test` (`RoutingTests`, `NavigationSessionTests`; Ausgabe `AFTER78 key=value`), Debug-Build.

| Kennzahl | Baseline | Nach 7-8 |
| --- | --- | --- |
| Verschiedene Kantenfolgen fuer 40 Starts innerhalb +-0.4 m (Zellmitte, ein Startknoten) | 4 (Bereich 4-8, Startpunkt an der Zellecke) | 1 |
| Verschiedene Kantenfolgen je Startknoten, Starts an der Zellecke (4 Startknoten) | - | 1 je Startknoten |
| A* auf `layout-demosupermarkt` (40 x 60), 50 Routen quer durch den Laden | Linearsuche im offenen Set (nicht gemessen) | ca. 4.9 ms je Route (Debug, M-Serie) |
| Neu gebaute Routen bei 60 s Rauschen im Stand zwischen zwei gleich weit entfernten Stopps | Route und Stopp wechselten je Positionsupdate | 0 (aktiver Stopp bleibt) |
| Neu gebaute Routen bei 3.5 s Aufenthalt in falscher Gasse (> 4 m) | Cooldown 20 s, 6 s Hold, 8 m | genau 1 (Hold 2.5 s) |
| Nearest-Neighbour-Test (`routing.nearestNeighbour.distinctFirstStops`) | 2 | 2 (wird in Gruppe 9 invertiert) |

Hinweise:

- Der Baseline-Test startete bei (20, 8), einer Zellecke: vier Startknoten sind moeglich, daher zaehlte er 4 Formen. Die Zielvorgabe
  „identisch nach dem ersten Knoten“ gilt je Startknoten (ein Start im selben Knoten ergibt immer dieselbe Kantenfolge).
  Der invertierte Test prueft deshalb an einer Zellmitte (1 Form) und an der Zellecke je Startknoten (1 Form).
- Abbiegestrafe 1.5 m, Off-Route 4.0 m / 2.5 s, Backtrack 3.0 m, Konfidenz 0.35/0.55 sind provisional (Kalibrierung Gruppe 12).

## Nach den Gruppen 9-10 (Tourenplanung, Karten-UI)

Gemessen mit `swift test` (`TourPlannerTests`; Ausgabe `AFTER910 key=value`), Debug-Build, M-Serie.
Stichprobe: 10 Touren mit je 25 zufaelligen Stopps im Demo-Layout (40 x 60), Start (20.5, 8.5), Seeds 500-509.

| Kennzahl | Baseline | Nach 9-10 |
| --- | --- | --- |
| Erster Stopp kippt bei Jitter <= 0.85 m um den Startpunkt (`routing.nearestNeighbour.distinctFirstStops`) | 2 | entfaellt: geplant wird nur bei Ereignissen; 100 Jitter-Updates aendern Plan und aktiven Stopp nie (0 Planwechsel) |
| Mittlere Pfadlaenge Nearest Neighbor, 25 Stopps | - | 271.8 m |
| Mittlere Pfadlaenge Nearest Neighbor + 2-opt, 25 Stopps | - | 251.3 m (-7.6 %) |
| Planungszeit 25 Stopps (Distanzmatrix + NN + 2-opt, Maximum aus 10 Laeufen) | A* je Vergleich (~25^2/2 Routen a ~4.9 ms) | 55.8 ms |

Hinweise:

- Die Planungszeit ist ein Debug-Wert und fast vollstaendig Dijkstra (26 Laeufe ueber den Graphen); sie faellt nur bei Planungsereignissen an.
- 2-opt-Parameter (Mindestgewinn 0.01 m, 50 Durchgaenge) sind provisional.
