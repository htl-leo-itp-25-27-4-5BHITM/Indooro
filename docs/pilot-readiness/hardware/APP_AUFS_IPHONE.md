# Debug-App auf das iPhone (Messtag)

Für Erik. Ziel: Die Debug-App mit allen Messschaltern läuft auf einem iPhone, zeichnet auf und lässt sich exportieren. Du brauchst dafür einen Mac mit Xcode, ein Kabel und eine Apple-ID (kostenlos, „Personal Team“). Die Studierenden installieren nichts: Sie bekommen ein fertig eingerichtetes iPhone.

Der Debug-Build ist nur für Messungen. Er gehört nie in den Store. Ohne die Schalter unten verhält er sich wie die App im Pilot.

## 1. Voraussetzungen

- Xcode 26 oder neuer (getestet mit Xcode 26.3). Prüfen: Xcode, Menü **Xcode > About Xcode**. Beim ersten Start fragt Xcode nach zusätzlichen Komponenten: bestätigen und warten.
- iPhone mit iOS 18.5 oder neuer (Mindestversion der App).
- Lightning- oder USB-C-Kabel, das Daten überträgt.
- Eine Apple-ID. In Xcode: **Xcode > Settings > Accounts > + > Apple ID**. Danach erscheint dein Name mit „(Personal Team)“.

## 2. Projekt öffnen

1. Repository auf den Stand von `main` bringen (`git pull`).
2. Datei `swift/indooro-EinkaeuferFinal/MCindooroApp.xcodeproj` doppelklicken.
3. Warten, bis oben „Resolving Packages“ fertig ist (beim ersten Mal einige Minuten).
4. Oben in der Mitte das Schema **MCindooroApp (LeoCloud)** wählen (Debug-Build gegen das LeoCloud-Backend wie im Pilot). Das Schema **MCindooroApp (Release)** nicht benutzen: Es hat die Messschalter nicht.

## 3. Signieren mit dem Personal Team

1. Links in der Dateiliste das Projekt **MCindooroApp** anklicken, dann Target **MCindooroApp**, Reiter **Signing & Capabilities**.
2. Haken bei **Automatically manage signing**.
3. **Team**: dein „(Personal Team)“ wählen. Das eingetragene Team der Schule (`YVTW3J7XLC`) kannst du mit einer privaten Apple-ID nicht nutzen.
4. **Bundle Identifier** ändern, zum Beispiel `at.ac.htl.leonding.indooroswift2.erik` (am Ende einen eigenen Zusatz). Die Original-Kennung ist beim Schul-Team registriert; Apple lehnt sie für dein Personal Team ab.
5. Diese zwei Änderungen (Team, Bundle Identifier) **nicht committen**. Mit `git diff` prüfen und vor einem Commit zurücksetzen.

Die App braucht keine Sonderfunktionen (keine Capabilities), deshalb reicht ein Personal Team.

## 4. iPhone verbinden und Entwicklermodus einschalten

1. iPhone per Kabel anstecken, entsperren, auf „Diesem Computer vertrauen?“ mit **Vertrauen** antworten und den iPhone-Code eingeben.
2. Am iPhone: **Einstellungen > Datenschutz & Sicherheit > Entwicklermodus** einschalten. Das iPhone startet neu. Nach dem Neustart den Dialog mit **Einschalten** bestätigen und den Code eingeben. (Der Eintrag erscheint erst, wenn das iPhone einmal mit Xcode verbunden war.)
3. In Xcode oben neben dem Schema dein iPhone als Ziel wählen (nicht „iPhone 16“-Simulator). Steht dort „Preparing device“, einige Minuten warten.

## 5. Bauen und starten (Debug)

1. Mit **Cmd+R** (Run) bauen und installieren. Beim ersten Mal dauert das einige Minuten.
2. Beim ersten Start meldet das iPhone „Nicht vertrauenswürdiger Entwickler“: siehe Abschnitt 8.
3. Die App startet. Beim ersten Start **Bluetooth** und **Standort** (beim Verwenden der App) erlauben.

Alternative ohne Xcode-Fenster: `scripts/ios/install-debug-on-device.sh` baut und installiert für das angesteckte iPhone (Team und Bundle Identifier müssen dafür im Projekt schon eingetragen sein).

## 6. Wo sind die Schalter?

In der App oben das **Zahnrad** (Einstellungen). Der Abschnitt **Debug** gibt es nur im Debug-Build.

| Was | Wo | Wann einstellen |
|---|---|---|
| **Schattenmodus (alt + neu aufzeichnen)** | Einstellungen > Debug, erster Schalter | Vor der Messung an, danach **App beenden (nach oben wischen) und neu öffnen**. Die Schalter wirken erst nach dem Neustart. |
| **Neue Ortung steuert Navigation** | erscheint unter dem Schattenmodus | **Aus lassen.** Dann bleiben Karte, Route und Ankunft bei der alten Ortung, und die neue wird nur aufgezeichnet. |
| **Messungen aufzeichnen** | Einstellungen > Debug | An = Aufnahme läuft, auf der Karte steht **REC**. |
| **Szenario** (S1 bis S4) und **Rolle** | Einstellungen > Debug | Vor dem Start der Aufnahme. Rolle **Evaluation** für Messungen, die zählen. **Kalibrierung** zählt nie für die Entscheidung. |
| **M1 bis M8** (Schnellauswahl) | Einstellungen > Debug, erscheint, solange die Aufnahme läuft | Am Marker stehen, auf **M1** bis **M8** tippen. Das schreibt Marker und Wahrheitsposition an die Zellmitte, ohne die Karte anzutippen. |
| **Sync-Marke setzen** | Einstellungen > Debug (während REC) | Für externe Referenzen (Video, Stoppuhr). |
| **Beacons live** | Einstellungen, ganz unten (Abschnitt „Beacons live“) | Sichtprüfung vor Ort. |

Vor der Messung: Modus **Mit Ortung** (Einstellungen > Ortung).

### Beacon-Liste lesen

Abschnitt **Beacons live**: eine Zeile je gehörtem Beacon mit Major/Minor, RSSI in dBm (stärkster zuerst), UUID und „vor n s“ (Sekunden seit dem letzten Empfang). Grau = länger als 5 s nicht gehört. Im Testraum müssen alle **vier** Beacons stehen. Fehlt einer, die Messung nicht starten (Batterie, Standort, Bluetooth prüfen). Die Liste zeigt auch fremde Beacons.

### Marker M1 bis M8

Testraum `SPAR-Leonding-002`, Raster 5 x 9, 1 Zelle = 1 m, gezählt ab 0 an der Ecke bei Indooro3. Die Marker liegen in Zellmitten: M1 (0,5 / 7,5), M2 (4,5 / 7,5), M3 (4,5 / 5,5), M4 (0,5 / 5,5), M5 (0,5 / 3,5), M6 (4,5 / 3,5), M7 (4,5 / 1,5), M8 (0,5 / 1,5). Die Person steht dafür in der Mitte der markierten Zelle.

## 7. Testaufnahme und Export

Vor dem Messtag einmal mit dem iPhone zu Hause probieren:

1. Einstellungen > Debug: Schattenmodus an, App neu starten, Modus **Mit Ortung**.
2. Szenario S1, Rolle Evaluation wählen, **Messungen aufzeichnen** einschalten.
3. 30 Sekunden gehen oder stehen, dabei zweimal **M1** tippen (Zähler **Wahrheitsmarker** steigt).
4. **Messungen aufzeichnen** ausschalten.
5. Export: In derselben Liste steht die Aufnahme (Dateiname = Zeitstempel). Antippen öffnet das Teilen-Blatt: **In Dateien sichern**, **AirDrop** an den Mac oder Mail an dich selbst. Die Datei endet auf `.jsonl`.
6. Alternativ (nur Debug-Build) ohne Teilen-Blatt: App **Dateien > Auf meinem iPhone > Indooro > NavigationRecordings**, oder am Mac im Finder beim iPhone unter **Dateien**.
7. Auswerten: Datei nach `swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/` legen und `scripts/field/evaluate_field_day.sh` (Anleitung: `scripts/field/README.md`). Aufnahmen mit Schattenmodus enthalten `shadow`-Zeilen und werden direkt ohne Replay ausgewertet.

Die Aufnahmen bleiben auf dem iPhone, bis sie gelöscht werden. Es wird nichts an einen Server gesendet.

## 8. Typische Fehler

| Meldung oder Zeichen | Ursache | Lösung |
|---|---|---|
| „Untrusted Developer“ / „Nicht vertrauenswürdiger Entwickler“ beim Start | Das Entwicklerzertifikat ist am iPhone noch nicht freigegeben | **Einstellungen > Allgemein > VPN & Geräteverwaltung** (je nach iOS „Geräteverwaltung“), unter „Entwickler-App“ deine Apple-ID antippen, **Vertrauen**. App neu starten. |
| „Failed to register bundle identifier“ / „Bundle identifier is not available“ | Die Kennung gehört schon dem Schul-Team oder jemand anderem | Bundle Identifier ändern (Abschnitt 3, Punkt 4) und noch einmal Run. |
| „Developer Mode disabled“ / „To use iPhone for development, enable Developer Mode“ | Entwicklermodus am iPhone aus | Abschnitt 4, Punkt 2. Der Eintrag fehlt, bis das iPhone einmal mit Xcode verbunden war. |
| „Device is locked“ / „Could not launch … the device was not unlocked“ | iPhone gesperrt beim Installieren oder Starten | iPhone entsperren, Display an lassen, Run noch einmal. In Einstellungen > Anzeige & Helligkeit > Automatische Sperre auf „Nie“ stellen (nur für die Messung). |
| „No account for team“ / „Signing requires a development team“ | Kein Team gewählt | Abschnitt 3, Punkt 3. Apple-ID unter Xcode > Settings > Accounts prüfen. |
| App startet nicht mehr, Symbol grau, nach etwa 7 Tagen | Zertifikate des Personal Teams laufen nach 7 Tagen ab | Am Mac mit dem iPhone verbunden noch einmal **Run**. Das Installieren erneuert die Frist. Nicht am Messtag selbst, sondern am Vortag neu installieren. Aufnahmen auf dem iPhone bleiben beim Neuinstallieren über Run erhalten; beim **Löschen** der App gehen sie verloren, vorher exportieren. |
| „Maximum number of apps“ / „You have reached the maximum number of registered apps“ | Personal Team: nur 3 Apps gleichzeitig, 10 Kennungen pro Woche | Alte Test-Apps vom iPhone löschen oder eine Woche warten. |
| Beacon-Liste bleibt leer, kein REC mit Daten | Bluetooth oder Standort verweigert, oder Modus „Ohne Ortung“ | **Einstellungen (iPhone) > Datenschutz & Sicherheit > Standortdienste > Indooro: Beim Verwenden der App**, **Bluetooth > Indooro: an**. Dann in der App Modus **Mit Ortung**. |
| Standort-Dialog erscheint nicht mehr | Früher abgelehnt | iPhone-Einstellungen > Indooro > Standort > „Beim Verwenden der App“, Bluetooth an. App neu starten. |
| Der Schalter Schattenmodus wirkt nicht | Neustart fehlt | App beenden (nach oben wischen), neu öffnen. Die Debug-Schalter lesen die App erst beim Start. |
| Build-Fehler „iOS 26.x is not installed“ | Plattform fehlt | Xcode > Settings > Components > iOS-Plattform laden. |
| Build-Fehler zu `SwiftOpenAPIGenerator` (Plugin) | Plugin muss freigegeben werden | Beim ersten Build „Trust & Enable“ für das Plugin wählen. Auf der Kommandozeile `-skipPackagePluginValidation` (siehe `TESTING.md`). |

## 9. Checkliste am Vortag

- [ ] Debug-Build frisch installiert (7-Tage-Frist), Entwickler vertraut.
- [ ] Bluetooth und Standort erlaubt, Modus „Mit Ortung“, Beacon-Liste zeigt alle vier Beacons.
- [ ] Schattenmodus an, **Neue Ortung steuert Navigation** aus, App einmal neu gestartet.
- [ ] Testaufnahme erstellt, exportiert, am Mac geöffnet und mit `scripts/field/compare_positioning.sh` ausgewertet.
- [ ] iPhone geladen, Automatische Sperre für die Messung auf „Nie“.
