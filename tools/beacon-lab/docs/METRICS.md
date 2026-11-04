# Metriken – Indooro Positioning Lab

Implementierung: `src/positioning/metrics.ts`, Referenzen: `src/positioning/reference.ts`. Alle Funktionen sind rein.

## Einheiten-Politik

- Intern rechnen alle Positionen in **Layout-Einheiten (LE)**.
- Ausgegeben werden Distanzen über `toDisplayDistance`: **Meter nur bei `scale.confirmed === true`**, sonst bleibt der Wert in **LE** und `unit = "LE"`.
- Die Schwellen `within2/3/5` gelten **in der Anzeigeeinheit**. Bei unbestätigtem Maßstab bedeutet „within2“ daher **2 LE**, nicht 2 m. Dasselbe gilt für die
  Sprunggeschwindigkeit (`jumpSpeedMps`, Standard 2): bei LE ist es 2 LE/s.
- Die Pipeline fügt bei unbestätigtem Maßstab eine Warnung hinzu.

## Referenz (Ground Truth)

- **Haltepunkt (Hold):** ≥ 2 **aufeinanderfolgende** Referenzpunkte mit identischer Position (|Δ| < 10⁻⁶ LE) ⇒ Gerät stand im Intervall [t_erster, t_letzter] still.
  Konvention der Messprotokolle. Ein stationärer Lauf mit genau einem Referenzpunkt wird als Halt über die gesamte Sample-Dauer behandelt (Warnung).
- `hold-or-nearest`: innerhalb eines Halts → Haltposition; sonst nächster Referenzpunkt innerhalb `toleranceSec` → dessen Position; sonst keine Referenz (Epoche zählt nicht).
- `interpolate`: innerhalb eines Halts → Haltposition; zwischen zwei Referenzpunkten **linear interpoliert**; außerhalb des Referenzbereichs keine Referenz.
  **Annahme: konstante Gehgeschwindigkeit** auf der Geraden zwischen zwei Referenzpunkten. Die interpolierte Referenz ist selbst unsicher (Kurven, Stehenbleiben);
  Fehler bis zu dieser Unsicherheit sind nicht dem Verfahren anzulasten.

## Fehlermetriken (`ErrorMetrics`)

Fehler einer Epoche: `e = |Position − Truth|` (euklidisch, in Anzeigeeinheit). **Position = Endposition nach zeitlichem Filter.**

| Größe | Definition | Nenner |
|---|---|---|
| `epochsWithTruth` | Epochen mit Referenz | – |
| `validEstimates` | davon mit Positionsschätzung | – |
| `failedEstimates` | `epochsWithTruth − validEstimates` | – |
| `failureRate` | `failed / epochsWithTruth` | `epochsWithTruth` |
| `mean`, `median`, `max` | über gültige Schätzungen | `validEstimates` (bedingt) |
| `rmse` | `sqrt(Σ e² / validEstimates)` | `validEstimates` (bedingt) |
| `p90`, `p95` | Perzentil, siehe unten | `validEstimates` (bedingt) |
| `within2/3/5` | Anteil gültiger Schätzungen mit `e ≤ Schwelle` | **`epochsWithTruth`** (Gesamtsicht) |

**Fehlschlag-Politik:** Fehlschläge (keine Position) zählen in `failureRate` und bei `within*` als „nicht innerhalb“. Sie fließen **nicht** in mean/median/rmse/p90/p95/max ein
(dort steht der Fehler gar nicht zur Verfügung). Wer nur „mean“ vergleicht, übersieht daher, dass ein Verfahren in schwierigen Epochen ausfällt
(Survivorship-Bias) – immer `failureRate` und `within*` mitlesen. Bei `epochsWithTruth = 0` sind alle Kennzahlen `null` und `failureRate = 0` (dann ist `epochsWithTruth` zu prüfen).

**Perzentildefinition:** lineare Interpolation zwischen Ordnungsstatistiken (Hyndman-Fan **Typ 7**, NumPy-Standard, Excel `PERCENTILE.INC`):
`h = (n − 1) · p/100`, `x = x[⌊h⌋] + (h − ⌊h⌋)(x[⌊h⌋+1] − x[⌊h⌋])`. Beispiel: Fehler [1,2,3,4] ⇒ Mittel 2,5; Median 2,5; RMSE √7,5; P90 = 3,7; P95 = 3,85.

**Fehler-CDF** (`errorCdf`): sortierte Fehler, `p = Rang / epochsWithTruth` – gleicher Nenner wie `within*`, die Kurve endet also bei `1 − failureRate`.

## Dynamische Metriken (`DynamicMetrics`)

Berechnet auf den Endpositionen (nach zeitlichem Filter), unabhängig davon, ob Referenz vorliegt.

- **Paare:** aufeinanderfolgende gültige Schätzungen (Fehlschläge dazwischen werden übersprungen) mit `0 < dt ≤ maxGapSec` (Standard 2 s). Größere Lücken zählen nicht.
- **Sprung:** Geschwindigkeit `Schritt/dt > jumpSpeedMps` (Standard 2, in Anzeigeeinheit pro Sekunde). `jumpRate = Sprünge / Paare`; `meanStepDistance` = mittlere Schrittlänge der Paare.
  Hinweis: Echte Gehgeschwindigkeit liegt meist bei ≈ 1–1,5 m/s; 2 ist eine **Annahme** für „unplausibel“, kein Messwert.
- **Lag (`lagSec`):** nur für **Walk-Läufe mit interpolierter Referenz**. Suche `τ ∈ [−3, 3] s` (Schritt 0,1 s), das `mean |est(t) − truth(t − τ)|` minimiert. `τ > 0` heißt: die Schätzung
  hinkt der Wirklichkeit um τ hinterher. Es wird eine feste Menge von Schätzungen verwendet (jene, deren `t − τ` für alle τ im Referenzbereich liegt); `null`, wenn < 10 Punkte oder die Referenz sich nicht bewegt.
  Auflösung 0,1 s; setzt die Interpolationsannahme voraus.
- **Stationäre Präzision (`stationaryPrecision`):** je Halt (mit ≥ 2 Schätzungen) Schwerpunkt der Schätzungen; gepoolter **RMS-Abstand** der Schätzungen zu ihrem eigenen Schwerpunkt
  (Nenner = Anzahl Punkte, leichte Unterschätzung bei kleinen n).
- **Stationärer Bias (`stationaryBias`):** mittlerer Abstand Schwerpunkt → Haltposition über diese Halte.

## Präzision ≠ Genauigkeit, Glättung ≠ Genauigkeit

- **Genauigkeit (Accuracy)** = Nähe zur Wahrheit (mean/median/rmse/P95/Bias). **Präzision (Precision)** = Streuung um den eigenen Schwerpunkt (Wiederholbarkeit). Ein Verfahren kann sehr präzise
  und trotzdem falsch sein (großer Bias, z. B. falsches Pfadverlustmodell oder falscher Maßstab). Deshalb werden `stationaryPrecision` und `stationaryBias` getrennt ausgewiesen.
- **Glättung ≠ Genauigkeit:** EMA/Kalman/Geschwindigkeits-Gate reduzieren Sprünge und Streuung (bessere Präzision, weniger `jumpRate`), erzeugen aber Verzögerung (`lagSec`) und können den Bias oder
  den Fehler in Bewegung erhöhen. Eine ruhigere Spur ist **nicht** automatisch eine genauere. Bewertung immer gemeinsam: Fehler, `failureRate`, Lag, Sprungrate. Die Pipeline weist bei aktivem zeitlichen Filter darauf hin.

## Vergleiche zwischen Verfahren (`compareAlgorithms`)

Zusätzlich zu den Einzel-Metriken werden `common`-Metriken berechnet, beschränkt auf Epochen (gleiches `t`), in denen **alle** Konfigurationen eine gültige Schätzung **und** Referenz hatten
(`commonEpochs`). So wird verhindert, dass ein Verfahren besser aussieht, weil es schwierige Epochen auslässt. Auf der gemeinsamen Menge ist `failureRate = 0` (per Konstruktion); die Einzel-Metriken
bleiben daneben maßgeblich für die Verfügbarkeit. Vergleiche nur mit gleichem `stepSec` (sonst gibt es kaum identische Zeitpunkte).

## Mindeststichproben (Orientierung, keine Garantie)

- **P95 braucht ≥ 100 gültige Schätzungen**; P90 ≥ 50 als Faustregel. Darunter ist die Perzentilschätzung von Einzelwerten dominiert. Die Pipeline warnt unter 100 ausgewerteten Epochen mit „explorativ“.
- **Epochen eines Laufs sind autokorreliert** (benachbarte Sekunden sind fast dieselbe Messung). 1800 Epochen eines Laufs sind nicht 1800 unabhängige Beobachtungen.
- **≥ 3 Läufe pro Bedingung** (Standort/Gerät/Tageszeit/Personendichte) für belastbare Aussagen; weniger ⇒ **explorativ**. Aussagen über „Verfahren A ist besser als B“ benötigen wiederholte Läufe,
  unterschiedliche Pfade und idealerweise Unsicherheitsintervalle (z. B. Bootstrap über Läufe, nicht über Epochen).
- **Synthetische Daten** belegen die Funktion der Software und das Verhalten unter *angenommenen* Störungen – keine Aussage über reale Hardware (`origin` wird mitgeführt).
- **Stationäre Läufe** sagen wenig über Gehen aus (Dynamik, Verzögerung); **Walk-Läufe mit interpolierter Referenz** sind durch die Referenz selbst unsicher.

## Warnungen der Pipeline (Auswahl)

Unkalibriertes/manuelles Pfadverlustmodell (nur Verfahren, die es nutzen), unbestätigter Maßstab, keine Referenzpunkte, < 100 ausgewertete Epochen („explorativ“), synthetische Daten,
Interpolations-Annahme, unbekannte Beacon-IDs im Lauf, aktive zeitliche Glättung, fehlende Fingerprints.
