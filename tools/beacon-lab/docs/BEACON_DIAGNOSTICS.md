# Beacon-Diagnose

Die Seite „Beacon-Diagnose“ beantwortet aus **gemessenen Daten**: Welche Beacons sind ungünstig positioniert, still oder falsch eingetragen? Sie liefert **Hinweise mit Zahlen**, keine Urteile. Implementierung: `src/positioning/diagnostics.ts`, Oberfläche: `src/ui/pages/BeaconDiagnosticsPage.tsx`. Alle Funktionen sind rein und deterministisch.

Fehler- und Distanzangaben stehen in Metern, wenn der Maßstab bestätigt ist, sonst in Layout-Einheiten (LE). Synthetische Läufe sind überall gekennzeichnet; ihre Ergebnisse gelten nur für die Simulation.

## 1. Leave-one-out (`beaconLeaveOneOut`)

**Frage:** Wie viel trägt jeder Beacon zur Genauigkeit bei?

Ablauf: Baseline-Auswertung des gewählten Auswertungslaufs mit der gewählten Konfiguration. Danach je aktivem Beacon eine weitere Auswertung mit einer **Kopie** der Kampagne, in der dieser Beacon deaktiviert ist (die Kampagne wird nie verändert).

| Größe | Definition | Lesart |
|---|---|---|
| Δ Median | Median ohne Beacon − Median Baseline | positiv: Beacon hilft; negativ: ohne ihn besser |
| Δ P95 | P95 ohne − P95 Baseline | wie oben |
| Δ Ausfallrate | Ausfallrate ohne − Baseline (Prozentpunkte) | positiv: mehr Fehlschläge ohne den Beacon |
| Epochen mit Beacon | Epochen, in denen der Beacon Eingang des Verfahrens war | Gewicht in diesem Lauf |

Nur Auswertungsläufe: Die üblichen Leckage-Regeln von `runPositioning` gelten (ein Kalibrierungslauf wird mit `LeakageError` abgelehnt).

**Befunde (nur Hinweis, Stufe „Hinweis“):**
- *schädlich?* Median sinkt ohne den Beacon um mehr als 5 % der Baseline.
- *kritisch:* P95 steigt um mehr als 20 % oder die Ausfallrate um mindestens 5 Prozentpunkte.
- Beides nur bei mindestens 100 Epochen mit Referenz.

**Grenzen:** Gilt nur für diesen Lauf, diesen Algorithmus und diese Parameter (Filter, Pfadverlustmodell, Fingerprints). Ein Beacon, der mit Weighted Centroid „stört“, kann bei Trilateration wichtig sein. Ein einzelner Lauf ist keine Stichprobe über den Markt.

## 2. Residuen (`beaconResiduals`)

**Frage:** Passt der gemessene RSSI zum Modell an der eingetragenen Position?

Für jedes Roh-Sample in einem stationären Haltepunkt (siehe `runHolds`):

```
Residuum = RSSI_gemessen − RSSI_Modell(d)
RSSI_Modell(d) = A − 10·n·log10(d)       d = |Beacon − Halt| · Meter/LE, mindestens 0,1 m
```

Modell je Beacon: `beacon.pathLoss`, sonst Kampagnenmodell. Je Beacon: Mittelwert (Bias), Standardabweichung, n, Mittelwert je Haltepunkt. Es wird nichts angepasst; daher dürfen auch Auswertungsläufe betrachtet werden – **rein diagnostisch**, die Ergebnisse dürfen nicht in ein Modell zurückfließen, das auf demselben Lauf bewertet wird.

Einbezogen werden nur Beacon-Halt-Paare bis 10 m und Samples ≥ −100 dBm. Ferne Beacons werden vom Empfänger nur bei günstiger Ausbreitung gehört (Zensierung, siehe `ALGORITHMS.md`); ihr Mittelwert wäre systematisch zu hoch.

**Schwellen (konfigurierbar):**
- *Systematische Abweichung:* |Bias| > 6 dB (mindestens 30 Samples und 3 Haltepunkte).
- *Standortabhängige Abweichung:* mindestens die Hälfte der Haltepunkte weicht um mehr als 6 dB ab (typisch bei falsch eingetragener Position, denn dann wechselt die Abweichung mit dem Standort).
- *Gemeinsamer Offset:* Liegt der Median-Bias aller Beacons selbst über 6 dB, ist das Modell das Problem (z. B. die unkalibrierten Standardwerte −72 dBm / n = 2,8). Einzelbefunde werden dann nur als Hinweis „Modellproblem“ ausgegeben, und die Standortabhängigkeit wird relativ zu diesem Offset beurteilt.

**Mögliche Ursachen (neutral aufgezählt, kein Befund):** Position falsch eingetragen, Abschattung durch Regal/Montage, abweichende TX-Power, Beacon defekt.

## 3. Empfang (`beaconReception`)

**Frage:** Wird ein Beacon gehört, wenn man direkt daneben steht?

Je Beacon und Haltepunkt: Empfangsrate = Samples / Haltedauer (Samples/s) und Distanz. Referenz ist der **Median der Raten aller Paare ≤ 5 m** (mindestens 3 Paare). Ein Haltepunkt ist „still“, wenn die Rate < 10 % der Referenz liegt. Befund *„nicht empfangen obwohl nah“*: mindestens 2 nahe Haltepunkte, davon mindestens die Hälfte still.

Mögliche Ursachen: Batterie leer, Beacon aus, falsche ID-Zuordnung, Abschirmung. Zusätzlich werden IDs aufgelistet, die in den Läufen vorkommen, aber in der Kampagne unbekannt sind (Tippfehler, fremde Beacons, anderer Markt).

## 4. Zusammenfassung (`summarizeBeaconHealth`)

Fasst a–c je Beacon zu Befunden mit Schwere „Warnung“ (Residuen-Befunde und Stille) oder „Hinweis“ (Leave-one-out, Modell-Offset) zusammen, jeweils mit Evidenzzahlen. Es gibt **kein** Etikett „defekt“. Beacons unter den Mindestmengen (30 Samples, 3 Haltepunkte; Empfang: 2 nahe Haltepunkte) erhalten „zu wenige Daten“ statt einer Bewertung.

## Vor Ort prüfen

1. **Position:** Beacon am eingetragenen Punkt? Abstand mit dem Maßband gegen das Layout prüfen (und Maßstab bestätigen).
2. **Batterie/Gerät:** Wird der Beacon mit einer Scanner-App gesehen? Batteriestand, Sendeintervall, TX-Power laut Konfiguration.
3. **Montage:** Höhe, Metall-/Kühlmöbel in der Nähe, Regal zwischen Beacon und Messpunkten.
4. **ID-Zuordnung:** UUID/Major/Minor im Gerät gegen die Kampagne abgleichen.
5. Nach Änderungen **neu messen**; die Diagnose ersetzt keine Messung.

## Grenzen

- Ein Lauf ist keine Wiederholung: Zufall, Mensch im Weg oder Tagesform des Empfängers wirken mit. Mehrere Läufe wählen.
- Das Ergebnis hängt vom Pfadverlustmodell ab; mit unkalibriertem Modell nur relative Unterschiede deuten.
- Leave-one-out hängt vom Algorithmus und von der Konfiguration ab.
- Zensierung durch die Empfangsgrenze kann Mittelwerte und Empfangsraten ferner Beacons verfälschen; deshalb die 10-m-Grenze bei Residuen.
- Schwellen (6 dB, 10 %, 5 m, 30 Samples, 3 Haltepunkte) sind pragmatische Voreinstellungen, keine bewiesenen Grenzwerte.
