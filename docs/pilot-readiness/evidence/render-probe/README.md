# Messung: `ContentView`-Auswertungen im Stand (stabilize-ios-navigation-pipeline 10.4)

Datum: 2026-10-17. Ergebnis: Im simulierten Stillstand wertet `ContentView` **höchstens einmal pro Tick** aus (214 Ticks, 215 Auswertungen im Messfenster, Verhältnis 1,005). Es ist keine Codeänderung nötig.

## Methode

- Simulator iPhone 17 Pro, iOS 26.3, Debug-Build von `pilot/erik-guided-tour` (nach Merge von `origin/pilot/first-store`).
- Temporäre Messhilfe, nur `#if DEBUG` und nur mit `INDOORO_RENDER_PROBE=1` (Diff: `probe-instrumentation.diff`, nach der Messung wieder entfernt):
  - `ContentView.body` zählt jede Auswertung und ruft `Self._printChanges()` auf.
  - `BeaconManager.processBufferAndCalculate()` zählt jeden Tick und speist vor dem Tick feste RSSI-Werte ein, berechnet aus dem Abstand jedes Beacons zur festen Position (2,0 m / 3,5 m). Das ist ein simulierter Stillstand durch die echte Pipeline (Solver, Schätzer, Projektion, Veröffentlichung).
  - Ein 5-Sekunden-Zähler schreibt `RENDERPROBE ticks=… contentViewBodies=…` auf die Konsole.
- Layout: Bundle-Layout „Test-Raum“ (4 Beacons, Raster 4 × 7 m). Die App war frisch installiert (keine Offline-Kopie), `INDOORO_API_BASE_URL=http://127.0.0.1:1/api`, damit kein Server erreichbar ist und das Bundle-Layout aktiv bleibt.
- Lauf: 85 s, Start per `xcrun simctl launch --console-pty`.

Ein erster Lauf ohne frische Installation hatte eine Offline-Kopie des UI-Testmarkts (0 Beacons) geladen; dort kam kein Sample an und `ContentView` wertete nur 4-mal aus. Dieser Lauf zählt nicht als Messung.

## Ergebnis

| Messpunkt | Ticks | `ContentView`-Auswertungen |
|---|---|---|
| erster Zähler (t = 1792229971) | 15 | 19 |
| letzter Zähler (t = 1792230046) | 229 | 234 |
| Differenz im Fenster | 214 | 215 |

- Tick-Rate: rund 2,9 pro Sekunde (Intervall 0,35 s), die Auswertungen laufen im selben Takt, nicht schneller.
- `_printChanges()` nennt fast ausschließlich `_beaconManager changed` (243 von 244 Zeilen; die erste Zeile ist der Initialaufbau). Jeder Tick löst also eine Auswertung aus, weil sich die geglättete Position im Stand weiter minimal ändert. Das entspricht dem Verhalten, das im Task 10.4 erwartet war. Zwei getrennte Main-Queue-Blöcke (Rohposition, projizierte Position) werden pro Tick zu einer Auswertung zusammengefasst.
- Rohdaten: `renderprobe-2026-10-17.txt`.

## Grenzen

- Simulierter Stillstand, keine echten BLE-Daten. Auf dem Gerät mit echtem Rauschen kann die Position pro Tick springen; das ändert die Anzahl der Auswertungen pro Tick nicht, weil sie ohnehin einmal pro Tick liegt.
- Gemessen wurde die Anzahl der Auswertungen von `ContentView`, nicht die Renderzeit. Das SwiftUI-Instrument (`xctrace`) wurde nicht verwendet.
