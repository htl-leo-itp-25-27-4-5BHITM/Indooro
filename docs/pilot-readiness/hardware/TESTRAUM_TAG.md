# Checkliste Testraum-Tag

Stand: 2026-10-19 · Raum: Schulraum, Markt `SPAR-Leonding-002`, 4 iBeacons, 8 Regale · Ziel: **ein Gang mit dem iPhone ergibt eine auswertbare Aufnahme.** Details zum Protokoll: `MEASUREMENT_PROTOCOL.md`. Die Beacon-Registrierung wird getrennt korrigiert; hier wird sie nicht angefasst.

## 1. Am Vorabend (Mac, Repo-Wurzel)

- [ ] **Build mit Recorder** aufs iPhone: `scripts/ios/install-debug-on-device.sh` (Debug). Release und TestFlight haben **keinen** Recorder.
- [ ] **Layout holen** (nur lesend, zwei GET-Aufrufe):
  `python -I scripts/field/fetch_layout.py --store SPAR-Leonding-002 --out swift/indooro-EinkaeuferFinal/NavigationFixtures/layouts/spar-leonding-002.json`
  Die Ausgabe nennt 4 Beacons mit x/y. Mit dem Maßband vergleichen. Stand 2026-10-19: Raster 5 × 9 m, Beacons `Indooro1` bis `Indooro4` an den Ecken. Weicht der Raum ab, nur notieren, nicht reparieren.
- [ ] **Probelauf ohne iPhone** (synthetisch, zeigt nur, dass die Kette läuft):
  `scripts/field/analyze_walk.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/synthetic/synthetic-testraum-2026-10-19-1.jsonl`
  Der Report trägt den Kasten **SYNTHETISCH – keine Messung**. Diese Zahlen nie zitieren.
- [ ] **Marker kleben**: 6 bis 8 Klebeband-Kreuze am Boden, verteilt über alle Gänge, nicht unter Beacons. Position mit dem Maßband in Layout-Metern messen (Ursprung oben links wie die Karte, x nach rechts, y nach unten) und in `sites/testraum.md` (Marker-Tabelle) eintragen. Jeder Marker wird auf der Karte angetippt; die Referenz ist nur so genau wie dieser Tipp (Ziel ≤ 0,3 m).
- [ ] iPhone: Bluetooth an, Standort „Beim Verwenden“ erlaubt, Bewegung & Fitness erlauben, **Auto-Sperre auf „Nie“**, Akku > 80 %. Notizblatt und Stift bereit.

## 2. Vor jedem Lauf (iPhone)

1. Einstellungen (Zahnrad): Modus **Mit Ortung**; Abschnitt Debug: **Messungen aufzeichnen** an. Auf der Karte erscheint das rote Zeichen **REC · 0 Marker**.
2. App bleibt im Vordergrund, Display an. Kartengröße so wählen, dass ein Marker eindeutig getroffen wird.
3. **Wahrheitsmarker:** am Marker stehen, **0,6 s lang auf die Karte an dieser Stelle drücken**. Es vibriert kurz, der Zähler im roten Zeichen steigt um 1. Keine Vibration, kein Marker.
4. Lauf Ende: **Messungen aufzeichnen** wieder aus (schreibt die Datei zu Ende). Dateiname (Zeitstempel) mit Laufnummer aufs Notizblatt.

## 3. Läufe (je eine Datei)

| Lauf | Was | Wahrheitsmarker |
| --- | --- | --- |
| L1 Gerade Linie | Einen Gang in normalem Gehtempo ganz durchgehen, nicht stehen bleiben | Am Start, in der Mitte, am Ende |
| L2 Runde um die Regale | Alle Marker in fester Reihenfolge passieren, eine volle Runde | Je ein Druck beim Passieren jedes Markers |
| L3 Stand an den Beacons | An jedem der 4 Beacons ca. 0,5 m daneben ruhig stehen, Gerät in der Hand. **30 s**; an `Indooro1` und `Indooro3` **60 s** (für `stabilize-ios-navigation-pipeline` 12.1) | Druck beim Ankommen **und** Druck vor dem Weitergehen, an derselben Stelle |

Optional danach: L4 bewusst in den falschen Gang und zurück (Uhrzeit aufs Blatt). Pro Lauf höchstens 5 Minuten; bei Abbruch neue Datei starten.

## 4. Export und Analyse

1. **Export:** Einstellungen, Debug, in der Dateiliste die Aufnahme antippen, **Teilen**, AirDrop an den Mac. Alternativ Dateien-App, Auf meinem iPhone, Indooro, `NavigationRecordings` (nur Debug-Build). Dateiname enthält keine Gerätekennung.
2. **Ablage** in `swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/` (von Git ignoriert).
3. **Ein Befehl** (Repo-Wurzel; ohne Dateiargument gilt die neueste Datei in `incoming/`):
   `scripts/field/analyze_walk.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/<datei>.jsonl --layout swift/indooro-EinkaeuferFinal/NavigationFixtures/layouts/spar-leonding-002.json --markers docs/pilot-readiness/hardware/sites/testraum.md`
   Er anonymisiert eine Kopie, prüft sie, spielt sie durch die unveränderte App-Pipeline und schreibt `NavigationFixtures/exports/<datei>-report.md` (Format wie `reports/0000-synthetic-baseline.md`: Replay-Zeile, Sprünge, Fehler je Marker, hörbare Beacons je Position). Die Ausgabe nennt die Datei.
4. **Zuerst lesen:** Abschnitt „Auffälligkeiten“ und „Beacons ohne Layout-Treffer“. Dort steht, ob ein Layout-Beacon nie gehört wurde, ob nicht der nächste Beacon am stärksten ist oder ob fremde Major/Minor auftauchen (Registrierung passt nicht zum Layout).
5. **Gang-Anteil** erscheint nur, wenn `sites/testraum.md` eine Gang-Tabelle hat; Layouts aus dem Backend haben keine Gang-Elemente.

## 5. Brauchbar, wenn

- [ ] „Gehört in der Aufnahme“ nennt alle 4 Beacons. Alle Wahrheitsmarker sind da (Zahl = Notizblatt).
- [ ] Je Stand-Position: mindestens 3 Beacons mit ≥ 3 Samples; der stärkste ist der nächste Layout-Beacon.
- [ ] Der Report läuft ohne Fehler durch (Exit 0).

## 6. Danach

- Gute Aufnahmen: `python -I scripts/field/import_recordings.py --site testraum --date <JJJJ-MM-TT> --move`, Report nach `reports/<datum>-testraum.md` kopieren, Tasks `establish-pilot-field-measurement` 5.1/5.2 mit Dateinamen belegen.
- Positionsparameter bleiben unverändert (Nachweis erst mit ≥ 2 Aufnahmen, `PARAMETER_ANALYSIS.md`).
