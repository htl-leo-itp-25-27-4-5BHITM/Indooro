# Entscheidungsregel: Wird die neue Positionsberechnung eingeschaltet?

Status: **Vorschlag, vom Team zu bestätigen.** Geschrieben am 2026-11-18 (Sprint-Story #195), **bevor eine echte Aufnahme verglichen wurde.** Die einzigen Daten, die es heute gibt, sind die synthetische Fixture `NavigationFixtures/synthetic/`; sie zählt nie.

| Bestätigung durch das Team | |
| --- | --- |
| Bestätigt von / am | (Mensch: Name, Datum eintragen oder Änderungen unten im Änderungsprotokoll festhalten) |

Gehört zu `openspec/changes/compare-positioning-pipelines/`. Werkzeuge: `scripts/field/compare_positioning.sh` (Vergleich je Aufnahme) und `scripts/field/positioning_verdict.py` (wendet diese Regel mechanisch an).

## 1. Frage und Umfang

**Frage:** Soll `PositioningEngine` (Branch `postpilot/ios-architecture`, Flag `IndooroShadowPositioning`, heute in keinem Build an) die bisherige Ortung über `BeaconManager` ersetzen?

Diese Regel beantwortet nur den **Genauigkeits- und Stabilitätsteil** aus dem Replay von Aufnahmen. Sie schaltet nichts ein. Ein „Ja“ heißt: Das Team darf in einem **eigenen Change** vorschlagen, die Engine hinter ihrem Flag einzuschalten. Kein Build, kein Release und keine Konfiguration ändert sich durch diese Regel oder durch den Vergleich.

## 2. Was verglichen wird

Dieselbe Aufnahme (`indooro-recording/2`), dasselbe Layout, dieselben Samples, dieselbe Uhr und dieselbe Aufwärmphase laufen durch zwei Wege:

| Weg | Was es ist |
| --- | --- |
| `current` | Die aktuelle App-Pipeline, so wie `BeaconManager` sie fährt (`PositioningPipeline.tick` alle 0,35 s, angezeigt wird die projizierte Position) |
| `engine` | `PositioningEngine` mit denselben Samples |

Kennzahlen je Weg (Definitionen wie im Positioning Lab, `tools/beacon-lab/docs/METRICS.md`; Einheit Meter, 1 Rasterzelle = 1 m):

| Kennzahl | Definition |
| --- | --- |
| Median, P90, P95 | Positionsfehler über Epochen mit Referenz und Position (Perzentile nach Typ 7) |
| Anteil ≤ 2 / 3 / 5 m | Anteil **aller** Epochen mit Referenz; ein Ausfall zählt als „nicht innerhalb“ |
| Ausfallrate | Epochen mit Referenz, in denen nichts angezeigt wird, geteilt durch Epochen mit Referenz |
| Sprungrate | Anteil aufeinanderfolgender Positionspaare (Abstand ≤ 2 s), deren Geschwindigkeit über 2 m/s liegt. 2 m/s ist eine Annahme für „unplausibel“, kein Messwert |

Die Referenz ist die getippte Wahrheitsmarke (Ziel ≤ 0,3 m genau), zwischen zwei Marken linear interpoliert, bei zwei gleichen Marken in Folge ein Haltepunkt. Die Referenz ist selbst unsicher.

## 3. Welche Läufe zählen (Mindestdaten)

Ein Lauf zählt nur, wenn **alle** Punkte gelten. `positioning_verdict.py` prüft die ersten vier selbst; die übrigen prüft der Mensch mit dem Report von `analyze_walk.sh` (`TESTRAUM_TAG.md`, Abschnitt 5).

1. Echte Feldaufnahme, nicht synthetisch (Dateiname nicht `synthetic-…`).
2. `session`-Zeile mit `role: evaluation`. Aufnahmen mit `calibration` oder ohne `session` zählen nie (Datenleck zwischen Kalibrierung und Bewertung).
3. Mindestens 100 Epochen mit Referenz (sonst ist P95 nicht aussagekräftig, `METRICS.md`).
4. Jede Aufnahme zählt einmal (gleiche Datei zweimal = Datenleck).
5. Alle Beacons des Layouts wurden gehört, alle Wahrheitsmarken sind da, der Report läuft ohne Fehler (Mensch).
6. Die Aufnahme wurde nicht nachträglich geändert (Mensch).

**Mindestens 3 Bewertungsläufe.** Mit weniger ist das Ergebnis **explorativ** und die Entscheidung lautet **„noch nicht“**, auch wenn alle Zahlen für die Engine sprechen. Empfehlung, nicht Pflicht: die Läufe aus zwei Sessions zu verschiedenen Tageszeiten und von mehr als einem Gerätemodell (`MEASUREMENT_PROTOCOL.md`, Abschnitt 3). Die Aussage gilt immer nur für die Bedingungen der Läufe.

## 4. Die Regel

Je Bewertungslauf wird die Differenz **Engine minus aktuelle Pipeline** gebildet (negativ bei Median und P90 = Engine besser). Maßgebend ist der **Mittelwert der Differenzen über die Läufe**; jeder Lauf zählt gleich. Epochen werden nicht über Läufe gepoolt, weil benachbarte Epochen fast dieselbe Messung sind (`METRICS.md`, Abschnitt Unsicherheit).

Toleranzen (Unterschiede darunter gelten als gleich):

| Größe | Toleranz | Begründung |
| --- | --- | --- |
| Median, P90 | 0,3 m | Genauigkeit der Referenz (Tipp auf die Karte) |
| Ausfallrate, Sprungrate | 1 Prozentpunkt | Vorschlag; bei 300 Epochen sind 3 Epochen ein Prozentpunkt |

**Die Engine wird zum Einschalten vorgeschlagen (Ergebnis BESSER), nur wenn alles gilt:**

1. Mindestens 3 Bewertungsläufe (Abschnitt 3).
2. Median: Mittel der Differenzen ≤ −0,3 m, und in keinem Lauf ist die Differenz ≥ +0,3 m.
3. P90: dasselbe.
4. Ausfallrate: Mittel der Differenzen ≤ +1 Prozentpunkt (nicht höher).
5. Sprungrate: Mittel der Differenzen ≤ +1 Prozentpunkt (nicht höher).

**Ergebnisse und Folgen:**

| Ergebnis | Bedeutung | Entscheidung |
| --- | --- | --- |
| EXPLORATIV | weniger als 3 Bewertungsläufe | „noch nicht“, Flag bleibt aus, weitere Läufe aufnehmen |
| BESSER | alle fünf Bedingungen erfüllt | Das Team darf in einem eigenen Change vorschlagen, die Engine hinter dem Flag einzuschalten. Vorher Funkschicht im Feld prüfen (Abschnitt 6) |
| GLEICHWERTIG | keine Kennzahl weicht über die Toleranz ab | Kein Genauigkeitsgewinn belegt, Flag bleibt aus. Ein Einschalten wäre eine Architekturentscheidung und braucht eine eigene Begründung, nicht diese Regel |
| SCHLECHTER | mindestens eine Kennzahl über die Toleranz schlechter, keine besser | Flag bleibt aus, Ursache untersuchen |
| GEMISCHT | sonst (zum Beispiel nur der Median besser, oder besser und schlechter zugleich) | Flag bleibt aus |

Die Regel kennt kein „fast“. P95, Anteil ≤ 2/3/5 m und die Verzögerung werden berichtet, entscheiden aber nicht: Sie sind die Kennzahlen, die bei wenigen Läufen am stärksten streuen.

## 5. Erwartung vor den Daten

Beide Wege nutzen `PositioningPipeline` (Messspeicher, Solver, Schätzer, Projektion); die Engine ruft sie nur anders auf. Auf der synthetischen Fixture liefern beide in 588 von 588 Epochen dieselbe Position. **Erwartet wird deshalb GLEICHWERTIG.** Das ist kein Mangel des Werkzeugs, sondern der Befund: Ein Replay kann nur zeigen, dass die Engine die Pipeline nicht verschlechtert. Ein BESSER ist nicht zu erwarten und wäre erklärungsbedürftig (Layout ohne UUID, abweichende Zuordnung von Samples: der Vergleich meldet nicht zugeordnete Messungen in den Hinweisen).

## 6. Grenzen des Vergleichs

- **Funkschicht nicht gemessen.** Der Replay bekommt dieselben Samples. Wie `CoreLocationBeaconRadio` gegenüber dem Funkcode im `BeaconManager` Samples liefert (Identität, Advertisements, Ranging-Takt), zeigt nur der Schattenbetrieb auf dem Gerät (`ShadowPositioning`, Branch `postpilot/ios-architecture`). Er ist eine eigene, spätere Stufe vor dem Entfernen von `BeaconManager`.
- **Eine Aufnahme ist ein Lauf**, ein Raum (Schulraum, Markt `SPAR-Leonding-002`, 4 iBeacons), ein Gerät pro Lauf. Der Befund gilt nicht für einen Markt.
- **Bewegungsmodell** (`motionAided`) ist aus, wie in der App.
- **Mehrere Kriterien, wenige Läufe:** Die Regel ist ein Sieb, kein Beweis. Sie wird nicht nachträglich angepasst, bis ein Ergebnis passt.
- **Synthetische Daten** zeigen nur, dass die Kette läuft. Diese Zahlen werden nie zitiert.

## 7. Anwendung

```text
# je Aufnahme (Repo-Wurzel); schreibt NavigationFixtures/exports/<name>-comparison.json
scripts/field/compare_positioning.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/<datei>.jsonl --store SPAR-Leonding-002

# alle Bewertungsläufe zusammen
python -I scripts/field/positioning_verdict.py swift/indooro-EinkaeuferFinal/NavigationFixtures/exports/*-comparison.json
```

Das Ergebnis (Tabelle und Zeile `ERGEBNIS`) wird unverändert in den Report übernommen. Die Schwellen im Skript (`positioning_verdict.py`, Konstanten oben) und in diesem Dokument müssen übereinstimmen; ein Test prüft die Skriptlogik.

## 8. Änderungsprotokoll

Änderungen an Abschnitt 3 und 4 nach dem ersten echten Vergleich sind nur mit Eintrag hier erlaubt (Datum, Änderung, Grund, Wer). Der erste echte Vergleich wird nach der Regel bewertet, die vor ihm galt.

| Datum | Änderung | Grund | Wer |
| --- | --- | --- | --- |
| 2026-11-18 | Erste Fassung als Vorschlag | Story #195, vor jeder echten Aufnahme | Claude Code im Auftrag des Teams |
