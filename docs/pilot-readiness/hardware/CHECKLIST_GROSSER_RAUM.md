# Checkliste großer Raum

Status: Entwurf (Tasks 5.3 und 5.4). Der Raum ist noch nicht festgelegt. Kandidaten: Bibliothek, Werkstatt oder Lager mit Regalen oder Gängen.

Alle Schritte, die einen Menschen vor Ort brauchen, beginnen mit `(Mensch: …)`. Die übrigen Schritte erledigt die Auswertung oder die Dokumentation.

Standortnummer: **Major 2** (`BEACON_STANDARD.md`, Abschnitt 2). Kennung: `grossraum`.

## 1. Genehmigung

- [ ] (Mensch: Erlaubnis der Schule für Raum, Zeitfenster und Montage von Beacons einholen. Schriftlich festhalten.)
- [ ] (Mensch: Ansprechpartner und Zugang zum Raum klären.)
- [ ] (Mensch: Zwei Zeitfenster festlegen, ruhig und belebt, passend zum Protokoll.)

## 2. Beacon-Plan

- [ ] Grundriss als Layout-JSON anlegen (1 Zelle = 1 m, ein Eingang). Datei: `sites/layout-grossraum.json`.
- [ ] Planer ausführen: `scripts/beacon-planner/` (geplant, `openspec/changes/add-beacon-placement-planner/`). Ausgabe `beacons-plan.csv`.
- [ ] Plan prüfen: 8 Beacons, Abstand 6 bis 8 m, an jeder begehbaren Position mindestens 3 Beacons in Reichweite (`BEACON_STANDARD.md`, Abschnitt 5).
- [ ] Minor-Nummern vergeben (global eindeutig, nächste freie Nummer aus `beacons.csv`). Etiketten `IND-2-<minor>` vorbereiten.
- [ ] (Mensch: Beacons nach Freigabe bestellen, Bestellung in `team/STATUS.md` eintragen, Auswahl siehe `HARDWARE_SELECTION.md`.)

## 3. Konfiguration

- [ ] (Mensch: Jeden Beacon nach `CONFIGURE_BEACON.md` konfigurieren. Major 2, Minor laut Plan.)
- [ ] (Mensch: Identität mit dem Herstellerscanner prüfen.)
- [ ] Zeilen für Major 2 in `beacons.csv` ergänzen.

## 4. Montage

- [ ] (Mensch: Montage nach `BEACON_STANDARD.md`, Abschnitt 5. Nur kleben oder klemmen, nicht bohren.)
- [ ] (Mensch: Montagepunkt messen. Abweichung zum Plan höchstens 0,5 m, sonst Datensatz und Layout korrigieren.)
- [ ] (Mensch: Foto je Beacon mit Etikett in `sites/grossraum-fotos/`. Keine Personen auf Fotos.)

## 5. Geometrie

- [ ] (Mensch: Raum mit Laser-Entfernungsmesser vermessen: Wände, Regale, Gänge und Beacon-Punkte.)
- [ ] (Mensch: Ergebnisse in `sites/grossraum.md` eintragen, Vorlage `sites/SITE_TEMPLATE.md`.)
- [ ] Layout-JSON mit den gemessenen Werten aktualisieren. Echte UUID, Major und Minor, ein Eingang.
- [ ] (Erik: Layout in die App übernehmen und Tests ergänzen, tasks.md 3.3.)

## 6. Marker

- [ ] (Mensch: Mindestens vier Standmarker festlegen, dazu Marker für die Gehschleife. Über mehrere Gänge verteilen.)
- [ ] (Mensch: Marker am Boden kleben und messen.)
- [ ] (Mensch: Marker-Tabelle in `sites/grossraum.md` eintragen, Zahlen mit Punkt.)
- [ ] (Mensch: Gangrechtecke erfassen, Tabelle „Gänge“ in `sites/grossraum.md`.)
- [ ] (Mensch: S4-Paar mit annähernd gleichem Abstand festlegen und in der Marker-Tabelle kennzeichnen.)

## 7. Aufnahmen

- [ ] (Mensch: Protokoll `MEASUREMENT_PROTOCOL.md` durchführen. Szenarien S1 bis S4 mit beiden Geräten.)
- [ ] (Mensch: Mindestens zwei Gehläufe aufnehmen. Zwei Geräte-Modelle, möglichst zwei Tageszeiten.)
- [ ] (Mensch: Dateinamen je Szenario auf dem Notizblatt festhalten. Dateien per AirDrop an den Mac senden.)

## 8. Auswertung auf dem Mac

- [ ] Import und Anonymisierungsprüfung: `python -I scripts/field/import_recordings.py --site grossraum --date <YYYY-MM-DD> --move`
- [ ] Export: `FIELD_EXPORT_DIR=<ausgabeordner> swift test --filter FieldExport` im Ordner `swift/indooro-EinkaeuferFinal`
- [ ] Statistik: `python -I scripts/field/field_stats.py --layout sites/layout-grossraum.json --markers sites/grossraum.md --ticks <dateien> --out <report-tabelle>.md`
- [ ] Replay-Tests mit den neuen Aufnahmen (Erik, tasks.md 5.4).

## 9. Akkutest und Report

- [ ] (Mensch: Akku-Test nach `MEASUREMENT_PROTOCOL.md`, Abschnitt 9, auf zwei Geräten.)
- [ ] Report `reports/<YYYY-MM-DD>-grossraum.md` aus `REPORT_TEMPLATE.md` erstellen.
- [ ] (Mensch: Eintrag in `team/STATUS.md`. Pull Request erst nach Abschluss der Aufnahmen.)

Hinweis: Aufgabe 5.4 bleibt offen, bis die Aufnahmen vorliegen. Dieser Stand ist kein Messergebnis.
