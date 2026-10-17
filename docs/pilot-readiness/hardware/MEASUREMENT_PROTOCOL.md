# Messprotokoll Feldmessung

Status: Entwurf – Dry-Run (4.7) noch offen (Mensch: Dry-Run mit den vier Bestandsbeacons durchführen und Abschnitt 8 ausfüllen).

Tasks: 4.1 (Protokoll), 4.7 (Dry-Run), 5.5 (Akku-Test). Gilt für Testraum und großen Testraum (Standorte 1 und 2) sowie später für Märkte.

## 1. Anforderung

Aus `openspec/changes/establish-pilot-field-measurement/specs/beacon-deployment/spec.md`, Requirement „Field measurements follow a fixed protocol and produce a report“:

> Eine Feldmessung nutzt Bodenmarker mit bekannten Koordinaten. Sie erfasst Standzeiten von mindestens 60 s an mindestens vier Markern, mindestens eine Gehschleife über alle Marker, einen bewussten Falsch-Gang-Lauf und einen Lauf an zwei nahezu gleich weit entfernten Stopps, mit mindestens zwei iPhone-Modellen. Jede Messung erzeugt einen Bericht mit: Median und 90-Prozent-Quantil des Positionsfehlers an den Markern, Anteil der Gehzeit im richtigen Gang, Reroutes pro Tour, Stoppwechsel ohne Event, Verzögerung der Off-Route-Erkennung und Akku-Abfall in 30 Minuten.

## 2. Begriffe und feste Konventionen

Die Auswertungsskripte hängen von diesen Konventionen ab. Sie werden nicht geändert, ohne `scripts/field/` anzupassen.

| Begriff | Festlegung |
| --- | --- |
| Marker | Bodenpunkt mit bekannten Koordinaten. Namen `M1` bis `Mn`, in fester Reihenfolge |
| Standort-Datei | `docs/pilot-readiness/hardware/sites/<site>.md` mit der Marker-Tabelle |
| Marker-Tabelle | `\| Marker \| x_m \| y_m \| Beschreibung \|`. Eine Zelle = 1 m, Layout-Koordinaten |
| Layout | `docs/pilot-readiness/hardware/sites/layout-<site>.json` |
| Aufnahme | Eine Datei je Gehlauf oder Szenario, JSON Lines (`Documents/NavigationRecordings/<ISO-Zeitstempel>.jsonl`, `TESTING.md`, `NavigationRecorder.swift:76`) |
| `truth`-Zeile | Entsteht durch langes Drücken (0,6 s) auf die Karte. Die Koordinate ist die gedrückte Kartenposition (`NavigationRecorder.swift:130`, `TESTING.md`) |
| Ticks | `<name>-ticks.csv`, erzeugt durch den Export-Test (Spalten laut `NavigationReplay.csvHeader`) |

Die Marker-Koordinaten werden auf der Karte an der exakten Position getippt. Dazu den Kartenmaßstab so wählen, dass der Marker eindeutig getroffen wird (Einstellungen, Maßstab-Schieber). Das Antippen begrenzt die Genauigkeit der Referenz. Diese Grenze wird im Bericht genannt.

Das Gerät wird bei allen Szenarien wie bei normaler Nutzung gehalten: in der Hand, Bildschirm sichtbar. Während einer Aufnahme wird das Gerät nicht gewechselt.

## 3. Marker einrichten (Mensch)

1. (Mensch: Marker am Boden markieren, zum Beispiel mit Klebeband oder Kreuz.)
2. (Mensch: Position jedes Markers vom Raumursprung oder einer Wandecke aus messen. Ergebnis in Layout-Metern eintragen.)
3. (Mensch: Marker in `sites/<site>.md` eintragen. Zahlen mit Punkt als Dezimaltrenner. Keine Platzhalter stehen lassen, die Skripte können sie nicht lesen.)
4. Reihenfolge festlegen: `M1` bis `Mn` in der Reihenfolge der Gehschleife.
5. Mindestens vier Marker für die Standzeiten. Die Marker verteilen sich über die Gänge, damit die Gang-Prüfung sinnvoll ist (Mensch: Auswahl begründen).
6. Die beiden Marker des Paares für Szenario S4 (annähernd gleich weit entfernt vom Startpunkt) in der Spalte `Beschreibung` kennzeichnen, zum Beispiel „S4-Paar A“ und „S4-Paar B“.

## 4. Szenarien

Eine Session ist ein Messblock an einem Tag zu einer Tageszeit. In jeder Session fährt jedes Gerät alle Szenarien S1 bis S4 mindestens einmal. Mindestens zwei Sessions zu verschiedenen Tageszeiten, zum Beispiel ruhiger Vormittag und belebter Nachmittag (Mensch: Zeitfenster festlegen und in der Session-Notiz festhalten).

| Nr. | Szenario | Mindestumfang | Aufnahmen |
| --- | --- | --- | --- |
| S1 | Standzeiten an Markern | Mindestens 4 Marker, je mindestens 60 s stehen | Eine Datei für die Standzeit-Serie |
| S2 | Gehschleife | Ein Lauf über `M1` bis `Mn` in fester Reihenfolge | Eine Datei je Lauf, mindestens ein Lauf je Gerät |
| S3 | Falscher Gang | Eine Tour starten, bewusst in den falschen Gang gehen, danach korrigieren | Eine Datei je Lauf |
| S4 | Zwei nahezu gleich weit entfernte Stopps | Gehen an beiden Stopps des Paares vorbei | Eine Datei je Lauf |

### S1: Standzeiten

Für jeden Marker in der Reihenfolge `M1` bis `Mn` (mindestens vier):

1. Ankommen und den Marker erreichen.
2. Langes Drücken (0,6 s) auf der Karte an der Markerposition. Das schreibt die erste `truth`-Zeile.
3. Mindestens 60 s stehen bleiben, ruhig, ohne Bewegung des Geräts. Dauer mit Stoppuhr messen.
4. Langes Drücken (0,6 s) an derselben Markerposition. Das schreibt die zweite `truth`-Zeile für diesen Marker.
5. Zum nächsten Marker gehen.

Zwischen den Markern wird normal gegangen. Diese Wege werden nicht als Standzeit ausgewertet.

### S2: Gehschleife

1. An `M1` starten.
2. Alle Marker in fester Reihenfolge passieren, normales Gehtempo, nicht stehen bleiben.
3. Beim Passieren jedes Markers genau an der Markerposition langes Drücken (0,6 s). Ein `truth`-Eintrag je Marker.
4. Nach `Mn` die Aufnahme beenden.

Die Ground Truth zwischen den Markern wird später linear über die Zeit interpoliert.

### S3: Falscher Gang

1. Eine Tour starten, bei der das nächste Ziel in einem bestimmten Gang liegt.
2. Bewusst in einen anderen Gang gehen, der nicht zum Ziel führt.
3. Uhrzeit des Abbiegens in den falschen Gang notieren (hh:mm:ss) auf dem Notizblatt, nicht in der Aufnahme.
4. Den Fehler bemerken lassen, dann korrigieren und das Ziel erreichen.
5. Aufnahme beenden.

Die Uhrzeit wird nicht in der Aufnahme gespeichert. Aufnahmen dürfen keine Freitextnotizen zu Personen enthalten (spec `mobile-positioning-navigation`).

### S4: Zwei nahezu gleich weit entfernte Stopps

1. Das Paar aus Abschnitt 3, Punkt 6 festlegen. Die Abstände vom Startpunkt sollen sich um höchstens 1 m unterscheiden (Vorschlag, Mensch: prüfen und festlegen).
2. Startpunkt festlegen und die Tour so anlegen, dass beide Stopps des Paares auf der Liste stehen.
3. Die Stopps in beiden Reihenfolgen passieren (mindestens einmal in der Reihenfolge der Liste).
4. Langes Drücken (0,6 s) an jedem Stopp des Paares, wenn er erreicht ist.
5. Aufnahme beenden.

## 5. Vor der Session: Checkliste

- [ ] Akkustand der Geräte notiert. Ladegerät dabei (Mensch: Mindestladestand festlegen).
- [ ] DEBUG-Build mit Recorder auf beiden Geräten installiert (`team/DEVICES.md`, Task 4.6).
- [ ] Einstellungen, Debug, „Messungen aufzeichnen“ ist im Build vorhanden (`SettingsSheet.swift:54`, nur DEBUG).
- [ ] Bluetooth ist eingeschaltet. Standortberechtigung erteilt.
- [ ] Layout `layout-<site>.json` ist geladen. Die Beacons des Standorts sind sichtbar.
- [ ] Alle Beacons laut `beacons.csv` sind aktiv, Batterie-Datum eingetragen (`BEACON_STANDARD.md`).
- [ ] Marker sind geklebt und gemessen. `sites/<site>.md` ist aktuell.
- [ ] Zeitfenster der Session notiert (ruhig oder belebt).
- [ ] Notizblatt liegt bereit (Uhrzeiten S3, Dateinamen je Szenario, Akkustände). Notizen stehen nicht in der Aufnahme.

## 6. Nach der Session

- [ ] Aufnahme-Dateien mit „Aufzeichnung teilen“ verschicken (AirDrop oder Dateien-App) an den Mac von Erik oder Person A. Der Dateiname ist ein Zeitstempel ohne Gerätekennung (`TESTING.md`). Er wird vor dem Teilen geprüft.
- [ ] Dateiname je Szenario auf dem Notizblatt festhalten. Die Dateinamen stehen in den Einstellungen unter „Aufzeichnung teilen“ (`SettingsSheet.swift:66`).
- [ ] Im Report notieren: Geräte-Modelle, Tageszeit, Anzahl Beacons, Abstand, Uhrzeit des falschen Gangs (S3). Keine Gerätenamen und keine Geräte-UUIDs. Gerätenamen enthalten oft Personennamen.
- [ ] Aufnahmen an `swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/` übergeben. Der Ordner ist in Git ignoriert (`.gitignore:90`).

## 7. Mac-Pipeline

Die Befehle laufen auf dem Mac im Repo-Wurzelverzeichnis, außer wenn anders angegeben. Die Skripte in `scripts/field/` entstehen mit Task 4.4 und 4.5; die Flags sind festgelegt.

1. Import und Anonymisierungsprüfung:

   ```text
   python -I scripts/field/import_recordings.py --site <site> --date <YYYY-MM-DD> [--incoming DIR] [--recordings DIR] [--move]
   ```

   Das Skript prüft die Dateien auf Gerätekennungen und Freitext (Task 4.5). Akzeptierte Dateien landen in `NavigationFixtures/recordings/` mit der Benennung `<site>-<date>-<n>.jsonl` (tasks.md, 5.2). Mit `--move` werden die Dateien aus dem Eingangsordner verschoben, sonst kopiert.

2. Export der Ticks je Aufnahme:

   ```text
   cd swift/indooro-EinkaeuferFinal
   FIELD_EXPORT_DIR=<ausgabeordner> swift test --filter FieldExport
   ```

   Ohne `FIELD_EXPORT_DIR` schreibt der Test nach `NavigationFixtures/exports/`. Pro Aufnahme entsteht `<name>-ticks.csv`.

3. Statistik:

   ```text
   python -I scripts/field/field_stats.py --layout docs/pilot-readiness/hardware/sites/layout-<site>.json --markers docs/pilot-readiness/hardware/sites/<site>.md --ticks <datei>-ticks.csv [<datei>-ticks.csv ...] [--source est|proj] [--replay-lines FILE] [--out FILE.md]
   ```

   `--markers` ist die Standort-Datei. Die Marker werden aus ihrer Tabelle gelesen. `--source est` nutzt die Schätzung, `--source proj` die projizierte Position. `--out` schreibt die Markdown-Tabelle, die in den Report eingefügt wird.

Die Schritte 2 und 3 setzen voraus, dass die Aufnahmen vorher importiert sind.

## 8. Dry-Run (Task 4.7) mit den vier Bestandsbeacons

Ziel: Protokoll und Werkzeuge prüfen, bevor neue Beacons ankommen. Ergebnisse und Lücken stehen in dieser Tabelle.

Prüfpunkte:

- [ ] Alle vier Bestandsbeacons erscheinen im Log (`ibeacon-…` oder `ranged-ibeacon-…`, siehe `CONFIGURE_BEACON.md`).
- [ ] Keine Meldung „passt zu keinem Beacon im aktiven Layout“ für die vier Beacons.
- [ ] An jedem Marker sind mindestens 3 Beacons hörbar (`StabilizedNavigationConfig.swift:17`).
- [ ] Beacon-Koordinaten stimmen mit dem Maßband auf 0,5 m (Layout und `beacons.csv`).
- [ ] Recorder schreibt die Datei. Jeder Long Press erzeugt eine `truth`-Zeile.
- [ ] Die angezeigte Datei lässt sich teilen. Der Inhalt enthält keine Gerätekennung.
- [ ] Anonymisierungsprüfung (`import_recordings.py`) läuft ohne Fehler durch.
- [ ] Export (`FieldExport`) und Statistik (`field_stats.py`) liefern eine lesbare Tabelle.
- [ ] Standzeit-Serie: je Marker mindestens 60 s, mit Stoppuhr gemessen.
- [ ] Zuordnung Datei zu Szenario auf dem Notizblatt funktioniert.
- [ ] Akku-Test (Abschnitt 9): Start- und Endwert werden erfasst.
- [ ] Dauer einer Gehschleife gemessen, damit die Session planbar ist.

Lücken gefunden:

| Nr. | Bereich | Beobachtung | Maßnahme | Verantwortlich | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | (Mensch: ausfüllen) | (Mensch: ausfüllen) | (Mensch: ausfüllen) | (Mensch: ausfüllen) | offen |

## 9. Akku-Test (Task 5.5)

Ziel: Akku-Abfall über 30 Minuten Navigation mit „Mit Ortung“ auf zwei Geräten.

1. (Mensch: Zwei Geräte verschiedener Modelle wählen. Modelle im Report notieren.)
2. Akkustand in Prozent notieren.
3. „Mit Ortung“ einschalten. Eine Tour mit Einkaufsliste starten. Aufnahme läuft mit.
4. 30 Minuten navigieren. Während dieser Zeit wird nicht geladen.
5. Akkustand in Prozent notieren. Abfall = Startwert minus Endwert, in Prozentpunkten.
6. Ergebnis je Gerät in den Report (Feld „Akku-Abfall 30 min“).

## 10. Report

Jede Session erzeugt einen Report nach `REPORT_TEMPLATE.md` unter `reports/<YYYY-MM-DD>-<site>.md`. Der Report verlinkt die Aufnahme-Dateien, die in `NavigationFixtures/recordings/` liegen.
