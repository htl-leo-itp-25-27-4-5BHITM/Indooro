# Report <NNNN>: <Standort> – <Messung>

Status: Vorlage. Alle Felder in `(Mensch: …)` oder `(Auswertung: …)` werden vor Abgabe gefüllt. Ablage: `reports/<YYYY-MM-DD>-<site>.md`. Die Nummer `<NNNN>` läuft fortlaufend ab `0001`.

Vorlage für das Messprotokoll: `MEASUREMENT_PROTOCOL.md`. Auswertung: `scripts/field/field_stats.py`.

## Kopf

- Datum: (Mensch: JJJJ-MM-TT)
- Standort: (Mensch: Standortkennung aus `beacons.csv`, Major und Name, z. B. Testraum Major 1)
- Session: (Mensch: Nummer der Session am Tag, z. B. 1 oder 2)
- Tageszeit: (Mensch: ruhig oder belebt, mit Uhrzeit von–bis)
- Geräte: (Mensch: zwei iPhone-Modelle, nur Modellbezeichnung, keine Gerätenamen und keine UUIDs)
  - Gerät A: (Mensch: Modell, iOS-Version)
  - Gerät B: (Mensch: Modell, iOS-Version)
- Beacons: (Mensch: Anzahl aktiver Beacons, Standort-Plan-Nummer)
- Beacon-Abstand: (Mensch: Mittelwert und Spanne in m, Abgleich mit Plan 6 bis 8 m)
- Marker: (Mensch: Anzahl n, Bezug `sites/<site>.md`)
- Aufnahmedateien: (Mensch: je Szenario eine Zeile, Dateiname in `NavigationFixtures/recordings/`)
  - S1 Standzeiten: (Mensch: Dateiname)
  - S2 Gehschleife: (Mensch: Dateiname je Gerät)
  - S3 Falscher Gang: (Mensch: Dateiname, Uhrzeit des Abbiegens hh:mm:ss)
  - S4 Gleichstände: (Mensch: Dateiname)
  - Akku-Test: (Mensch: Dateiname je Gerät)
- Commit: (Mensch: Hash des Stands, mit dem die Auswertung lief)

## Metrik-Tabelle

### Gesamtkennzahlen

| Kennzahl | Gerät A | Gerät B | gesamt | Einheit | Quelle |
| --- | --- | --- | --- | --- | --- |
| Positionsfehler an Markern, Median | (Auswertung) | (Auswertung) | (Auswertung) | m | `field_stats.py` |
| Positionsfehler an Markern, 90-%-Quantil (P90) | (Auswertung) | (Auswertung) | (Auswertung) | m | `field_stats.py` |
| Anteil Gehzeit im richtigen Gang | (Auswertung) | (Auswertung) | (Auswertung) | % | `field_stats.py` |
| Reroutes pro Tour | (Auswertung) | (Auswertung) | (Auswertung) | Anzahl | `field_stats.py` / Replay-Metrik |
| Stoppwechsel ohne Event | (Auswertung) | (Auswertung) | (Auswertung) | Anzahl | `field_stats.py` / Replay-Metrik |
| Verzögerung Off-Route-Erkennung | (Auswertung) | (Auswertung) | (Auswertung) | s (Median / Max) | Replay-Metrik `offRouteDelays` |
| Akku-Abfall in 30 min | (Mensch: Start- und Endwert) | (Mensch: Start- und Endwert) | – | Prozentpunkte | Notizblatt |

### Positionsfehler je Marker

| Marker | Anzahl Ticks | Median | P90 | Beschreibung (aus Standort-Datei) |
| --- | --- | --- | --- | --- |
| M1 | (Auswertung) | (Auswertung) | (Auswertung) | (Mensch: aus `sites/<site>.md`) |
| M2 | (Auswertung) | (Auswertung) | (Auswertung) | (Mensch: aus `sites/<site>.md`) |
| … | … | … | … | … |
| Mn | (Auswertung) | (Auswertung) | (Auswertung) | (Mensch: aus `sites/<site>.md`) |
| gesamt | (Auswertung) | (Auswertung) | (Auswertung) | – |

### Ausgabe von field_stats.py

Ausgabe unverändert einfügen:

```text
<field_stats.py Ausgabe hier einfügen>
```

## Entscheidung Pilotmodus

Zuordnung nach `docs/pilot-readiness/03_PILOT_READINESS.md`, Abschnitt 4.3. Die Werte stammen aus dem Messergebnis dieses Berichts (Positionsfehler an Markern gesamt und Anteil Gehzeit im richtigen Gang).

| Median Positionsfehler | P90 Positionsfehler | Gang korrekt (Gehzeit) | Modus Phase 3 |
| --- | --- | --- | --- |
| ≤ 2,5 m | ≤ 4 m | ≥ 80 % | C mit Rerouting, Ausblick auf A |
| ≤ 4 m | ≤ 6 m | ≥ 60 % | C ohne automatisches Rerouting |
| schlechter | – | – | B (Ortung aus), Messdaten als Projektergebnis |

Ergebnis dieser Messung: (Auswertung: Modus laut Tabelle, nur wenn alle drei Werte der Zeile erfüllt sind.)

Entscheidung: (Mensch: Modus festlegen und begründen.)

Einschränkung: Die Messung gilt für den gemessenen Raum. Ein Testraum oder eine Bibliothek ersetzt keine Messung im Markt (design.md, Risiken).

## Risiken

| Risiko | Auswirkung | Maßnahme |
| --- | --- | --- |
| (Mensch: ausfüllen) | (Mensch: ausfüllen) | (Mensch: ausfüllen) |

## Unterschrift

- Erstellt von: (Mensch: Name der Person und Rolle)
- Erstellt am: (Mensch: JJJJ-MM-TT)
- Geprüft von: (Mensch: Name)
