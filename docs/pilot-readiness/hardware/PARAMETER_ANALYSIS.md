# Parameteranalyse Positionierung

Status: `Keine Messdaten – kein Parameter wird geändert (Mensch: Aufnahmen 5.1/5.4 abwarten)`

Task 6.2. Grundlage: `openspec/changes/establish-pilot-field-measurement/` (design.md, Decision 6). Stand der Werte: Datei `swift/indooro-EinkaeuferFinal/indooroApp/Utilities/StabilizedNavigationConfig.swift` im Branch `pilot/field-measurement`.

## 1. Ausgangslage

Off-Route-Regel:

- Abstand: 4,0 m (`StabilizedNavigationConfig.swift:47`, als `provisional` markiert).
- Haltezeit: 2,5 s (`StabilizedNavigationConfig.swift:48`, als `provisional` markiert).
- Anwendung: `NavigationSessionCore.swift:544–556`. Off-Route gilt erst, wenn die projizierte Position länger als die Haltezeit über dem Abstand liegt. Eine niedrige Konfidenz hebt die Prüfung auf.
- Simulation: `NavigationReplay.swift:547`.

Sprung-Gate:

- Maximale plausible Geschwindigkeit: 2,5 m/s (`StabilizedNavigationConfig.swift:32`, `provisional`).
- Zuschlag: 0,85 m (`StabilizedNavigationConfig.swift:33`, `provisional`).
- Erlaubte Verschiebung: `maxPlausibleSpeed * dt + jumpMargin` (`PoseFusionService.swift:48`, `NavigationReplay.swift:509`).

Vorab-Einordnung aus `docs/pilot-readiness/03_PILOT_READINESS.md` (M1): Der Off-Route-Abstand von 4 m liegt unter dem synthetischen 95-%-Fehler von rund 5 m. Im Markt drohen dadurch Fehlalarme. Diese Aussage ist eine Hypothese, bis Messungen vorliegen.

## 2. Parameterliste

Die Tabelle nennt alle Parameter, die als `provisional` markiert sind (13 Zeilen in `StabilizedNavigationConfig.swift`). Dazu stehen drei Parameter ohne Marker, die direkt die Entfernung oder die Lösung bestimmen.

| Parameter | Wert | Fundstelle | Markiert | Wirkung |
| --- | --- | --- | --- | --- |
| `estimatorHighConfidenceAlpha` | 0,46 | `:28` | ja | Glättung bei hoher Konfidenz |
| `estimatorLowConfidenceAlpha` | 0,18 | `:29` | ja | Glättung bei niedriger Konfidenz |
| `maxPlausibleSpeed` | 2,5 m/s | `:32` | ja | Sprung-Gate, Geschwindigkeit |
| `jumpMargin` | 0,85 m | `:33` | ja | Sprung-Gate, Zuschlag |
| `jumpConfirmations` | 3 | `:34` | ja | Bestätigungen vor Akzeptanz eines Sprungs |
| `jumpClusterRadius` | 1,275 m | `:35` | ja | Cluster-Radius für Sprung-Bestätigung |
| `defaultTurnPenaltyMeters` | 1,5 m | `:40` | ja | Abbiegestrafe der Routensuche |
| `turnPenaltyMeters` | 1,5 m (Vorgabe) | `:42` | ja | Abbiegestrafe, Instanzwert |
| `progressBacktrackToleranceMeters` | 3,0 m | `:44` | ja | Toleranz für Fortschrittsrückgang |
| `offRouteDistanceMeters` | 4,0 m | `:47` | ja | Off-Route-Abstand |
| `offRouteHoldSeconds` | 2,5 s | `:48` | ja | Off-Route-Haltezeit |
| `twoOptMinimumGainMeters` | 0,01 m | `:59` | ja | Mindestgewinn für 2-Opt-Zug |
| `twoOptMaxPasses` | 50 | `:60` | ja | Maximale Durchläufe 2-Opt |
| `defaultTxPowerDBm` | −72 dBm | `:21` | **nein** | Referenz des Pfadverlust-Modells (`PositioningPipeline.swift:176, 199–201`) |
| `pathLossExponent` | 2,8 | `:20` | **nein** | Pfadverlust-Exponent (`PositioningPipeline.swift:201`) |
| `minBeaconCountForSolution` | 3 | `:17` | **nein** | Mindestanzahl Beacons für eine Lösung (`BeaconPositionSolver.swift:41`) |

Befund: `defaultTxPowerDBm` und `pathLossExponent` beeinflussen jede Entfernungsschätzung, sind aber nicht als `provisional` markiert. Die Regel in Abschnitt 4 gilt nur für markierte Parameter. Vorschlag: Marker ergänzen, damit die Regel greift. Entscheidung: (Mensch).

## 3. Gemessen gegen Parameter

Die Spalte „Messung“ wird mit Aufnahmen aus den Sessions gefüllt. Die Zeile „synthetisch“ dient nur als Vergleich. Sie stammt aus `docs/pilot-readiness/hardware/reports/0000-synthetic-baseline.md` und ist keine Feldmessung.

| Parameter (Wert) | Gemessene Größe | Synthetische Referenz (Report 0000) | Feldmessung | Befund | Vorschlag |
| --- | --- | --- | --- | --- | --- |
| Off-Route 4,0 m / 2,5 s | Reroutes pro Tour, Off-Route-Verzögerung | `wrongAisle`: 1 Reroute, Verzögerung 6,55 s | (Auswertung: Reroutes pro Tour, Verzögerung in s) | (Auswertung) | (Mensch: Entscheidung nach Abschnitt 4) |
| Sprung-Gate 2,5 m/s / 0,85 m | Projizierte Sprünge, größter Schritt | `walkClean`: 2 Sprünge, größter Schritt 3,91 m | (Auswertung: Sprünge, größter Schritt) | (Auswertung) | (Mensch) |
| Glättung α 0,46 / 0,18 | Verzögerung zur Wahrheit (Mittelwert, P95) | `walkClean`: 3,22 m / 5,02 m | (Auswertung: Mittelwert und P95 der Verzögerung) | (Auswertung) | (Mensch) |
| Abbiegestrafe 1,5 m | Gangwechsel, Routenform | (nicht im Report 0000 erfasst) | (Auswertung) | (Auswertung) | (Mensch) |
| Fortschrittstoleranz 3,0 m | Fortschrittsrückgang | (nicht im Report 0000 erfasst) | (Auswertung) | (Auswertung) | (Mensch) |

Die Werte der synthetischen Referenz stammen aus dem Report 0000 (Lauf 2026-10-16). Die Feldwerte kommen aus `field_stats.py` und den Replay-Metriken.

## 4. Entscheidungsregel

Quelle: spec `mobile-positioning-navigation`, Requirement „Positioning parameter changes require recorded evidence“.

Ein markierter Parameter wird nur geändert, wenn alle Bedingungen erfüllt sind:

1. Mindestens zwei echte Aufnahmen vom Zielstandort liegen vor.
2. Vorher- und Nachher-Metriken stehen in `swift/indooro-EinkaeuferFinal/NavigationFixtures/BASELINE.md`. Dazu gehören Reroutes pro Tour und Off-Route-Verzögerung bei Off-Route-Änderungen.
3. Die synthetischen Replay-Tests laufen grün.

Fehlt eine Bedingung, bleibt der Marker `// provisional` stehen. Der Marker wird nur nach dem Nachweis entfernt.

Ablauf:

1. Vorschlag mit Begründung aus den Messungen schreiben (Tabelle Abschnitt 3).
2. Zwei Aufnahmen vom Zielstandort auswerten.
3. Vorher- und Nachher-Werte in `BASELINE.md` eintragen.
4. Synthetische Replay-Tests laufen lassen (`swift test --filter NavigationReplayTests`).
5. Änderung als einzelner Commit je Parameter. Marker erst nach Nachweis entfernen.

## 5. Status

Keine Messdaten vorhanden. Kein Parameter wird geändert.

Offen:

- (Mensch: Aufnahmen aus den Sessions 5.1 und 5.4 abwarten.)
- (Mensch: Entscheidung über Marker für `defaultTxPowerDBm` und `pathLossExponent`.)
- (Auswertung: Tabelle Abschnitt 3 mit Feldwerten füllen, sobald Aufnahmen vorliegen.)
