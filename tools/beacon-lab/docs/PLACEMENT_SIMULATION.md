# Platzierungssimulation (Modellprognose)

Seite „Platzierung (Simulation)“ (`src/ui/pages/PlanningPage.tsx`, Rechenkern `src/planning/`).

> **MODELLPROGNOSE – keine Messung.** Alles, was diese Seite zeigt, stammt aus einem vereinfachten Signalmodell.
> Es werden keine Messdaten gelesen, und die Prognose wird nie als Messlauf oder Ergebnis gespeichert. Die Seite
> zeigt das Banner dauerhaft; Tooltips, Legenden und Zusammenfassung sind ausdrücklich als Prognose beschriftet.

## Zweck

Vor der Installation abschätzen, **wo** die Positionierung bei einer gegebenen Beacon-Anordnung schwach wird
(zu wenige hörbare Beacons, schlechte Geometrie, große Fehler), und Anordnungen miteinander vergleichen. Das ersetzt
keine Messung vor Ort, sondern hilft, Kandidaten für die Messung auszuwählen.

## Modell

1. **Begehbares Raster** (`walkable.ts`): Der Plan wird in Zellen (Standard 1 LE) geteilt. Eine Zelle zählt als
   begehbar, wenn ihr Mittelpunkt im Plan liegt und in **keinem** blockierenden Element (Regal, Kasse, Wand,
   Kühlregal, Tiefkühler, Theke) liegt. Elemente dürfen gedreht sein (Drehung im Uhrzeigersinn um den Mittelpunkt).
   Eingang, Anker und „Sonstiges“ blockieren nicht. Teilweise überdeckte Zellen zählen nach ihrem Mittelpunkt.
2. **Signal** (`simulate.ts`): Je Zelle, Epoche (K Stück) und aktivem Beacon
   `RSSI = A − 10·n·log10(d_m) − P·c + N(0, σ)`.
   `d_m` = Abstand in Metern (`scale.metersPerUnit`, mindestens 0,1 m), `P` = Hindernisdämpfung, `c` = Anzahl
   blockierender Elemente, die die Strecke Zelle→Beacon schneiden (Beacons, die selbst in einem Element sitzen, zählen
   dieses nicht). Das Rauschen ist unabhängig je (Zelle, Epoche, Beacon).
3. **Hörbarkeit**: Signale unter `max(Empfindlichkeit, RSSI-Schwelle des Verfahrens)` werden verworfen.
4. **Schätzung**: Das gewählte Verfahren aus `ALGORITHMS[...]` (Stärkster Beacon, Gewichteter Schwerpunkt,
   Trilateration) läuft auf genau dieser einen Epoche. **Kein** RSSI- und **kein** Zeitfilter. Das Verfahren kennt das
   Modell (A, n) – die Prognose geht also von einem *richtig kalibrierten* Pfadverlustmodell aus. kNN-Fingerprinting
   entfällt, weil es Kalibrierläufe braucht.
5. **Fehler**: Abstand Schätzung ↔ Zellmittelpunkt in LE (bei bestätigtem Maßstab Anzeige in m).

### Kennzahlen je Zelle

| Größe | Definition |
|---|---|
| Medianfehler | Median der Fehler über erfolgreiche Epochen; leer, wenn alle Epochen scheitern |
| P90-Fehler | 90. Perzentil (Typ 7, wie `positioning/stats.ts`) |
| Ausfallrate | Anteil Epochen ohne Schätzung (zu wenige hörbare Beacons oder Verfahren scheitert) |
| Hörbare Beacons | Mittel über die Epochen |
| HDOP (2D) | Median über Epochen mit ≥ 3 hörbaren Beacons: aus den Einheitsvektoren Zelle→Beacon, `sqrt(tr((HᵀH)⁻¹))`; 1 = ideal, 99 = kollinear/entartet; leer bei < 3 Beacons |

### Determinismus und Vergleichbarkeit

Das Rauschen wird aus einem Hash von (Seed, Zelle, Epoche, Beacon-ID) mit mulberry32 gezogen. Folgen:
gleicher Seed → identisches Ergebnis (unabhängig von Chunking und Stride); eine Layout-Änderung verwendet für alle
unveränderten Beacons **dieselben** Zufallszahlen („common random numbers“). Unterschiede A↔B sind deshalb
Layout-Effekte und kein Würfelglück. Beacon-IDs sind Teil des Hashs: Umbenennen ändert das Rauschen.

## Annahmen und Vereinfachungen

- **Keine Mehrwegeausbreitung** (Reflexionen, Fading mit räumlicher Struktur) und **keine Körperabschattung**
  (Kunden, Einkaufswagen, Personal).
- **Wände und Regale** wirken nur über eine **optionale konstante Dämpfung** je durchquertem Element
  (Standard 0 dB = aus). Es gibt keine Materialunterschiede, keine Beugung um Ecken, keine Höhenmodelle.
  Aktivieren Sie die Dämpfung nur mit einer begründeten Zahl (z. B. aus einer Vergleichsmessung).
- **Schattierung** ist je Epoche unabhängig. Reale Schattierung ist räumlich korreliert und über Zeit teils konstant
  (ein „schlechter Fleck“ bleibt schlecht); die Prognose unterschätzt dadurch tendenziell die Streuung zwischen Zellen
  und überschätzt den Nutzen von Mittelung.
- **Ein** Modell für alle Beacons (eigene Pfadverlustmodelle einzelner Beacons werden ignoriert), gleiche
  Sendeleistung, Empfänger isotrop.
- Position = Zellmittelpunkt; keine Bewegung, kein Tracking, keine Filter.
- Maßstab: Ist `scale.confirmed` falsch, werden Abstände mit `metersPerUnit` (Standard 1) gerechnet, aber **nur in LE**
  ausgegeben und mit Warnung versehen (App-Richtlinie).
- Die Hörbarkeitsgrenze ist hart (kein Paketverlust-Modell, keine Advertising-Intervalle).

## Parameter

| Parameter | Standard | Bemerkung |
|---|---|---|
| A (RSSI @ 1 m) | aus `campaign.pathLoss`, sonst −72 dBm | bei nicht angepasstem Modell Warnung „unkalibriert“ |
| n | aus `campaign.pathLoss`, sonst 2,8 | |
| σ | 3 dB | Streuung je Epoche; reale Märkte oft 3–8 dB |
| Empfindlichkeit | −100 dBm | wie `docs/SYNTHETIC_DATA.md` |
| Hindernis-Dämpfung | 0 dB | siehe oben |
| K | 30 | Epochen je Zelle |
| Stride | 1 | nur jede n-te Zelle (Darstellung dann gröber) |
| Seed | 1 | |
| Rasterweite | 1 LE | |
| Verfahren + Parameter | Gewichteter Schwerpunkt, Standard-Parameter | RSSI-Schwelle, Top-K, Min. Beacons, g bzw. Huber δ |

## Ausgaben

- **Karte** mit Zellen für Medianfehler, P90, Ausfallrate, hörbare Beacons oder HDOP (schraffiert = keine Schätzung),
  wahlweise Variante A, Variante B oder **Δ Medianfehler (B − A)** (teal = B besser, rot = B schlechter).
- **Zusammenfassung** (StatTiles): Anteil begehbarer Zellen mit Median ≤ 2 / 3 / 5 (m bzw. LE; Zellen ohne
  Schätzung zählen als „nicht erfüllt“), Ø hörbare Beacons, Zellen mit < 3 Beacons, Median der Zellmediane,
  schlechteste 10 % (mittlerer Medianfehler, Schwerpunkt, optionale Markierung auf der Karte). Bei bearbeiteter
  Variante B steht die Differenz zu A dabei.
- **Vorschlag**: siehe unten. **Export**: CSV der Variante B.

## Varianten und Vorschlag

- **Variante A** = Beacons der Kampagne (nur gelesen). **Variante B** = bearbeitbare Kopie: Beacon per Klick setzen
  („Beacon setzen“), wählen, per Koordinatenfeld oder Klick („Verschieben“) bewegen, deaktivieren, entfernen.
  Geplante Beacons heißen `PLAN-1`, `PLAN-2`, …
- **Vorschlag berechnen** (`variants.ts`, Heuristik): Kandidaten sind begehbare Zellen neben blockierenden Elementen
  oder am Planrand, mindestens 1,5 LE von bestehenden Beacons, gleichmäßig auf höchstens 24 ausgedünnt. Für jeden
  wird **ein** zusätzlicher Beacon simuliert (reduziert: K = 12, Stride ≥ 2, für Basis und Kandidat gleich) und nach
  der gewählten Zielfunktion bewertet (Anteil Median ≤ 3 maximieren, oder Fehler in den schlechtesten 10 % senken).
  Gieriger Einzelschritt: kein globales Optimum, keine Rücksicht auf Montagemöglichkeiten, Strom oder Kosten. Die
  Top 5 sind eine Vorschau (Klick), **nie** eine automatische Übernahme.
- Das bestehende Planungswerkzeug `scripts/beacon-planner/` (Abdeckungsregel 8 m Radius,
  `readiness/coverage-rule.json`) bleibt die Referenz für die Ausbauplanung; diese Seite bewertet *Positionsqualität*,
  nicht die Abdeckungsregel.

## Übernehmen und Exportieren

- **Variante als Beacon-Liste exportieren**: CSV `minor,x_le,y_le,mount,notes` im Stil des Beacon-Planners, aber
  Koordinaten in **Layout-Einheiten** (nicht Metern), nur aktive Beacons.
- **In Kampagne übernehmen**: nur nach Bestätigungsdialog; schreibt die Beacon-Liste per `saveCampaign`. Vorhandene
  Messläufe, Kalibrierung und gespeicherte Ergebnisse beziehen sich auf die **alte** Anordnung und bleiben unverändert –
  sie passen danach nicht mehr zur Liste. Platzhalter-IDs (`PLAN-…`) müssen vor echten Messungen den IDs der
  installierten Geräte entsprechen. Die Prognose selbst wird nicht gespeichert.

## Anwendung vor der Installation

1. Plan prüfen (Maßstab bestätigen, Regale/Wände vollständig?). Modell aus einer Kalibrierung übernehmen, sonst Werte
   bewusst als Annahme führen.
2. Variante A simulieren, schwache Bereiche (Zellen < 3 Beacons, schlechteste 10 %) ansehen.
3. Variante B bauen oder einen Vorschlag als Vorschau übernehmen, erneut simulieren, Δ-Karte und Zusammenfassung
   vergleichen. Parameter (σ, n, Dämpfung) variieren: Eine Anordnung, die nur bei optimistischen Annahmen gut ist,
   ist riskant.
4. Beacon-Liste exportieren und installieren.

## Später mit Messungen validieren

1. Nach der Installation Kalibrier- und Evaluationsläufe aufnehmen (Messdaten-Seite) und das Pfadverlustmodell
   anpassen.
2. Mit denselben Parametern erneut simulieren, die Fehlerkarte der Prognose (Medianfehler) mit der gemessenen
   Fehler-Heatmap (Seite Heatmaps, Fehler je Position, Modus „Zellen“, gleiche Rasterweite) vergleichen: räumliche
   Muster (wo schwach/stark) und Größenordnung, nicht Einzelwerte.
3. Weicht die Prognose systematisch ab (z. B. überall zu optimistisch), σ erhöhen, die Hindernisdämpfung anpassen und
   erneut vergleichen. Erst eine bestätigte Übereinstimmung rechtfertigt, Prognosen für weitere Märkte zu nutzen.

## Grenzen

- Die Prognose ist so gut wie ihre Annahmen; ohne Messung ist sie eine begründete Schätzung, kein Nachweis.
- Absolute Fehlerwerte sind unsicher (Mehrweg, Körperabschattung, Hardware-Streuung). Vergleiche zwischen Varianten
  bei gleichen Annahmen sind belastbarer als die absolute Zahl.
- Der Vorschlag ist eine Heuristik mit reduzierter Simulation und kann bessere Positionen übersehen.
- Rechenzeit: Der Kern läuft im Hauptthread in Chunks (`setTimeout`), kein Web Worker. Gemessen (Node, Entwicklungsrechner): 30×20 Plan,
  600 Zellen, K = 30, Gewichteter Schwerpunkt ≈ 0,1 s; Demo-Markt Trilateration ≈ 0,16 s. Sehr große Pläne oder kleine
  Rasterweiten: Stride erhöhen oder K senken.
