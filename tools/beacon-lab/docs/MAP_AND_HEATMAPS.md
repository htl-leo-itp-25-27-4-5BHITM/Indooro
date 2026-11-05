# Karte, Heatmaps und Replay (`src/map`)

Alle Komponenten sind rein darstellend (props-getrieben) und importieren ausschließlich `src/core` und `react`.

## Koordinatensystem

- Ursprung (0,0) oben links, x nach rechts, y nach unten – identisch zum Indooro-Layout-JSON.
- Alle Positionen, Elemente, Beacons und Schätzungen liegen in **Layout-Einheiten (LE)** = Rasterzellen.
- Elemente werden als um den Mittelpunkt gedrehte Rechtecke gezeichnet (Winkel in Grad, im Uhrzeigersinn, wie `IndoorGraph.swift corners()`; `rotatedRectCorners`).
- Die Karte ist ein `<svg viewBox="…">` in LE. Zoom und Verschieben ändern nur die viewBox.
- Screen-Koordinaten werden über die Inverse von `getScreenCTM()` in LE umgerechnet; `meetMatrix` ist die reine Rückfallfunktion (Tests).

## Keine Verzerrung

`preserveAspectRatio="xMidYMid meet"` und eine viewBox mit dem Seitenverhältnis des Containers (`fitViewBox`) garantieren
identische Skalierung in x und y. Marker, Beschriftungen und Linienbreiten haben konstante Bildschirmgröße
(`vector-effect: non-scaling-stroke`, Skalierung mit `1/pxPerUnit`). Zoom: 0,5×–20×, Zoom um den Mauszeiger, Pinch auf Touch.

## Maßstab-Policy

- Meter erscheinen **nur**, wenn `plan.scale.confirmed === true` (`core/units.ts`).
- Sonst zeigt der Maßstabsbalken „LE“ und ein amberfarbener Hinweis „Maßstab nicht bestätigt“; alle Fehler und Distanzen erscheinen in LE.
- Bei `plan.origin === "synthetic"` steht dauerhaft das Badge **SYNTHETISCH** auf der Karte (Replay zeigt es zusätzlich für synthetische Läufe).

## Bedienung der Karte

| Eingabe | Wirkung |
| --- | --- |
| Mausrad über der Karte | Zoom zum Cursor (Seiten-Scroll wird nur dort blockiert) |
| Ziehen / Ein-Finger-Wischen | Verschieben |
| Zwei Finger | Pinch-Zoom |
| Pfeiltasten (Karte fokussiert) | Verschieben |
| `+` / `-` / `0` | Zoomen / Einpassen |
| Hover / Klick auf Marker | Tooltip bzw. angeheftete Detailkarte (Position in LE, in Metern nur bei bestätigtem Maßstab); `onSelect` wird gerufen |

Ebenen (Chips): Raster, Elemente, Beschriftung, Beacons, Referenzpunkte, Schätzungen, Trajektorien, Heatmap, Fehlervektoren.
`layers` ist optional kontrolliert (`layers` + `onLayersChange`), sonst intern verwaltet.

## Overlays

- `ReferenceLayer`: Referenzpunkte (Rauten); aufeinanderfolgende Referenzen an derselben Position werden zu einem stationären Halt (gestrichelter Ring, Dauer) zusammengefasst.
- `EstimateLayer` + `EstimateLegend`: Punkte nach Fehler gefärbt. **Fehlgeschlagene Schätzungen werden nie an einer erfundenen Position gezeichnet**; die Legende nennt ihre Anzahl und die Anzahl der Epochen ohne Referenz (grau).
- `ErrorVectorLayer`: Linie Truth → Schätzung.
- `TrajectoryLayer`: Truth-Pfad (gestrichelt) und Schätz-Pfad (durchgezogen). Linien brechen bei fehlgeschlagenen Epochen und bei Zeitlücken (Standard: 3× Median-Schritt).

## Heatmap

Eingabe sind **gemessene Werte an echten Positionen** (`HeatPoint { position, value, n? }`). Builder (rein, getestet):
`rssiPointsForBeacon`, `errorPointsFromEstimates`, `coveragePoints`, `measurementDensity` (Positionen auf 0,01 LE gerundet, Mittelwert je Position).

| Modus | Darstellung | Interpolation |
| --- | --- | --- |
| `points` (Standard) | Kreise nur an echten Messpositionen, Radius ∝ √n | keine |
| `binned` | Rasterzellen (`cellSize` LE), n-gewichteter Mittelwert; nur Zellen mit Messungen | keine |
| `idw` | Inverse-Distance-Weighting (`idwPower`, Standard 2) auf Zellraster | nur innerhalb `maxDistance` (Standard 3 LE) einer echten Messung |

### Ehrlichkeitsregeln

1. Standardmodus interpoliert nie.
2. Gebiete ohne Daten sind schraffiert und als „keine Daten“ gekennzeichnet (`binned`, `idw`) – nie mit einem Farbwert gefüllt.
3. IDW ist in der Legende explizit als **„INTERPOLIERT (IDW, p=…, max … LE)“** markiert; jenseits `maxDistance` wird nichts berechnet. An Stützstellen ist IDW exakt, Werte bleiben im Wertebereich der Messungen.
4. Echte Messpunkte werden in jedem Modus oben auf der Heatmap gezeichnet.
5. Die Legende nennt Titel, Einheit, min/max und Methode; Farbskalen: `sequential` (viridis-artig, farbenblind-tauglich) für RSSI/Abdeckung/Dichte, `error` (Türkis → Amber → Rot) für Fehler.

Heatmaps gehören in den `underlay`-Slot der Karte (unter den Elementen), die Legende in den `legend`-Slot.

## Replay

`Replay` spielt einen Lauf (`PositionEstimate[]`) ab: Ground Truth (Ring), Schätzung (gefüllt), Fehlerlinie mit aktuellem Fehler, verblassender Schweif (Truth und Schätzung, Standard 8 s), aktive Beacons (letzte 2 s) mit RSSI-Badge, Seitenleiste mit RSSI-Balken.
Fehlgeschlagene Epoche: Hinweis „keine Schätzung: <Grund>“, kein Schätzpunkt.

- Steuerung: Play/Pause, Epoche zurück/vor, Zeitleiste, Geschwindigkeit 0,5×/1×/2×/5×/10×, Zeitanzeige `mm:ss.s` (plus ISO bei Epochenzeit > 1e9).
- Tastatur: **Leertaste** Play/Pause, **←/→** eine Epoche (solange die Karte nicht fokussiert ist – dort verschieben die Pfeiltasten die Ansicht).
- Die Zeitlogik ist rein und getestet (`replayClock.ts`: `advance`, `epochIndexAt`, `stepEpoch`, `latestInWindow`); die Animation läuft über `requestAnimationFrame` mit Wall-Clock-Deltas × Geschwindigkeit.
- Fehler werden in Metern nur bei bestätigtem Maßstab angezeigt, sonst in LE.
