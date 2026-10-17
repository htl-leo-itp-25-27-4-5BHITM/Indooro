# Ergebnisübersicht Feldmessung

Status: `Keine Messdaten – kein Parameter wird geändert (Mensch: Aufnahmen 5.1/5.4 abwarten)`

Task 6.5. Die Werte entstehen aus den Reports unter `reports/`, nicht aus dieser Datei. Jeder Wert wird aus dem jeweiligen Report übernommen.

## 1. Ergebnis je Standort

| Standort | Datum | Geräte | Median Positionsfehler an Markern | P90 Positionsfehler an Markern | Gang korrekt (Gehzeit) | Report |
| --- | --- | --- | --- | --- | --- | --- |
| Testraum (Major 1) | (Mensch/Auswertung: JJJJ-MM-TT) | (Mensch/Auswertung: Modelle) | (Mensch/Auswertung: m) | (Mensch/Auswertung: m) | (Mensch/Auswertung: %) | (Mensch/Auswertung: Link) |
| Großer Testraum (Major 2) | (Mensch/Auswertung: JJJJ-MM-TT) | (Mensch/Auswertung: Modelle) | (Mensch/Auswertung: m) | (Mensch/Auswertung: m) | (Mensch/Auswertung: %) | (Mensch/Auswertung: Link) |

## 2. Empfohlener Beacon-Abstand

(Mensch/Auswertung: Abstand aus den Messungen ableiten. Ausgangswert ist der Plan mit 6 bis 8 m aus `BEACON_STANDARD.md`, Abschnitt 5. Dazu die Anzahl hörbarer Beacons an den Markern angeben.)

## 3. Empfohlener Pilotmodus

Zuordnung nach `docs/pilot-readiness/03_PILOT_READINESS.md`, Abschnitt 4.3:

| Median / P90 Positionsfehler, Gang korrekt | Modus |
| --- | --- |
| ≤ 2,5 m / ≤ 4 m, Gang ≥ 80 % | C mit Rerouting, Ausblick auf A |
| ≤ 4 m / ≤ 6 m, Gang ≥ 60 % | C ohne automatisches Rerouting |
| schlechter | B (Ortung aus), Messdaten als Projektergebnis |

Empfehlung: (Mensch/Auswertung: Modus A, C oder B mit Begründung aus Abschnitt 1.)

## 4. Parameter

(Mensch/Auswertung: Stand der Parameteranalyse aus `PARAMETER_ANALYSIS.md`. Keine Änderung ohne Nachweis nach Abschnitt 4 dort.)

## 5. Offene Risiken

| Risiko | Auswirkung | Maßnahme |
| --- | --- | --- |
| (Mensch/Auswertung: Übertragbarkeit vom Testraum in den Markt) | (Mensch/Auswertung) | (Mensch/Auswertung) |
| (Mensch/Auswertung: Gerätevarianz zwischen zwei Modellen) | (Mensch/Auswertung) | (Mensch/Auswertung) |
| (Mensch/Auswertung: Batterie und Akku-Abfall in 30 min) | (Mensch/Auswertung) | (Mensch/Auswertung) |
| (Mensch/Auswertung: Lieferzeit der Beacons) | (Mensch/Auswertung) | (Mensch/Auswertung) |

## 6. Verweise

- Protokoll: `MEASUREMENT_PROTOCOL.md`
- Parameter: `PARAMETER_ANALYSIS.md`
- Beacon-Standard: `BEACON_STANDARD.md`
- Hardware: `HARDWARE_SELECTION.md`
