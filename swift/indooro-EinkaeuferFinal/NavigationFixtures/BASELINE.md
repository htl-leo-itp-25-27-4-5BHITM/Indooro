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
