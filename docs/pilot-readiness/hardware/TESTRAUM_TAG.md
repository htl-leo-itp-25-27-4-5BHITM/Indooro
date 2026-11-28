# Checkliste Testraum-Tag (technische Ergänzung)

Stand: 2026-11-19 · Raum: Schulraum, Markt `SPAR-Leonding-002`, 4 iBeacons, 8 Regale.

**Siehe `MESSTAG.md`.** Die Anleitung für den Messtag (Material, Beacons ablesen, Kontrolle, Marker, Ablauf der Läufe, Auswertung, Fehlerbehebung) steht dort an einer Stelle. Eine Seite zum Abhaken: `MESSTAG_CHECKLISTE.md`. Dieses Dokument behält nur Inhalte, die dort nicht stehen: die Zusatzläufe für die Pipeline-Stabilisierung, den Einzelaufnahme-Befehl und die Kriterien für eine brauchbare Aufnahme.

Das Protokoll mit den festen Konventionen bleibt `MEASUREMENT_PROTOCOL.md`. Die Entscheidung über die Positions-Engine (Story #195) braucht mindestens 3 Bewertungsläufe nach `MESSTAG.md`, Abschnitt 5.

## Zusatzläufe (nicht für #195)

Diese Läufe dienen der Prüfung der Pipeline, nicht der Entscheidung #195. Rolle in der App: keine (bis Paket B die Rolle „Exploration“ liefert, siehe `MESSTAG.md`, Abschnitt 2.6).

| Lauf | Was | Wahrheitsmarker |
| --- | --- | --- |
| L1 Gerade Linie | Einen Gang in normalem Gehtempo ganz durchgehen, nicht stehen bleiben | Am Start, in der Mitte, am Ende |
| L3 Stand an den Beacons | An jedem der 4 Beacons ca. 0,5 m daneben ruhig stehen, Gerät in der Hand. **30 s**; an `Indooro1` und `Indooro3` **60 s** (für `stabilize-ios-navigation-pipeline` 12.1) | Druck beim Ankommen **und** Druck vor dem Weitergehen, an derselben Stelle |
| L4 Falscher Gang | Bewusst in den falschen Gang und zurück (Uhrzeit aufs Blatt) | nach Bedarf |

Die Runde um die Regale (früher L2) ist der Bewertungslauf nach `MESSTAG.md`, Abschnitt 5.2. Pro Lauf höchstens 5 Minuten; bei Abbruch neue Datei starten.

## Eine einzelne Aufnahme auswerten (ohne die komplette Messtag-Kette)

1. **Layout holen** (nur lesend, zwei GET-Aufrufe):
   `python -I scripts/field/fetch_layout.py --store SPAR-Leonding-002 --out swift/indooro-EinkaeuferFinal/NavigationFixtures/layouts/spar-leonding-002.json`
   Die Ausgabe nennt die Beacons mit x/y. Mit dem Maßband vergleichen. Weicht der Raum ab, nur notieren, nicht reparieren.
2. **Probelauf ohne iPhone** (synthetisch, zeigt nur, dass die Kette läuft; der Report trägt den Kasten **SYNTHETISCH – keine Messung**, diese Zahlen nie zitieren):
   `scripts/field/analyze_walk.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/synthetic/synthetic-testraum-2026-10-19-1.jsonl`
3. **Eine echte Aufnahme** (Datei nach `swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/`, von Git ignoriert; ohne Dateiargument gilt die neueste dort):
   `scripts/field/analyze_walk.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/<datei>.jsonl --layout swift/indooro-EinkaeuferFinal/NavigationFixtures/layouts/spar-leonding-002.json`
   Der Befehl anonymisiert eine Kopie, prüft sie, spielt sie durch die unveränderte App-Pipeline und schreibt `NavigationFixtures/exports/<datei>-report.md`. Optional `--markers docs/pilot-readiness/hardware/sites/<site>.md`, wenn eine Standort-Datei mit Marker-Tabelle angelegt wurde (Vorlage: `sites/SITE_TEMPLATE.md`; für den Testraum gibt es heute keine).
4. **Zuerst lesen:** Abschnitt „Auffälligkeiten“ und „Beacons ohne Layout-Treffer“. Dort steht, ob ein Layout-Beacon nie gehört wurde, ob nicht der nächste Beacon am stärksten ist oder ob fremde Major/Minor auftauchen (Registrierung passt nicht zum Layout).
5. **Gang-Anteil** erscheint nur, wenn die Standort-Datei eine Gang-Tabelle hat; Layouts aus dem Backend haben keine Gang-Elemente.
6. **Vergleich alte und neue Positionsberechnung** (nur Lesen, schaltet nichts ein):
   `scripts/field/compare_positioning.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/<datei>.jsonl --store SPAR-Leonding-002`
   Eine Aufnahme ist **ein** Lauf. Für den ganzen Messtag gilt der eine Befehl `scripts/field/evaluate_field_day.sh <ordner>` aus `MESSTAG.md`, Abschnitt 6.

## Brauchbar, wenn

- [ ] „Gehört in der Aufnahme“ nennt alle 4 Beacons. Alle Wahrheitsmarker sind da (Zahl = Notizblatt).
- [ ] Je Stand-Position: mindestens 3 Beacons mit ≥ 3 Samples; der stärkste ist der nächste Layout-Beacon.
- [ ] Der Report läuft ohne Fehler durch (Exit 0).

## Danach

- Gute Aufnahmen: `python -I scripts/field/import_recordings.py --site testraum --date <JJJJ-MM-TT> --move`, Report nach `reports/<datum>-testraum.md` kopieren, Tasks `establish-pilot-field-measurement` 5.1/5.2 mit Dateinamen belegen.
- Positionsparameter bleiben unverändert (Nachweis erst mit ≥ 2 Aufnahmen, `PARAMETER_ANALYSIS.md`).
