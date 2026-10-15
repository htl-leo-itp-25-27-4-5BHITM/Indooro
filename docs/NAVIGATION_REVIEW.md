# Indooro iOS – Technischer Review: Positionierung, Beacons und Routenstabilität

Stand: 2026-10-15 · Branch `codex/indooro-v2-roughcut` (Commit `c2809a1`) · reiner Review, kein Anwendungscode geändert

Untersuchtes Projekt: `swift/indooro-EinkaeuferFinal` (Xcode-Projekt `MCindooroApp.xcodeproj`).
Im Folgenden steht `APP/` für `swift/indooro-EinkaeuferFinal/indooroApp/`.

Einordnung der Aussagen:

- **[Nachgewiesen]** – direkt aus dem Code ableitbar und, wo vermerkt, mit dem Original-Code in einer Simulation reproduziert.
- **[Wahrscheinlich]** – aus dem Code plausibel, aber Wirkung im Feld nicht gemessen.
- **[Hypothese]** – braucht Laufzeitmessung (Instruments, echte Beacon-Daten, Supermarkt-Test).

---

## A. Executive Summary

1. **Die Route und das nächste Produkt werden bei jedem rohen Positions-Update komplett neu berechnet.** `ContentView` beobachtet `userPosition` *und* `rawUserPosition` und ruft bei jeder Änderung `ShoppingSessionManager.sync` auf. Das führt die Nearest-Neighbor-Optimierung der ganzen Einkaufsliste neu aus und setzt über `setRouteTargetPosition` ein neues A*-Ziel. `rawUserPosition` ist die *ungefilterte* Solver-Ausgabe. Damit wird die gesamte Stabilisierungslogik im `RouteManager` (Off-Route-Hold, Cooldown, Relevanzprüfung) während einer Einkaufssession umgangen. Das ist die direkte Ursache für Problem B und C. **[Nachgewiesen]**
2. **Der MapMatcher kann die angezeigte Position dauerhaft „festkleben“.** Rechnerisch wechselt er nie auf eine nicht benachbarte Kante. Nach einem Sprung ab etwa 2 m oder nach einem Gangwechsel quer durch ein Regal bleibt die gematchte Position im alten Gang, bis eine manuelle Kalibrierung erfolgt. **[Nachgewiesen, simuliert]**
3. **Die Positionsfusion begrenzt die Bewegungsgeschwindigkeit künstlich auf ≤ 0,41 m/s.** Bei normalem Gehtempo läuft die fusionierte Position ohne Prädiktion im eingeschwungenen Zustand rund 6–15 m hinterher. Die 20-Hz-Prädiktion kompensiert das teilweise, vervierfacht aber das Zittern im Stillstand. Zwei Mechanismen arbeiten gegeneinander. **[Nachgewiesen, simuliert]**
4. **Es gibt mindestens zehn hintereinandergeschaltete Glättungs- und Haltemechanismen** mit insgesamt über 40 Schwellwerten, aber keine klare Trennung zwischen „Position für die Anzeige“ und „Position für Entscheidungen“. Fünf verschiedene Positionsbegriffe werden von verschiedenen Konsumenten gemischt gelesen. **[Nachgewiesen]**
5. **Die Git-History zeigt ein klares Muster.** Die Komplexität kam in drei Schüben: `37208b0` („zweite App“, 15.04.), `19ad495` (26.05.) und `1e6b243` (17.06., als „JaCoCo coverage“ falsch beschriftet). Jeder Schub hat Filter verschärft und Schwellen erhöht. Die eigentliche Quelle der Routen- und Zielwechsel (Punkt 1) existiert seit `37208b0` und wurde nie angefasst. Man hat also an den Symptomen gedreht und dabei zusätzlich Trägheit und Lock-Effekte erzeugt.
6. **Warum es früher besser wirkte:** Die März-Version (`1b27187`, `swift/indooroApp`) hatte genau einen Filter (Kalman pro Beacon) und einen gewichteten Top-3-Centroid. Sie setzte `userPosition` direkt und nutzte einen Grid-A* mit Diagonalen und Turn-Penalty, der gerade, formstabile Linien erzeugt. Es gab keinen Matcher, der festkleben kann, keine Geschwindigkeitsbremse und keine Mehrziel-Neuoptimierung pro Update. Sie war nicht „gut“, aber vorhersagbar.

**Kernempfehlung:** Keine neuen Filter. Zuerst drei bis vier gezielte Entfernungen und Korrekturen (Abschnitt G, Stufe 1). Danach eine einzige Navigationssession als alleinigen Besitzer von Reihenfolge, aktivem Ziel und Route. Die Positionspipeline auf zwei Stufen reduzieren: Schätzung plus ein Filter, danach Projektion auf begehbare Fläche.

---

## B. Aktuelle Architektur (tatsächlicher Datenfluss)

### B.1 Beteiligte Komponenten

| Schicht | Datei / Typ | Rolle |
|---|---|---|
| BLE-Eingang 1 | `APP/Managers/BeaconManager.swift` `centralManager(_:didDiscover:…)` → `recordBeaconSample` | CoreBluetooth-Scan, RSSI in `rssiBuffer` (max. 12 Werte) |
| BLE-Eingang 2 | `BeaconManager.locationManager(_:didRange:…)` → `handleRangedIBeacons` | CoreLocation-iBeacon-Ranging (`accuracy`, `proximity`) |
| Takt | `startUpdateTimer` (0,35 s, Main-RunLoop) → `processBufferAndCalculate` | RSSI-Fenster → Distanz |
| Distanz | `processRSSIWindow` (Trimmed Mean → Log-Distance-Modell → `KalmanFilter`) bzw. `stabilizedIBeaconDistance` (Jump-Clamp → `KalmanFilter` → EMA) | Distanz pro Beacon |
| Positionsschätzung | `APP/Utilities/BeaconPositionSolver.swift` | Gauss-Newton-Multilateration mit Huber-Gewichten, Prior aus letzter Lösung |
| Fusion | `APP/Utilities/PoseFusionService.swift` | EMA mit Confidence- und Geschwindigkeitsabhängigkeit, Prädiktion |
| Map-Matching | `APP/Utilities/MapMatcher.swift` auf `APP/Utilities/IndoorGraph.swift` | Snap auf Kante mit Distanz-, Heading-, Kontinuitäts- und Routen-Bias |
| Anzeigefilter | `BeaconManager.filteredDisplayPosition` / `shouldHoldForJumpConfirmation` | EMA, Sprungbestätigung, 1-s-/0,85-m-Gate |
| Route | `APP/Utilities/RouteManager.swift` | A* über `IndoorGraph`, Fortschritts-Lock, Off-Route, Reroute-Gates |
| Zustand | `APP/Utilities/NavigationStateMachine.swift` | Low-Confidence → Route einfrieren, Statusmeldungen |
| Einkaufsliste | `APP/Managers/ShoppingListManager.swift` (`ShoppingStopResolver`, `MultiStopRoutePlanner`, `ShoppingSessionManager`) | Stopps bilden, Nearest-Neighbor-Reihenfolge, aktives Ziel setzen |
| Auslöser UI | `APP/Views/Main/ContentView.swift:116-127`, `StoreMapPage.swift`, `ShoppingFeatureViews.swift:1181` | `onChange` → `sync`, Preview-Berechnung im View-Body |
| Konfiguration | `APP/Utilities/StabilizedNavigationConfig.swift` | 6 Config-Structs, über 40 Parameter |

Alle Callbacks laufen auf dem Main-Thread: `CBCentralManager(queue: nil)`, CLLocationManager-Delegate, `Timer.scheduledTimer`, `motionManager.startDeviceMotionUpdates(to: .main)`. Die Einkaufslisten-Optimierung läuft synchron im `onChange`-Handler, also ebenfalls auf Main.

### B.2 Ablauf von der Messung bis zur UI

```
CoreBluetooth Advertisement ──► rssiBuffer ──(Timer 0,35 s)──► processRSSIWindow ──► Kalman[name] ─┐
CoreLocation didRange (pro Constraint) ──► stabilizedIBeaconDistance ──► Kalman[name] (derselbe!) ─┤
                                                                                                   ▼
                                                beacons[i].distance (@Published, wird pro Beacon gesetzt)
                                                                                                   │
            calculateLocation()  ◄── ausgelöst vom Timer UND von jedem didRange-Callback ──────────┘
                │
                ├─► BeaconPositionSolver.solve(prior = lastSolvedRawPoint)
                ├─► rawUserPosition = estimate.point  (@Published, UNGEFILTERT)  ──► ContentView.onChange ──► sync()
                ├─► NavigationStateMachine.sensorUpdate(confidence)
                └─► processSensorSample
                       ├─► PoseFusionService.update        (EMA, Geschwindigkeitsbremse)
                       ├─► MapMatcher.match(routeBias)      (Kontinuität, Heading)
                       ├─► RouteManager.update              (Progress-Lock, Off-Route, Reroute)
                       ├─► filteredDisplayPosition          (EMA, Sprungbestätigung, 1 s/0,85 m)
                       └─► userPosition (@Published) + navigationRoute     ──► ContentView.onChange ──► sync()

CoreMotion 20 Hz und Kompass-Updates ──► publishPredictedPose
                       ├─► PoseFusionService.predict  (überschreibt lastPose!)
                       ├─► MapMatcher.match           (verändert Matcher-Historie)
                       └─► filteredDisplayPosition    (verändert Anzeigefilter-Zustand) ──► userPosition

ShoppingSessionManager.sync()
   ├─► ShoppingStopResolver.makeSnapshot ──► MultiStopRoutePlanner.order
   │        (baut IndoorGraph neu, Nearest Neighbor mit A*-Kosten ab userPosition ?? rawUserPosition)
   └─► beaconManager.setRouteTargetPosition(currentStop) ──► RouteManager.setDestination
            (neuer A* ab userPosition, Fortschritt zurückgesetzt, KEINE Relevanzprüfung) ──► navigationRoute
```

### B.3 Antworten auf die Leitfragen

| Frage | Antwort (mit Beleg) |
|---|---|
| Woher kommen Positionsupdates? | Zwei Quellen: Timer (2,86 Hz, `BeaconManager.swift:612`) und jeder `didRange`-Callback (`:1228`). Ein Callback kommt pro Ranging-Constraint, also mehrfach pro Sekunde bei mehreren UUID/Major-Gruppen. Dazu kommen Prädiktions-Updates mit 20 Hz (`:1060`) und bei jedem Kompass-Update (`:2620`). |
| Wie oft wird verarbeitet? | Unregelmäßig. Solver ≈ 3–6 Hz, Matcher und Anzeigefilter ≥ 20 Hz. |
| Wie wird eine Position berechnet? | Gauss-Newton-Multilateration mit mindestens 3 Beacons (`BeaconPositionSolver.solve`). Ab 3 Beacons fließen alle ein, nicht nur die nächsten 3. |
| Welche Filter, wo geglättet? | Siehe C.6: zehn Stufen. |
| Wo werden Änderungen verworfen? | Solver (`min/maxDistance`), iBeacon-Jump-Clamp (`stabilizedIBeaconDistance`), Speed-Gate (`PoseFusionService:79-86`), MapMatcher-Kontinuität (`MapMatcher:114-141`), Sprungbestätigung und 1-s-/0,85-m-Gate (`filteredDisplayPosition`). |
| Wo Map-Matching / Projektion? | `MapMatcher.match` (pro Update), `snapToNearestEdge` (nur bei manueller Kalibrierung). |
| Wann neue Route? | (a) `setDestination` bei jedem `sync()`, also bei jedem Positionsupdate in einer Session; (b) `RouteManager.update` bei stabilem Off-Route; (c) manuelle Kalibrierung; (d) Layout-Rebuild. |
| Wann ändert sich die Einkaufsreihenfolge? | Bei jedem `sync()`: Positionsänderung (`userPosition` oder `rawUserPosition`), Listenrevision, Layoutrevision. |
| Wann ändert sich das aktive Produktziel? | Implizit. `currentStop` = erstes Element der *neu* optimierten Reihenfolge (`ShoppingModels.swift:335`). Es gibt keinen gespeicherten aktiven Stopp. |
| Wie wird „Produkt erreicht“ erkannt? | Gar nicht automatisch. Nur über die Buttons „Erledigt“ und „Überspringen“ (`StoreMapPage.swift:529/537` → `advanceCurrentStop`). |
| Welche State-Änderungen lösen Folgeberechnungen aus? | `@Published userPosition` und `rawUserPosition` → `sync` → `setRouteTargetPosition` → `navigationRoute`. `snapshot.currentStop.id` → Upsell-Preload (`StoreMapPage.swift:138`). Jede `BeaconManager`-Änderung (≥ 20 Hz) invalidiert alle beobachtenden Views. `ShoppingFeatureViews.selectedPreview` berechnet dann den Snapshot inklusive Optimierung im View-Body neu. |

**Entscheidungsträger, die unabhängig voneinander Route oder Ziel verändern:**

1. `ShoppingSessionManager.sync` – Ziel und Route, bei jedem Positionsupdate.
2. `RouteManager.update` – Reroute bei Off-Route.
3. `BeaconManager.runManualCalibration` – Reroute.
4. `ContentView.onChange(targetProduct)` und `StoreMapPage.startRouteToTarget` – Einzelziel.
5. `BeaconManager.rebuildNavigationPipeline` – Route bei Layoutwechsel.
6. `NavigationStateMachine` – friert die Route ein oder gibt sie frei. Die Aktion `.triggerReroute` ist ein No-Op (`BeaconManager.swift`, `applyStateActions`, `case .triggerReroute: break`).
7. AR-Modus: `ARNavViewController.nearestRouteIndex` berechnet einen eigenen, dritten Routenfortschritt.

Es gibt **keine zentrale Quelle der Wahrheit** für den Navigationszustand.

---

## C. Identifizierte Probleme (priorisiert)

### C.1 Positions-Updates lösen Neu-Optimierung und Neu-Routing aus — Schweregrad: kritisch · Sicherheit: hoch [Nachgewiesen]

- **Dateien:** `APP/Views/Main/ContentView.swift:116-123`, `APP/Managers/ShoppingListManager.swift:1032-1061` (`sync`), `:234-305` (`MultiStopRoutePlanner.order`), `APP/Managers/BeaconManager.swift` `setTargetPosition`, `APP/Utilities/RouteManager.swift:60-63` (`setDestination`).
- **Beleg:**
  ```swift
  .onChange(of: beaconManager.userPosition) { _, _ in
      guard shoppingSessionManager.isActive else { return }
      syncShoppingSession()
  }
  .onChange(of: beaconManager.rawUserPosition) { _, _ in
      guard shoppingSessionManager.isActive else { return }
      syncShoppingSession()
  }
  ```
  `sync` → `makeSnapshot(userPosition: beaconManager.userPosition ?? beaconManager.rawUserPosition, …)` → `beaconManager.setRouteTargetPosition(currentStop.mapPoint)` → `routeManager.setDestination(…)` → `buildRoute(…)` **ohne** `replacingOnlyIfRelevant`. Dabei werden `lockedRouteEdgeIndex = 0`, `maxProgressAlongRoute = 0` und `offRouteSince = nil` zurückgesetzt.
- **Ursache:** Die Einkaufsreihenfolge und das aktive Ziel sind kein gespeicherter Zustand, sondern eine reine Funktion der aktuellen Position. `rawUserPosition` ist die ungefilterte Solver-Ausgabe (`BeaconManager.swift:639`).
- **Auswirkung:**
  - Problem C (Zielwechsel): Es gibt keinerlei Hysterese. Gleich weit entfernte Stopps entscheiden per `orderSeed`-Tie-Break.
  - Problem B (Routenänderung): Jede Raw-Position erzeugt einen neuen A* ab der Anzeigeposition.
  - Die Off-Route-Logik des `RouteManager` (Hold, Cooldown, Relevanz) kann in einer Session nie greifen, weil sie bei jedem Update zurückgesetzt wird. Die mühsam eingestellten Route-Schwellen aus `1e6b243` sind in Sessions wirkungslos.
- **Simulation** (Original-Code, Layout `layout-demosupermarkt.json`, 8 Stopps): Ein Versatz der Startposition um 0,85 m diagonal ändert an 6 von 689 begehbaren Punkten den ersten Stopp und an 43 von 689 Punkten die gesamte Reihenfolge. Pro Minute gibt es dutzende Raw-Updates, deren Rauschen typischerweise > 1 m beträgt. In der Nähe solcher Entscheidungsgrenzen flattert das Ziel deshalb.
- **Seit:** `37208b0` (15.04.2026), unverändert bis heute.

### C.2 MapMatcher wechselt nie auf nicht benachbarte Kanten (Dauer-Lock) — kritisch · hoch [Nachgewiesen, simuliert]

- **Datei:** `APP/Utilities/MapMatcher.swift:114-141`, `:165-175`.
- **Mechanik:** Sei `d` die Entfernung der neuen Pose von der alten Kante.
  - Score der alten Kante ≈ `d` (verbunden, keine Strafe).
  - Score jedes Kandidaten nahe der neuen Pose ≥ `continuityWeight·d + disconnectedEdgePenalty` = `1,25·d + 7`.
  - Ein Wechsel erfordert `1,25·d + 7 < d − 2,2`. Das ist **für kein d ≥ 0 erfüllbar**.
  - Die alte Kante wird über `graph.project(point:onto: previous.edgeID)` ohne Distanzlimit weiter verwendet.
  - Mit der Config vor `19ad495` (0,8 / 4,5 / 1,35) wäre ein Wechsel erst ab ~29 m möglich gewesen. Praktisch gilt dasselbe.
- **Simulation (Original-Klasse):**
  - Gleichmäßige 0,5-m-Schritte bis x = 20 m: Der Snap endet bei x = 18 m (2 m Nachlauf).
  - Einmaliger Sprung um 2 / 3 / 4 / 8 / 20 m, danach 50 Updates an der neuen Stelle: Der Snap bleibt bei x = 0,0 / 1,0 / 0,0 / 0,0 / 0,0.
  - Gangwechsel quer durch ein 9×3-m-Regal in 60 Schritten (BLE kennt keine Regale): Der Snap bleibt nach 40 weiteren Updates bei (33,5 / 55,5), also im alten Gang.
- **Auswirkung:** Problem A in beide Richtungen. Der Punkt „klebt“ im falschen Gang oder hinkt hinterher. Die Entscheidungen des `RouteManager` basieren auf dieser Position. Es gibt kein Lösen außer `resetHistory()`, also manueller Kalibrierung oder Layout-Reload.
- **Zusammenspiel:** Die Geschwindigkeitsbremse in C.3 verhindert die meisten großen Einzelsprünge und damit unbeabsichtigt den Totalausfall. Zwei Defekte maskieren sich gegenseitig. Ein typisches Beispiel für „Fixes beeinflussen sich“.

### C.3 PoseFusion: Geschwindigkeitsbremse und Prädiktion kämpfen gegeneinander — hoch · hoch [Nachgewiesen, simuliert]

- **Datei:** `APP/Utilities/PoseFusionService.swift:75-88` und `:111-174`.
- **Defekt 1 – harte Geschwindigkeitsgrenze:** `speedLimitedAlpha = dynamicAlpha / (speed / vMax)` ergibt einen Schritt pro Update von `alpha·vMax·dt`, unabhängig von der echten Bewegung. Die maximal verfolgbare Geschwindigkeit ist damit `alpha·vMax` = 0,28·1,45 ≈ **0,41 m/s** bei Confidence 1 und ≈ 0,12 m/s bei Confidence 0. Gehgeschwindigkeit liegt bei ~1–1,4 m/s.
  - Simulation ohne Prädiktion, Nachlauf nach 20 s Gehen mit 1,3 m/s: 6,0 m (Confidence 1,0), 9,0 m (0,5), 12,2 m (0,2).
  - Eingeführt in `19ad495`. Vorher `dynamicAlpha * 0.72`, siehe `swift/indooro-/indooroApp/Utilities/PoseFusionService.swift`.
- **Defekt 2 – `predict()` überschreibt `lastPose`** (`:171`). Der nächste `update()` rechnet `dt` ab der letzten *Prädiktion* (≤ 50 ms) statt ab der letzten Messung. Die Geschwindigkeit wird massiv überschätzt und `alpha` damit bis zum Faktor 4 gedrosselt. Gleichzeitig entsteht `velocity` aus Rauschen geteilt durch ein kleines `dt` und wird mit 20 Hz extrapoliert.
  - Simulation, stehender Nutzer, Messrauschen σ = 1 m, 27 s: Weg der Ausgabe 7,6 m ohne und **31,2 m mit** Prädiktion. Das ist das „Zappeln im Stand“.
  - Gehen mit 1,2 m/s: 5,9 m Nachlauf ohne, 1,1 m mit Prädiktion.
- **Fazit:** Die Prädiktion ist faktisch der Ausgleich für die Bremse. Beide zusammen erzeugen Trägheit bei Bewegung *und* Unruhe im Stand.

### C.4 Heading-Vergleich im MapMatcher ignoriert, dass Kanten ungerichtet sind — hoch · hoch [Nachgewiesen, simuliert]

- **Datei:** `APP/Utilities/MapMatcher.swift:157-163`, Projektion `IndoorGraph.swift:191-192`.
- `IndoorGraphBuilder` legt Kanten immer nach rechts oder unten an. Wer nach links oder oben geht, bekommt auf der passenden Kante die *maximale* Heading-Strafe (Δ = π). Eine *senkrechte* Kante bekommt nur Δ = π/2.
- **Simulation:** Dieselbe Position, Laufrichtung +x → horizontale Kante (Score 0,05). Laufrichtung −x → **vertikale** Kante (Score 0,63).
- Das Heading stammt zudem aus Deltas der Raw-Solver-Position ab 0,12 m (`estimateHeading`). Bei BLE-Rauschen ist das praktisch eine Zufallsrichtung.
- **Auswirkung:** Systematischer Seitwärts-Snap in Querkanten. Das verstärkt die Kontinuitäts-Locks aus C.2.

### C.5 Routing-Graph: 1-m-Raster, 4-Nachbarschaft, keine Turn-Penalty — hoch · hoch [Nachgewiesen, simuliert]

- **Datei:** `APP/Utilities/IndoorGraph.swift:350-446` (Builder), `:229-274` (A*).
- Jede freie Zelle ist ein Knoten, jede Nachbarzelle eine 1-m-Kante. Zwischen zwei Punkten gibt es sehr viele gleich teure Treppenpfade (Manhattan-Metrik). Die Wahl hängt am Startknoten und an der `Set.min`-Reihenfolge.
- **Simulation:** 40 Startpunkte innerhalb ±0,4 m → **4 verschiedene Kantenfolgen** zum selben Ziel.
- **Regression gegenüber `9f79c8d`/`1b27187`:** Der alte `Pathfinder` (`APP/Utilities/Pathfinder.swift`) nutzte 8 Richtungen, verhinderte Eckenschneiden und hatte eine Turn-Penalty von 1,5 pro Richtungswechsel. Das ergibt gerade, formstabile Linien. Der Pathfinder ist noch im Projekt, `findPath` wird aber nirgends mehr aufgerufen. Nur `GridPoint` wird weiterverwendet.
- Map-Matching auf einem Graphen, in dem *jede* freie Zelle eine Straße ist, liefert kaum Information („auf dem Weg“ heißt nur „nicht im Regal“). Gleichzeitig erzeugt es die Kontinuitäts-Locks aus C.2.
- Die Progress-Lock-Schwellen im `RouteManager` (2,4 m / 2,6 m / 3,0 m) liegen über der Kantenlänge von 1 m. Die Kanten-Lock-Logik ist dadurch weitgehend bedeutungslos.

### C.6 Zu viele gestapelte Filter, unklare Positionsbegriffe — hoch · hoch [Nachgewiesen]

Tatsächliche Filterkette in Wirkreihenfolge:

| # | Mechanismus | Ort | Art |
|---|---|---|---|
| 1 | Trimmed Mean über RSSI-Fenster | `processRSSIWindow` | Ausreißer und Glättung |
| 2 | iBeacon-Jump-Clamp (Faktor 0,18 bei > 2,2 m) | `stabilizedIBeaconDistance` | Outlier-Dämpfung |
| 3 | Kalman pro Beacon (processNoise 0,02, measurementNoise 4,0) | `KalmanFilter`, `:1895` | Glättung |
| 4 | EMA auf iBeacon-Distanz (α = 0,28) | `stabilizedIBeaconDistance` | Glättung |
| 5 | Solver-Prior (62 % alte Lösung als Startwert) + Huber | `BeaconPositionSolver` | Robustheit und Trägheit |
| 6 | Confidence-EMA + Geschwindigkeitsbremse | `PoseFusionService.update` | Glättung und Gate |
| 7 | Prädiktion 20 Hz | `PoseFusionService.predict` | Interpolation (Rauschverstärker, C.3) |
| 8 | MapMatcher: Kontinuität, Heading, Routen-Bias, Disconnect-Gate | `MapMatcher.match` | Snap und Hysterese |
| 9 | Anzeige-EMA (α = 0,35) + Sprungbestätigung (3×) | `filteredDisplayPosition` | Glättung und Hysterese |
| 10 | Anzeige-Gate: ≥ 1 s **und** (≥ 0,85 m **oder** ≥ 3 s) | `filteredDisplayPosition` | Debounce |
| 11 | Low-Confidence-Freeze der Route | `NavigationStateMachine` | Hold |
| 12 | Off-Route: > 8 m **und** Alternativ-Gain ≥ 2,0 für ≥ 6 s, Cooldown 20 s, ≥ 5 m seit Routenstart, Relevanz ≥ 6 m | `RouteManager.update` | Hysterese |

Weitere Befunde zu dieser Kette:

- Die Stufen 9–10 werden mit ≥ 20 Hz gefüttert, über Prädiktion und Kompass. Die Sprungbestätigung (3 Bestätigungen) ist dann nach ~150 ms erfüllt, wirkt also kaum. Das 1-s-Gate addiert dagegen sichtbare Latenz.
- Die Stufen 9–10 wurden in `1e6b243` ergänzt. Sie halten `userPosition` ruhiger, aber `rawUserPosition` triggert `sync()` weiterhin ungefiltert (C.1). Problem C konnte dieser Fix deshalb nicht lösen.

**Positionsbegriffe:**

| Begriff | Variable | Wer liest sie |
|---|---|---|
| (1) Rohschätzung | `rawUserPosition`, `lastSolvedRawPoint` | `sync()`, Anzeige-Fallback, Heading |
| (2) Fusioniert | `PoseFusionService.lastPose` (intern) | Matcher |
| (3) Graph-projiziert | `lastMatchedPose.snappedPosition` | `RouteManager` (Off-Route, Fortschritt) |
| (4) Angezeigt | `userPosition` | Karte, AR, Startpunkt für `setDestination`, `sync()` |
| (5) Für Routenentscheidungen | gemischt: (3) im `RouteManager`, (4) als Routenstart, (4)/(1) für die Reihenfolge | — |

Die *langsamste* Position (4, bis zu 3 s alt) dient als Startpunkt neuer Routen. Die *schnellste und unruhigste* (1) treibt die Zielwahl. Das ist genau umgekehrt zu den Anforderungen.

### C.7 Zwei parallele Messpfade speisen denselben Kalman-Filter — mittel · mittel [Nachgewiesen / Wirkung: Wahrscheinlich]

- `processRSSIWindow` (eigenes Log-Distance-Modell, TxPower −72, n = 2,8) und `stabilizedIBeaconDistance` (CoreLocation `accuracy`) rufen beide `kalmanFilters[name].filter(…)` auf. Beide überschreiben `beacons[i].distance`.
- Sind für einen Beacon beide Pfade aktiv, wechselt die Eingangsgröße des Filters zwischen zwei Distanzmodellen. Das gilt etwa, wenn der Beacon über den Namen „Indooro…“ *und* per Ranging erkannt wird.
- `calculateLocation` läuft zusätzlich bei jedem `didRange`-Callback. Das ergibt unregelmäßige Zeitschritte, die über C.3 die Glättung beeinflussen.
- **[Hypothese]** iOS liefert iBeacon-Manufacturer-Data üblicherweise nicht über CoreBluetooth aus. Der Manufacturer-Data-Zweig in `didDiscover` greift dann im Feld nie, nur der Namenszweig. Das ist mit Debug-Log am Gerät zu prüfen (`appendDebugLog`-Keys `ibeacon-*` und `indooro-name-*`).

### C.8 RouteManager: Schwellen verdoppelt, Off-Route misst gegen eine routengebiaste Position — mittel · hoch [Nachgewiesen]

- `1e6b243` (falsch beschriftet „feat: Add JaCoCo coverage…“) hat alle Route-Schwellen etwa verdoppelt (4 → 8 m, 2,5 → 6 s, 8 → 20 s, …) und zwei weitere Gates ergänzt (`hasMovedEnoughForReroute`, `isRouteReplacementRelevant`).
- `isRouteReplacementRelevant` lehnt eine *andere* Route mit ähnlicher Länge (< 6 m Unterschied) ab. Das ist genau der Fall „falsch abgebogen, Parallelgang ist gleich lang“. Danach wird trotzdem `lastRerouteAt` gesetzt (`RouteManager.swift:150-152`), es folgen 20 s Sperre.
- Die Off-Route-Distanz wird von `snappedPosition` gemessen. Diese wurde vorher mit `preferredRouteEdgeIDs` zur Route hingezogen (`MapMatcher.scoreCandidate`, Routen-Bias). Die Abweichungserkennung bestätigt sich damit selbst.
- **Auswirkung im Einzelziel-Modus:** Echte Abweichungen werden sehr spät oder gar nicht erkannt. In der Session ist das wegen C.1 irrelevant.
- `RouteUpdateResult.activeRouteEdgeID`, `nextTurnDistance` und `distanceToRoute` werden außerhalb des `RouteManager` nicht verwendet.

### C.9 NavigationStateMachine ist großteils wirkungslos — mittel · hoch [Nachgewiesen]

- `.triggerReroute` → `break`. Reroute-Entscheidungen trifft allein der `RouteManager`. Die State Machine setzt nur Statustexte.
- `performManualCalibration` sendet `manualSetPosition` und direkt danach `manualCalibrationApplied`. Freeze und Unfreeze passieren im selben Aufruf.
- Low-Confidence friert die Route ein, solange die heuristische Confidence < 0,35 ist. Die Position wird weiter angezeigt. Wer bei schwachem Signal tatsächlich abbiegt, bekommt keine neue Route. Da `sync()` (C.1) trotzdem neue Routen setzt, wirkt der Freeze nur außerhalb von Sessions.
- `applyStateActions` dispatcht bei jedem Update `isLowConfidence` auf Main.

### C.10 Main-Thread-Last und SwiftUI-Invalidierung — mittel · mittel [Nachgewiesen / Wirkung: Hypothese]

- `MultiStopRoutePlanner.order` baut bei jedem Aufruf den `IndoorGraph` neu. Pro Vergleich im `min`-Comparator rechnet es zwei A*-Läufe (`routeDistance(lhs)` und `routeDistance(rhs)`). A* verwendet `openSet.min` (O(n) pro Schritt).
  - Gemessen für 8 Stopps auf dem Demo-Layout (1509 Knoten): **17 ms (Release, -O), 61 ms (Debug, -Onone)** pro Aufruf.
  - Dieser Aufruf läuft auf Main bei *jedem* Positionsupdate (C.1).
- `ShoppingFeatureViews.selectedPreview` (`:1181`) ruft `previewSnapshot`, inklusive Optimierung, als berechnete Property im View-Body auf. Sie wird pro Body-Evaluation zweimal genutzt (`:1215`, `:1223`).
- `BeaconManager` publiziert mit ≥ 20 Hz: `userHeadingRadians` im Motion-Handler, `beacons[i]`-Mutationen pro Beacon und Tick, `debugLogLines`. Jede Änderung invalidiert alle beobachtenden Views. Root ist `ContentView` mit `@StateObject beaconManager`.
- **[Hypothese]** Im Debug-Build entstehen dadurch Frame-Drops und verspätete Timer- und BLE-Callbacks, also ungleichmäßige Zeitstempel. Das ist mit Instruments (Time Profiler, SwiftUI-Instrument) zu messen.

### C.11 Einkaufslisten-Optimierung: nur Nearest Neighbor, kein gespeichertes aktives Ziel — mittel · hoch [Nachgewiesen]

- Implementiert ist **nur greedy Nearest Neighbor** (`MultiStopRoutePlanner.order`) mit A*-Kosten. **2-opt ist nicht implementiert**, im gesamten Swift-Code gibt es keine Spur davon.
- Im Modus `.listOrder` wird die Listenreihenfolge verwendet.
- Das aktive Ziel ist `orderedStops.first`. Es wird bei jedem Snapshot neu bestimmt und nirgends gespeichert.
- Es gibt keine automatische Ankunftserkennung. Das ist bei BLE-Genauigkeit vertretbar, muss aber bewusst entschieden werden.

### C.12 Regal-Zuordnung per Präfix — niedrig bis mittel · hoch [Nachgewiesen, auf anderem Branch behoben]

- `setTargetProduct` und `ShoppingStopResolver.resolveShelf` nutzen `elementCategory.starts(with: category)`. Ein Produkt „3/…“ kann so auf Regal „310“ zeigen. Das ergibt ein falsches Ziel und damit eine scheinbar „falsche Route“.
- Auf `codex/admin-platform-rebuild` behoben: `5936ed4`, `d8aa91b`, `f118e20`, `eb4d3e8` mit `matchesProductLayoutCode`. Auf dem aktuellen Branch fehlt das noch.

### C.13 Kleinere Punkte

- Das Kompass-Heading wird ohne Ausrichtung des Layouts zum Norden in Kartenkoordinaten übernommen (`alignedDeviceHeadingInMapCoordinates` gibt den Rohwert zurück). Das betrifft nur die Anzeige des Pfeils. Rotierte Layouts (`1b27187`) werden nicht berücksichtigt. **[Wahrscheinlich]**
- Das gebündelte Layout `layout-demosupermarkt.json` enthält **0 Beacons**. Offline ist keine Positionierung möglich, Tests brauchen Server-Layouts oder Fixtures.
- `KalmanFilter` benennt R und Q entgegen der üblichen Konvention (hier: R = Prozessrauschen, Q = Messrauschen). Die Rechnung ist in sich konsistent. Das ist kosmetisch, erschwert aber das Tuning.
- Der alte Pfad mit Hintergrund-A* (März) hatte keinen Stale-Result-Schutz. Im aktuellen Code läuft alles synchron auf Main, Races zwischen alten und neuen Routenergebnissen sind daher **nicht** möglich. Die Kehrseite ist die Main-Thread-Last (C.10).

---

## D. Git-History-Erkenntnisse

Die Swift-App existiert in drei Kopien. Die History ist über Kopien und Umbenennungen verteilt:

| Zeitraum | Ort | Commit(s) | Navigationsstand |
|---|---|---|---|
| 07.01.–18.03. | `swift/indooroApp` | `4c68669`, `e99eed9` (Kalman), `9f79c8d` (Pathfinder), `ea6c3cf`, `1b27187` | **Einfach:** RSSI Trimmed Mean → Kalman → Top-3-Centroid (1/d²) → `userPosition`. Route alle 0,5 s per `Pathfinder` (8 Richtungen, Turn-Penalty) im Hintergrund. Ein einzelnes Ziel, keine Liste. ~490 Zeilen `BeaconManager`. |
| 15.04. | `swift/indooro-` | `37208b0` „zweite App“ | **Ein großer Commit** bringt die gesamte stabilisierte Pipeline: Solver, PoseFusion, MapMatcher, `IndoorGraph`, RouteManager, State Machine, Config. Außerdem Einkaufslisten mit NN und das `onChange(userPosition/rawUserPosition) → sync`. Config moderat (α 0,46, vMax 3,0, Off-Route 4 m / 2,5 s / 8 s). |
| 26.05. | `swift/indooro-EinkaeuferFinal` | `19ad495` (+ `718fcf3` Restore) | +942 Zeilen `BeaconManager`: iBeacon-Ranging-Pfad, `stabilizedIBeaconDistance`, Store-Erkennung. **Config deutlich träger:** α 0,46 → 0,28, Low-Confidence-α 0,18 → 0,08, vMax 3,0 → 1,45, Solver-Damping 0,28 → 0,55, Kontinuität 0,8 → 1,25, Disconnect-Strafe 4,5 → 7,0. Speed-Gate von `×0,72` auf `/overshoot` geändert (C.3). |
| 17.06. | EinkaeuferFinal | `1e6b243` (Message: „JaCoCo coverage“) | **Navigationsänderung ohne passende Commit-Message:** Anzeigefilter-Schicht (Stufen 9–10), alle Route-Schwellen etwa verdoppelt, Gates `hasMovedEnoughForReroute` und `isRouteReplacementRelevant`. |
| 02.–29.06. | EinkaeuferFinal | `68a4268` … `63a42d4` | Upsell-Features. `08e3fdb` („Avoid redundant upsell plan refreshes“) reagiert vermutlich auf häufige `currentStop`-Wechsel. **[Hypothese]** |
| 14.10. | nur `codex/admin-platform-rebuild` | `5936ed4`, `d8aa91b`, `f118e20`, `eb4d3e8` | Exakte Regal-Zuordnung (C.12). Noch nicht auf diesem Branch. |

**Bewertung:**

- **Einfachere Logik:** `1b27187` (März). Als Vergleichsversion für einen A/B-Replay-Test eignet sie sich am besten.
- **Kandidaten für Regressionen:**
  - `37208b0` hat C.1, C.2, C.4 und C.5 eingeführt.
  - `19ad495` hat C.3 (Speed-Cap) und die Trägheit verschärft und C.7 (zweiter Messpfad) eingeführt.
  - `1e6b243` hat zusätzliche Schichten gebracht, die das Kernproblem nicht berühren (C.6, C.8).
- **Früher besser gelöst:**
  - Routenform per Turn-Penalty.
  - Eine einzige Glättungsstufe.
  - Position wird direkt verwendet, statt durch fünf Zustände zu laufen.
- **Später sinnvoll hinzugekommen und erhaltenswert:**
  - Gauss-Newton-Solver mit Huber-Gewichten. Er ist besser als der Centroid, der systematisch zu den Beacons hin verzerrt.
  - Graph-basierte Routenkosten für die Reihenfolge.
  - Einkaufslisten mit Stopps und Gruppierung pro Regal.
  - Die Idee eines Off-Route-Holds.
  - Manuelle Kalibrierung.
  - Debug-Modus ohne Beacons.
- Wichtig: Die Behauptung „`37208b0` hat es kaputt gemacht“ wäre zu einfach. Ab `37208b0` gab es Mehrziel-Navigation. Problem C *konnte* vorher gar nicht auftreten. Die Regressionen in der Einzelziel-Positionierung (C.2–C.5) sind dagegen echte Verschlechterungen gegenüber März.

---

## E. Empfohlene Vereinfachungen

**Entfernen:**

1. `ContentView.onChange(userPosition)` und `onChange(rawUserPosition)` → `sync` (C.1).
2. Das Anzeige-Gate und die Sprungbestätigung (Stufen 9–10, `1e6b243`). Diese Aufgabe übernimmt nach Korrektur der Fusion **eine** Filterstufe. Für die Darstellung reicht eine Animation (`withAnimation`) statt eines Daten-Gates.
3. Die EMA und den Jump-Clamp auf die iBeacon-Distanz (Stufen 2 und 4). Kalman plus Huber im Solver decken das ab.
4. Die Prädiktion in der jetzigen Form (Stufe 7) bzw. das Überschreiben von `lastPose`.
5. Den Routen-Bias im MapMatcher und die Kontinuitäts- und Disconnect-Logik in der jetzigen Form (C.2). Ersatz: Projektion auf die nächste begehbare Stelle, siehe F.
6. `NavigationStateMachine` als eigene Instanz. Statusmeldungen und Low-Confidence gehören in die Navigationssession.
7. Ungenutzte Ausgaben (`RouteUpdateResult`-Felder) bzw. ungenutzter Code (`Pathfinder.findPath`). Den Turn-Penalty-Gedanken behalten, siehe unten.

**Zusammenführen:**

- Genau **einen** Messpfad wählen (CoreLocation-Ranging *oder* CoreBluetooth-RSSI) bzw. getrennte Filterinstanzen je Pfad führen. Die Entscheidung erfordert Felddaten (H).
- `RouteManager`-Gates auf **eine** Off-Route-Regel reduzieren: Entfernung zur Route über Schwelle X für Dauer Y, gemessen an einer *nicht* routengebiasten Position. Cooldown, Bewegt-genug und Relevanz entfallen oder werden zu einer einzigen Regel.

**Erhalten:**

- Solver mit Huber-Gewichten.
- Ein Kalman pro Beacon.
- Graph-A* (mit Turn-Penalty oder auf Gangachsen-Graph).
- Gruppierung der Stopps pro Regal.
- NN als Startplanung.
- Manuelle Kalibrierung.
- Debug-Modus.

---

## F. Empfohlene Zielarchitektur

Keine Neuentwicklung. Die vorhandenen Klassen sind weitgehend UI-unabhängig (`IndoorGraph`, `BeaconPositionSolver`, `PoseFusionService`, `RouteManager`, `MultiStopRoutePlanner`). Neu ist vor allem eine klare Besitzregel.

```
[1] BeaconMeasurements      Ein Pfad, Kalman pro Beacon, feste Taktung (Timer), Zeitstempel je Messung
        │
[2] PositionEstimator       Solver → EIN Filter (EMA mit sauberem dt ODER 2D-Kalman mit konstanter
        │                   Geschwindigkeit) → Ausgabe: position, unsicherheit, zeitstempel
        │
[3] WalkableProjector       Projektion auf begehbare Fläche / Gangachse, ohne Historie und ohne Routen-Bias
        │                   → "estimatedPosition" (für UI UND Entscheidungen)
        ▼
[4] NavigationSession  (einziger Besitzer, @MainActor, ObservableObject)
      state: plannedStops[], activeStopIndex, activeRoute, routeProgress, offRouteSince, mode
      Eingänge (Events):
        - positionUpdated(estimate)    → nur Fortschritt + Off-Route-Prüfung, KEINE Neuplanung
        - stopCompleted / stopSkipped  → activeStopIndex += 1, Route zum nächsten Stopp
        - listChanged                  → kontrollierte Neuplanung der *verbleibenden* Stopps
        - replanRequested (Nutzer)     → Neuplanung ab aktueller Position
        - offRouteConfirmed            → NUR Route zum *aktiven* Stopp neu, Reihenfolge bleibt
        - layoutChanged                → Reset
      Ausgaben: NavigationSnapshot (Stopps, aktives Ziel, Route-Polyline, Fortschritt, Status)
        ▼
[5] UI                      liest nur den Snapshot, berechnet nichts im Body
```

**Bewertung der vorgeschlagenen Designrichtung:** Die Richtung ist richtig. Initiale Planung, eine stabile Reihenfolge, ein stabiles aktives Ziel, Rerouting nur zum aktiven Ziel und Neuoptimierung nur bei Ereignissen lösen C.1 und C.11 vollständig. Die Off-Route-Logik des `RouteManager` wirkt dann erst überhaupt.

Ergänzungen:

- Die **Position für UI und Entscheidungen kann dieselbe sein**, wenn sie *einmal* sauber gefiltert ist. Den Unterschied machen die Entscheidungsregeln: Fortschritt pro Update, Off-Route erst nach Dauer. Eine zweite, verzögerte Position ist nicht nötig. Das spart einen ganzen Zustand.
- **Fortschritt** als Projektion auf die Polyline der aktiven Route, monoton mit kleiner Rückwärtstoleranz. Das ersetzt den Kanten-Lock, der bei 1-m-Kanten ohnehin nicht trägt.
- **Routing-Graph:** Entweder (a) Raster behalten, aber mit Turn-Penalty und deterministischem Tie-Break (Knoten-ID) versehen. Oder (b) mittelfristig ein Gangachsen-Graph, aus dem Layout abgeleitet oder im Admin gepflegt. Das ergibt wenige, lange Kanten, eindeutige Routen und ein sinnvolles Map-Matching. Variante (a) ist der kleinste Schritt.
- **Optimierung:** NN plus optional 2-opt *einmal* beim Start und bei Listenänderung. 2-opt ist bei < 20 Stopps billig, wenn die Distanzmatrix einmal mit Dijkstra pro Stopp vorberechnet wird statt mit A* pro Paar im Comparator.
- **Ankunft:** Optional einen *Vorschlag* („Bist du bei Regal X?“) anzeigen, wenn der Nutzer für eine Mindestdauer innerhalb eines Radius steht. Nie automatisch umsortieren.
- Die Rechenarbeit (Planung, A*) kann über `Task.detached` vom Main-Thread weg. Dann aber mit Generationszähler, damit veraltete Ergebnisse verworfen werden.

**Zu kalibrierende Schwellen.** Keine Werte ohne Daten; diese Größen müssen aus aufgezeichneten Läufen bestimmt werden:

- Messrauschen der Position im Stand (Streuung je Store und Beacon-Dichte) → Filterstärke.
- Typische Gehgeschwindigkeit und Beschleunigung → Prozessrauschen bzw. Plausibilitätsgrenze.
- Off-Route-Distanz relativ zur Gangbreite und zur Positionsstreuung, plus Mindestdauer.
- Radius und Dauer für einen Ankunftsvorschlag.
- Beacon-Ausfallzeit, ab der eine Messung als veraltet gilt.
- Pfad-Verlust-Exponent und TxPower je Beacon-Typ (nur falls der RSSI-Pfad bleibt).

---

## G. Priorisierter Maßnahmenplan

Aufwand: S < 0,5 Tag, M 1–2 Tage, L > 3 Tage.

### Stufe 1 – Sofortige Bugfixes (größte Wirkung, kleines Risiko)

| # | Maßnahme | Aufwand | Risiko | Erwartete Wirkung |
|---|---|---|---|---|
| 1.1 | `onChange(userPosition/rawUserPosition) → sync` entfernen. `sync` nur bei Session-Start, Listenänderung, Erledigt/Überspringen, Layoutwechsel und Moduswechsel. Den aktiven Stopp im `ShoppingSessionManager` speichern, statt ihn aus `orderedStops.first` abzuleiten. | S–M | niedrig | Beseitigt Problem C und den Großteil von B. Aktiviert die Off-Route-Logik in Sessions. Senkt die Main-Thread-Last. |
| 1.2 | MapMatcher: Historie verwerfen, wenn die Pose weiter als `maxProjectionDistance` von der vorherigen Kante entfernt ist. Heading-Differenz modulo π (Kanten ungerichtet). Routen-Bias entfernen. Alternativ den Matcher vorerst durch `nearestProjection` ohne Historie ersetzen. | S | niedrig | Beseitigt den Dauer-Lock und den Seitwärts-Snap (C.2, C.4). |
| 1.3 | PoseFusion: `predict()` darf `lastPose` nicht überschreiben (separater Ausgabewert). Speed-Gate entfernen oder als echte Plausibilitätsprüfung mit `dt` seit der letzten *Messung* umsetzen. | S | mittel (Verhalten ändert sich spürbar) | Position folgt normalem Gehtempo, weniger Zittern im Stand (C.3). |
| 1.4 | `setTargetPosition`: Startpunkt aus derselben Position wie die Entscheidungen nehmen, nicht aus dem verzögerten Anzeige-Gate. | S | niedrig | Konsistenz von Route und Punkt. |
| 1.5 | Regal-Zuordnung: Commits `5936ed4`, `d8aa91b`, `f118e20`, `eb4d3e8` von `codex/admin-platform-rebuild` übernehmen (Merge erst nach Rücksprache). | S | niedrig | Keine falschen Ziele (C.12). |

### Stufe 2 – Vereinfachung

| # | Maßnahme | Aufwand | Risiko | Wirkung |
|---|---|---|---|---|
| 2.1 | Anzeigefilter-Schicht (Stufen 9–10) und iBeacon-EMA/Jump-Clamp entfernen. Prädiktion ganz entfernen oder klar getrennt nur für die Animation verwenden. | S | mittel | Weniger Latenz, nachvollziehbares Verhalten. |
| 2.2 | Einen Messpfad festlegen. `calculateLocation` nur noch vom Timer auslösen. | S–M | mittel (Feldtest nötig) | Gleichmäßige Zeitschritte, keine gemischten Distanzmodelle. |
| 2.3 | `RouteManager`-Gates auf eine Off-Route-Regel reduzieren. `NavigationStateMachine` einschmelzen. | M | mittel | Weniger Wechselwirkungen. |
| 2.4 | A* im Raster mit Turn-Penalty und deterministischem Tie-Break. `openSet` als Heap. | S–M | niedrig | Formstabile Routen (C.5), schneller. |
| 2.5 | `@Published`-Frequenz senken: `userHeadingRadians` nur bei Änderung über einer Schwelle setzen, `beacons` nur gebündelt pro Tick. `selectedPreview` aus dem View-Body in den Session-State verschieben. | S–M | niedrig | Weniger Re-Renders (C.10). |

### Stufe 3 – Gezielte Architekturverbesserungen

| # | Maßnahme | Aufwand | Risiko | Wirkung |
|---|---|---|---|---|
| 3.1 | `NavigationSession` als einziger Besitzer (F). `ShoppingSessionManager` und die Routenteile von `BeaconManager` darin zusammenführen. `BeaconManager` liefert nur noch Positionen. | M–L | mittel | Klare Verantwortlichkeiten. |
| 3.2 | Distanzmatrix (Dijkstra je Stopp) plus NN plus 2-opt, nur bei Planungsereignissen. | M | niedrig | Bessere, stabile Reihenfolge. |
| 3.3 | Optionaler Gangachsen-Graph für Routing und Projektion. | L | mittel | Eindeutige Routen, echtes Map-Matching. |

### Stufe 4 – Tests und Simulation (parallel ab Stufe 1)

| # | Maßnahme | Aufwand | Risiko | Wirkung |
|---|---|---|---|---|
| 4.1 | XCTest-Target oder lokales Swift Package mit den reinen Logik-Klassen (siehe `TESTING.md`). | S–M | niedrig | Regressionsschutz. |
| 4.2 | Recorder im Debug-Build (JSONL der Rohmessungen) und ein Replay-Treiber. | M | niedrig | Reproduzierbarkeit und A/B-Vergleich. |
| 4.3 | Szenario-Tests 1–8 (unten) mit Metriken. | M | niedrig | Messbare Stabilität. |

### Stufe 5 – Später

- Kalibrierung der Schwellen aus echten Läufen.
- PDR mit CoreMotion-Schrittzähler als Bewegungsmodell im Filter.
- Ausrichtung des Kompasses zum Layout.
- Ankunftsvorschläge.
- Ausgleich der Geräte-Unterschiede bei RSSI.

---

## Teststrategie und Reproduzierbarkeit

**Ist-Zustand:**

- Kein XCTest-Target (`swift/indooro-EinkaeuferFinal/TESTING.md`).
- Keine Navigations- oder Replay-Tests.
- Das Demo-Layout im Bundle hat keine Beacons.
- Der einzige manuelle Weg ist der Modus `debugNoBeacons` mit Tap-Kalibrierung.
- Ausgeführte Tests: keine vorhanden. Stattdessen wurde für diesen Review ein **read-only Analyse-Harness** gebaut. Es kompiliert die *unveränderten* Dateien `LayoutData.swift`, `Pathfinder.swift`, `IndoorGraph.swift`, `MapMatcher.swift`, `PoseFusionService.swift` und `StabilizedNavigationConfig.swift` mit einer eigenen `main.swift` im Scratchpad der Session, außerhalb des Repos. Die Zahlen in C.1–C.5 und C.10 stammen daraus. Das Harness lässt sich als Keimzelle für 4.1 übernehmen.

**Replay-Format (Vorschlag):**

```jsonl
{"t": 1739.512, "src": "ranging", "beacon": "Indooro-3", "rssi": -71, "accuracy": 2.4, "proximity": "near"}
{"t": 1739.530, "src": "cb",      "beacon": "Indooro-5", "rssi": -80, "tx": -59}
{"t": 1740.100, "event": "groundTruth", "x": 12.5, "y": 30.5}
{"t": 1741.000, "event": "stopDone"}
```

Der Replay-Treiber speist die Pipeline mit virtueller Uhr, das heißt deterministisch und schneller als Echtzeit. Dieselbe Aufnahme läuft gegen den alten Stand (`1b27187`-Logik), den aktuellen Stand und den neuen Stand.

**Szenarien:**

| # | Szenario | Eingabe | Erwartung / Prüfgröße |
|---|---|---|---|
| 1 | Stillstand | 60 s Rauschen um festen Punkt | 0 Zielwechsel, 0 Neuberechnungen, Positionsstreuung ≤ Kalibrierwert |
| 2 | Normales Gehen | Bewegung entlang der Route mit 1,0–1,4 m/s plus Rauschen | Nachlauf unter Grenzwert, 0 Off-Route-Ereignisse, Fortschritt monoton |
| 3 | Ausreißer | ein Beacon liefert für 1–2 Messungen +6 m | keine Zieländerung, Positionsauslenkung begrenzt, kein Matcher-Lock |
| 4 | Zwei gleich nahe Produkte | Start auf der Entscheidungsgrenze plus Jitter (wie in C.1 simuliert) | aktives Ziel konstant |
| 5 | Echte Abweichung | Nutzer biegt in den Parallelgang und geht weiter | genau 1 Reroute zum *gleichen* Ziel nach Erkennungszeit Y, Reihenfolge unverändert |
| 6 | Produkt erreicht | `stopDone` | genau 1 Zielwechsel zum nächsten geplanten Stopp |
| 7 | Liste geändert | Produkt hinzugefügt oder entfernt | genau 1 Neuplanung der verbleibenden Stopps, aktives Ziel bleibt, falls noch enthalten |
| 8 | Beacon-Ausfall | Beacon 10 s weg, dann wieder da | keine Sprünge > Grenzwert, kein Lock, schnelle Wiederaufnahme |
| 9 | Gangwechsel durch Regal (Zusatz) | Pose quert ein Regal | angezeigte Position landet im neuen Gang (Regression für C.2) |

**Metriken:**

- Routen-Neuberechnungen pro Minute, aufgeteilt nach Ursache.
- Zielwechsel pro Minute ohne `stopDone`, `skip` oder `listChanged` (Soll: 0).
- Positionssprünge über Grenzwert pro Minute.
- Nachlauf in Metern bei konstanter Bewegung (mit Ground Truth).
- Zeit von echter Abweichung bis zum Reroute.
- Zahl der Zustandswechsel `tracking` ↔ `lowConfidence`.
- Main-Thread-Zeit pro Update.

---

## H. Offene Fragen (nur mit Felddaten oder Tests beantwortbar)

1. Welcher Messpfad liefert im Supermarkt tatsächlich Daten: CoreLocation-Ranging, CoreBluetooth-Name oder beide? Wie viele Callbacks pro Sekunde kommen? (Debug-Log am Gerät auswerten.)
2. Wie viele Beacons sind pro Position typischerweise sichtbar, und wie ist ihre Geometrie? Das Bundle-Layout hat 0 Beacons, die Server-Layouts wurden nicht geprüft.
3. Entspricht eine Rastereinheit im Layout einem Meter? Der Solver setzt das implizit voraus, denn Beacon-Distanzen in Metern werden direkt mit Rasterkoordinaten verglichen.
4. Wie groß sind das Positionsrauschen im Stand und der Nachlauf beim Gehen *heute* am Gerät? Die Simulation nutzt angenommenes Rauschen.
5. War bei den Beobachtungen „früher besser“ eine Einkaufssession aktiv oder nur ein Einzelziel? Welche App-Version (März `swift/indooroApp` oder April `swift/indooro-`) war die Referenz?
6. Debug- oder Release-Build auf dem Gerät? Das ist für die Main-Thread-Last relevant (C.10).
7. Wie halten Nutzer das Gerät (Hand, Wagen, Tasche)? Das beeinflusst RSSI-Dämpfung und Bewegungserkennung.
8. Stimmen die Layout-Beacon-Koordinaten mit der realen Montage überein? Ein Positionsfehler der Anker wirkt wie ein systematischer Bias.
9. Soll ein Produkt automatisch als erreicht gelten, oder bleibt das bewusst manuell?
10. Ist das Layout zum Norden ausgerichtet, also verwendbar für das Kompass-Heading?
