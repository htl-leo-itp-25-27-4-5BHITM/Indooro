# Algorithmen – Indooro Positioning Lab

Alle Verfahren liegen in `src/positioning/`. Sie sind reine Funktionen (keine Mutation der Eingaben) und liefern bei leeren oder
degenerierten Daten **einen Fehlschlag mit Grund** statt einer Ausnahme. Einzige beabsichtigte Ausnahme: `LeakageError`
(Datenleck, siehe unten).

> **Wichtig – Annahmen sind keine Messergebnisse.** Die Standardwerte des Pfadverlustmodells (−72 dBm @ 1 m, n = 2,8), Fensterlängen,
> Gewichtsexponenten und Filterparameter sind **nicht feldkalibriert**. Sie stammen aus der bestehenden iOS-App bzw. sind
> Startwerte des Labs. Sie dürfen nirgends als allgemeingültig dargestellt werden. Ergebnisse mit
> `PathLossModel.source === "default"` tragen die Warnung „unkalibriertes Pfadverlustmodell“.

## Koordinaten und Einheiten

- Positionen sind **Layout-Einheiten (LE)**: x nach rechts, y nach unten (siehe `core/types.ts`).
- Pfadverlust-Distanzen sind **Meter**. Umrechnung ausschließlich über den Maßstab des Grundrisses:
  `distanz_LE = distanz_m / plan.scale.metersPerUnit` (und umgekehrt `m = LE · metersPerUnit`).
- Ist `scale.confirmed === false`, beruht jede Meterangabe auf einer Annahme (Konvention „1 Zelle = 1 m“). Das Lab zeigt dann Fehler in LE
  und hängt eine Warnung an.

## Datenfluss (Reihenfolge ist Teil der Methodik)

1. **RSSI-Filter je Beacon** (`filters.ts`) – nur kausal (nur Vergangenheit), siehe unten.
2. **Epochen** (`epochs.ts`) – alle `stepSec`, Aggregation je Beacon.
3. **Algorithmus** (`algorithms.ts`) – je Epoche, mit `rssiThreshold`, `topK`, deaktivierten und unbekannten Beacons bereits ausgefiltert.
4. **Zeitlicher Filter** (`temporal.ts`) – auf Positionen.
5. **Referenz/Truth** (`reference.ts`), **Metriken** (`metrics.ts`, siehe `METRICS.md`).

## 1. RSSI-Filter (`filters.ts`)

Alle Glättungsfilter sind **kausal**: `out[i]` hängt nur von `in[0..i]` ab. Das entspricht einer Echtzeit-App und verhindert, dass spätere
Messwerte in frühere Epochen „durchsickern“ (Test: Änderung der Zukunft ändert die Vergangenheit nicht).

| Filter | Formel / Verhalten | Parameter |
|---|---|---|
| `none` | Durchreichen | – |
| `moving-average` | Mittel der letzten `window` Werte (trailing) | `window` |
| `ema` | `x ← x + α (z − x)`, Start = erster Wert | `alpha` |
| `median` | Median der letzten `window` Werte | `window` |
| `trimmed-mean` | letzte `window` Werte; ab 5 Werten kleinsten und größten streichen, Rest mitteln (iOS-ähnlich) | `window` |
| `kalman` | Skalar, Random-Walk: `P ← P + q`, `K = P/(P + r)`, `x ← x + K (z − x)`, `P ← (1 − K) P`; Start `x = z₀`, `P = r` | `kalmanQ`, `kalmanR` (dB²) |

**Hampel** (`hampel(values, window, k)`): markiert Ausreißer als `|x − Median| > k · max(1,4826 · MAD, 1 dB)` und ersetzt sie durch den
Fenstermedian. Das Fenster ist **zentriert** (nutzt auch Zukunftswerte) – gedacht für die **Offline-Bereinigung** aufgezeichneter Läufe, nicht
streng echtzeitfähig. Die Untergrenze von 1 dB verhindert, dass bei ganzzahligen RSSI-Werten (MAD = 0) jedes Wackeln markiert wird. Standard: aus.

`filterSamplesPerBeacon` gruppiert nach `beaconId`, sortiert nach `t`, wendet optional Hampel und danach den Filter an und liefert **neue**
Sample-Objekte (Rohdaten bleiben unverändert). Samples mit nicht-endlichem `t`/`rssi` werden verworfen.

## 2. Epochen (`epochs.ts`)

Epochenzeiten `t_k = t0 + k · stepSec` (t0 = erstes Sample) bis zum letzten Sample. Je Beacon und Epoche:

- Beacon ist **abwesend**, wenn sein letztes Sample (mit `t' ≤ t`) älter als `staleSec` ist oder es noch keines gab.
- **Filter ≠ none:** Wert = **letzter gefilterter Wert**. Der Filter hat bereits kausal geglättet; erneutes Mitteln würde doppelt glätten und
  Verzögerung erzeugen.
- **Filter = none:** Wert = **Mittel der Rohwerte** in `(t − windowSec, t]`. Ist das Fenster leer, der Beacon aber nicht „stale“, wird der letzte
  Wert gehalten.
- `rssiThreshold` und `topK` werden **nicht** hier, sondern im Algorithmus angewandt. Epochen ohne Beacon werden trotzdem erzeugt (Lücken zählen
  gegen die Verfügbarkeit).

## 3. Gemeinsame Vorverarbeitung der Algorithmen

Vor jeder Berechnung: nicht-endliche RSSI verwerfen; `rssi < rssiThreshold` verwerfen; Beacons verwerfen, die unbekannt (nicht in
`ctx.beacons`), deaktiviert oder ohne endliche Position sind; je Beacon eine Beobachtung; dann die `topK` stärksten (0 = alle). Reihenfolge
deterministisch: RSSI absteigend, bei Gleichstand `beaconId` aufsteigend. Mindestanzahl = `max(Algorithmus-Minimum, params.minBeacons)`;
Fehlgrund z. B. `zu wenige Beacons (2 < 3)`.

## 4. Stärkster Beacon (`strongest-beacon`)

- **Idee:** Nähe-Verfahren – Position des Beacons mit höchstem RSSI.
- **Formel:** `pos = pos(argmax_i rssi_i)`; bei Gleichstand der Beacon mit der **kleinsten `beaconId`** (deterministisch, Textvergleich).
- **Voraussetzungen:** ≥ 1 Beacon. Keine Kalibrierung.
- **Fehlerbilder:** Ergebnis springt zwischen Beacons (diskrete Positionen); Fehler ≥ Abstand zum nächsten Beacon-Gitterpunkt; empfindlich gegen
  Abschattung des nächsten Beacons.
- **iOS-Bezug:** Kein direktes Pendant; dient als einfachste Referenzlinie.

## 5. Gewichteter Schwerpunkt (`weighted-centroid`)

- **Idee:** Schwerpunkt der Beacon-Positionen, gewichtet mit der **linearen Empfangsleistung** hoch `g`.
- **Formel:** `p_i = 10^(rssi_i/10)` (mW), `w_i = p_i^g`, `pos = Σ w_i · pos_i / Σ w_i`, `g = weightExponent ≥ 0`.
  Numerisch stabil als `w_i = 10^(g (rssi_i − rssi_max)/10)` (nach Normierung identisch).
- **Physikalische Begründung:** `p ∝ d^(−n)`, also `w ∝ d^(−n·g)`. `g = 1/n` entspricht Inverse-Distanz-Gewichtung, `g = 1` Leistungsgewichtung (stark
  nahe-dominiert), `g = 0` dem ungewichteten Schwerpunkt. Gleiche RSSI ⇒ Schwerpunkt der Beacons; ein dominanter Beacon ⇒ Position nahe diesem Beacon.
  Wahl des Standards `g = 1` ist eine **Annahme** (Default des Labs), keine kalibrierte Größe.
- **Voraussetzungen:** ≥ 1 Beacon, kein Pfadverlustmodell nötig.
- **Fehlerbilder:** Schwerpunkt liegt immer in der konvexen Hülle der Beacons – Positionen am Rand/außerhalb werden systematisch zur Mitte gezogen
  (Randbias); asymmetrische Beacon-Verteilung verzerrt.
- **iOS-Bezug:** `BeaconPositionSolver.swift` nutzt einen Schwerpunkt mit Gewicht `quality · 1/max(0,35, d) · Frische` nur als **Startwert**.
  Die Lab-Gewichtung (Leistung hoch g) ist bewusst anders und rein RSSI-basiert.

## 6. Trilateration (`trilateration`)

- **Idee:** Distanzen aus dem Pfadverlustmodell, dann robuste nichtlineare Ausgleichsrechnung.
- **Pfadverlust:** `d_m = 10^((A − rssi)/(10 n))` mit `A = rssiAt1m`; `n = pathLossExponent`. Es gilt das Modell des Beacons (`beacon.pathLoss`), sonst das der Kampagne.
  `d_m` wird auf `[distanceClampMinM, distanceClampMaxM]` (Standard 0,35 … 11 m) begrenzt (sehr schwache RSSI ⇒ riesige Distanzen, nicht ungeklammert verwendbar)
  und mit `metersPerUnit` in LE umgerechnet.
- **Optimierung:** Minimiere `Σ w_i ρ(|x − a_i| − d_i)` mit Huber-ρ (`δ = huberDeltaM / metersPerUnit`; `huberDeltaM = 0` ⇒ Summe der Fehlerquadrate)
  und statischem Gewicht `w_i = 1 / max(d_m, 0,4)` (der Distanzfehler wächst mit der Distanz). Levenberg-Marquardt/IRLS, höchstens **20 Iterationen**
  insgesamt; bei aktivem Huber zuerst 6 Iterationen quadratisch (Aufwärmen), dann Huber. Nur kostensenkende Schritte werden akzeptiert.
  Startwert: Inverse-Distanz-Schwerpunkt.
- **Voraussetzungen:** ≥ 3 Beacons **und** nicht-kollineare Geometrie: `sqrt(λ₂/λ₁)` der Streuung der Beacon-Positionen < 0,01 ⇒
  Fehlschlag `degenerierte Geometrie (Beacons kollinear)` (bei Kollinearität ist die Lösung wegen der Spiegelung mehrdeutig). Gültiger Maßstab (`metersPerUnit > 0`).
- **Fehlschläge:** zu wenige Beacons, kollinear, ungültiges Modell/Maßstab, NaN, nicht konvergiert (20 Iterationen).
  Es wird **nicht** auf den Grundriss geklemmt – Positionen außerhalb sind ein sichtbares Symptom.
- **Annahmen:** log-distance-Modell mit einem Exponenten für den ganzen Markt; Fehler unabhängig zwischen Beacons; Gewichtung `1/d`. Regale, Körperabschattung,
  Mehrwegeausbreitung verletzen das – daher die Fehlerverteilung (Ausreißer) und `Huber`.
- **iOS-Bezug:** `BeaconPositionSolver.swift` (Schwerpunkt-Startwert, ≤ 10 gedämpfte Gauss-Newton-Schritte, Huber-Gewicht mit δ = 0,85 m, behält den Schwerpunkt, wenn er besser passt;
  min. 3 Beacons), `PositioningPipeline.swift` (`rssiDistance`: `10^((tx − rssi)/(10 n))`, n = 2,8, tx = −72, Klemmung 0,35–11 m),
  `StabilizedNavigationConfig.swift`. **Unterschiede:** Lab nutzt LM statt fester Dämpfung 0,55, kein Klemmen auf Grundrissgrenzen, keine
  Qualitäts-/Frische-Gewichte, keine Konfidenz. Das Lab bildet die iOS-App also **nicht 1:1** nach, sondern deren Prinzip.
- **Kalibrierung:** `calibrateFromRuns` (`pathloss.ts`) passt `A` und `n` per OLS `rssi = A − 10 n log10(d)` an (≥ 10 Paare, ≥ 2 verschiedene Distanzen, `d ≥ 0,1 m`),
  global und je Beacon; nur aus Läufen mit `role = "calibration"` und Haltepunkten (siehe `METRICS.md`/Referenz). Ergebnis enthält `r2`, `residualStdDb`, `sampleCount`.
  Warnung, wenn der Maßstab unbestätigt ist (Meter beruhen dann auf der Konvention).

## 7. kNN-Fingerprinting (`knn-fingerprint`)

- **Idee:** Vergleich des aktuellen RSSI-Vektors mit Kalibrier-Fingerprints im Signalraum.
- **Fingerprints** (`fingerprint.ts`): je stationärem Haltepunkt eines **Kalibrierungslaufs** ein Eintrag: Haltepunkt-Position und **Median** der (gefilterten) RSSI je Beacon
  im Halt (mind. 3 Samples je Beacon). `LeakageError`, wenn ein Lauf nicht `calibration` ist.
- **Distanz:** euklidisch in dBm über die Vereinigung der Beacons (beobachtete nach Schwelle/topK plus Fingerprint-Beacons, die bekannt und aktiv sind);
  fehlender Beacon ⇒ `knnMissingRssi` (Standard −105 dBm).
- **Schätzung:** gewichtetes Mittel der Positionen der `k` nächsten Fingerprints, `w_j = 1/(dist_j + 10⁻³)`.
- **Voraussetzungen:** Fingerprints aus Kalibrierungsläufen; sonst Fehlschlag `keine Fingerprints …`.
- **Fehlerbilder:** nur so dicht wie die Kalibrierpunkte; Positionen liegen in der Hülle der Fingerprints; Gerätewechsel/Umbau/Personendichte ändern das Signalbild
  (Fingerprints veralten); Annahme `knnMissingRssi` bestimmt, wie stark „nicht gehört“ bestraft wird.
- **iOS-Bezug:** Kein Pendant in der App – reiner Lab-Vergleichsansatz.

## 8. Zeitlicher Filter (`temporal.ts`)

Wirkt auf Positionen. **Fehlschläge bleiben `null`** – es wird nie die letzte Position gehalten oder fortgeschrieben (das würde Verfügbarkeit vortäuschen).

- **Reset-Politik:** Ein Fehlschlag **und** eine Zeitlücke > 3 × (Median-Epochenabstand) setzen den kompletten Filterzustand zurück; die nächste gültige Position startet frisch
  (Ausgabe = Eingabe). Begründung: Nach einem unbeobachteten Intervall ist der alte Zustand veraltet.
- **`ema`:** `p ← p + α (z − p)`.
- **`kalman`:** Konstante-Geschwindigkeit, Zustand (x, y, vx, vy), Beschleunigungs-Std `kalmanAccelStd` (m/s²), Messrauschen `kalmanMeasStd` (m), beides mit `metersPerUnit`
  in LE umgerechnet; `dt` aus den Zeitstempeln; Anfangs-Geschwindigkeitsprior 1 m/s. Implementiert als zwei entkoppelte Zwei-Zustands-Filter (x und y sind im Modell unabhängig).
  Das Ergebnis ist maßstabsinvariant (alle Rauschgrößen skalieren mit).
- **Geschwindigkeits-Gate (`maxSpeedMps > 0`):** Übersteigt die implizite Geschwindigkeit seit der letzten **akzeptierten** Position `maxSpeed`, wird der Schritt auf
  `maxSpeed · dt` **entlang der Richtung begrenzt** (nicht verworfen). Eine echte, anhaltende Verschiebung wird so mit höchstens `maxSpeed` nachgeführt. Das Gate wirkt **vor** der Glättung.
- **iOS-Bezug:** `PoseFusionService.swift`: Sprung-Gate `2,5 m/s · dt + 0,85 m` Marge (dort wird der Punkt **gehalten** und nach 3 Bestätigungen akzeptiert; im Lab wird dagegen begrenzt),
  EMA mit `α = 0,18 + 0,28 · Konfidenz`. Das Lab hat keine Konfidenz; `α` ist ein fester Parameter. **Annahme:** Die iOS-Werte sind laut Quelltext „provisional“.

## 9. Datenleck-Schutz (Leakage)

- Kalibrierung (`calibrateFromRuns`) und Fingerprints (`buildFingerprints`) akzeptieren nur `role = "calibration"` – sonst `LeakageError`.
- `runPositioning` wirft `LeakageError`, wenn der auszuwertende Lauf `calibration` ist, wenn ein übergebener Kalibrierlauf `evaluation` ist oder dieselbe `id` trägt.
- Kausale Filter verhindern, dass Zukunftswerte in frühere Epochen einfließen (Ausnahme: dokumentiertes zentriertes Hampel, standardmäßig aus).

## 10. Bekannte Grenzen

- Ein Pfadverlustmodell für den ganzen Markt; kein Mehrwege-/Körpermodell.
- RSSI-Werte hängen vom Gerät (Antenne, Firmware) ab – Kalibrierung gilt nur für das verwendete Gerät.
- Kein Karten-/Walkability-Constraint (Positionen können in Regalen/außerhalb liegen).
- iOS-Parameter sind nicht feldkalibriert; iOS filtert **Distanzen** per Kalman (`BeaconMeasurementStore.swift`, Q = 0,02, R = 4,0 im Distanzraum), das Lab filtert **RSSI in dB** –
  die Parameter `kalmanQ`/`kalmanR` sind deshalb nicht direkt vergleichbar.
