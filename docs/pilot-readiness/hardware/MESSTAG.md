# Messtag Testraum: die Anleitung

Stand: 2026-11-19 · Story #195 · Raum: Testraum, Markt `SPAR-Leonding-002` (Store-ID `b0308337-1d4b-4096-b022-200e6118e86c`)

**Ziel des Tages:** Mindestens 3 gültige Bewertungsläufe (`Rolle: Evaluation`, je mindestens 100 Epochen) mit dem iPhone aufnehmen. Daraus entscheidet ein Programm nach `POSITIONING_DECISION.md`, ob die neue Positionsberechnung eingeschaltet werden darf.

**Das ist die einzige Einstiegsseite.** Zum Ausdrucken gibt es die Kurzfassung `MESSTAG_CHECKLISTE.md`. Du brauchst keine Programmierkenntnisse. Wo ein Befehl nötig ist, steht er zum Kopieren da. Wenn etwas unklar ist: nichts erfinden, aufschreiben, weitermachen und Erik fragen.

Inhalt: [1 Vorher zu Hause](#vorher-zu-hause) · [2 Beacons ablesen](#beacons-ablesen) · [3 Kontrolle](#kontrolle) · [4 Marker und Maßstab](#marker-und-massstab) · [5 Ablauf der Begehungen](#ablauf) · [6 Danach](#danach) · [7 Fehlerbehebung](#fehlerbehebung)

Dateien, die dazugehören:

| Datei | Wofür |
| --- | --- |
| `docs/pilot-readiness/hardware/MESSTAG_CHECKLISTE.md` | Eine Seite zum Abhaken |
| `docs/pilot-readiness/hardware/TESTRAUM_BEACON_WERTE.md` | Vorlage: hier trägst du die abgelesenen Beacon-Werte ein |
| `docs/pilot-readiness/hardware/APP_AUFS_IPHONE.md` | App auf das iPhone bringen (kommt mit Paket B) |
| `docs/pilot-readiness/hardware/marker/MARKER_SPAR-Leonding-002.html` | Druckbogen der Marker |
| `scripts/field/check_testroom_beacons.sh` | Kontrolle der Beacon-Einträge (nur lesend) |
| `scripts/field/evaluate_field_day.sh` | Ein Befehl für die Auswertung |
| `docs/pilot-readiness/hardware/POSITIONING_DECISION.md` | Die Entscheidungsregel (nicht ändern) |

---

<a id="vorher-zu-hause"></a>
## 1 Vorher zu Hause

### 1.1 Material

- [ ] 2 bis 3 Personen (Rollen: Abschnitt [5.5](#rollen))
- [ ] iPhone mit der Debug-App (Abschnitt 1.3). Ein zweites iPhone als Reserve, wenn möglich
- [ ] Powerbank und Kabel
- [ ] Alle 4 Beacons, **jeder mit frischer Batterie** (Ersatzbatterien dabei) und mit Etikett `IND-<major>-<minor>`, soweit vorhanden
- [ ] Maßband (mindestens 10 m), besser auch ein Laser-Entfernungsmesser
- [ ] Malerkrepp oder Klebeband (hell, am Boden gut sichtbar), Schere
- [ ] Die gedruckten Marker-Blätter (Abschnitt [4](#marker-und-massstab)), 9 Seiten
- [ ] Ausgedruckte Checkliste `MESSTAG_CHECKLISTE.md`, Notizblatt, 2 Stifte
- [ ] Stoppuhr (Handy-Uhr einer zweiten Person)
- [ ] Leiter oder Stuhl, wenn Beacons hoch hängen
- [ ] Ein Mac mit dem Repo für die Auswertung (Abschnitt [6](#danach)), am besten am selben Tag

### 1.2 Batterien und iPhone

- [ ] **Beacon-Batterien neu** einlegen. Datum in `beacons.csv` eintragen (siehe `CONFIGURE_BEACON.md`, Schritt 6).
- [ ] iPhone zu mindestens 90 % laden. Powerbank mitnehmen.
- [ ] Einstellungen, Bluetooth: **an**.
- [ ] Einstellungen, Datenschutz, Ortungsdienste: **an**. Indooro: **Beim Verwenden der App**.
- [ ] Bewegung und Fitness: für Indooro **erlauben** (sonst gibt es keine Schrittdaten).
- [ ] Anzeige und Helligkeit, Automatische Sperre: **Nie** (sonst sperrt das iPhone mitten im Lauf).
- [ ] Nicht stören: **an**. Anrufe und Mitteilungen dürfen die Aufnahme nicht stören.
- [ ] Flugmodus aus, WLAN beliebig.

### 1.3 Debug-App aufs iPhone

Nur eine **Debug-App** kann aufnehmen. Release und TestFlight haben **keinen** Recorder. Die Schritte zum Installieren stehen in `docs/pilot-readiness/hardware/APP_AUFS_IPHONE.md` (kommt mit Paket B). Bis dahin: Erik installiert mit `scripts/ios/install-debug-on-device.sh`.

### 1.4 Probeaufnahme (zu Hause, 5 Minuten)

Ablauf:

1. App öffnen. Zahnrad (Einstellungen). Abschnitt **Debug** suchen. Fehlt er: das ist keine Debug-App. Stopp, Erik fragen.
2. Rolle **Evaluation**, Szenario **S2** wählen. **Messungen aufzeichnen** einschalten. Einstellungen schließen.
3. Oben links auf der Karte erscheint das rote Zeichen **REC · 0 Marker**.
4. Mit dem Finger **0,6 Sekunden lang** auf die Karte drücken. Es vibriert kurz. Der Zähler springt auf **1 Marker**. Keine Vibration, kein Marker.
5. Einstellungen, **Messungen aufzeichnen** ausschalten. Unten erscheint eine Datei mit Zeitstempel.
6. Datei antippen, **Teilen**, per AirDrop an den Mac schicken. Kommt sie an, ist der Weg getestet.

Die Probeaufnahme wird **nicht** ausgewertet. Löschen oder in einen Ordner `probe` legen.

### 1.5 Marker drucken

Siehe Abschnitt [4.1](#marker-drucken). Vorher zu Hause erledigen.

---

<a id="beacons-ablesen"></a>
## 2 Beacons ablesen (nRF Connect)

**Warum:** Im Backend stehen für den Testraum noch nicht die echten Werte jedes Beacons (UUID, Major, Minor). Ohne sie ordnet die App die Signale nicht zu. Die echten Werte stehen **im Beacon selbst**. Du liest sie aus.

**Wie viele:** 4 Beacons (`Indooro1` bis `Indooro4`). Plan-Positionen aus dem Layout: siehe Tabelle unten.

| Beacon im Layout | Layout-Position (x / y) | Ecke im Raum |
| --- | --- | --- |
| `Indooro3` | 0 / 0 | oben links (Ursprung) |
| `Indooro2` | 5 / 0 | oben rechts |
| `Indooro4` | 0 / 9 | unten links |
| `Indooro1` | 5 / 9 | unten rechts |

Stand: Layout vom 2026-11-19. Die Zuordnung Name zu echtem Gerät (Etikett am Beacon) bestimmst du vor Ort. Der Name im Layout bleibt, wie er ist.

### 2.1 App

**nRF Connect for Mobile** von Nordic Semiconductor, im App Store, kostenlos. Installieren, öffnen, Bluetooth-Zugriff erlauben.

### 2.2 So sieht der Bildschirm aus

Beschreibung, damit du weißt, was du suchst. Die genauen Menütexte kannst du abweichend vorfinden (App-Version).

- Unten eine Leiste. Der Reiter **Scanner** ist der richtige. Er listet alle Geräte, die Bluetooth senden.
- Oben im Scanner ein Knopf **Scan** (oder die Liste scannt von selbst). Jede Zeile ist ein Gerät: links der Name oder „N/A“, rechts eine Zahl mit **dBm**. Das ist der **RSSI**: je näher am Beacon, desto näher an 0 (zum Beispiel −55 ist nahe, −90 ist weit weg).
- Tippst du ein Gerät an, klappt die Zeile auf oder ein Detailfenster öffnet sich. Dort stehen die „Advertising data“. Bei einem iBeacon soll ein Abschnitt **Apple iBeacon** erscheinen. (Quelle: `docs/pilot-readiness/operations/MARKT_EINRICHTEN.md`, Zeile „Beacon-Werte“.)
- In diesem Abschnitt stehen die Felder, die du brauchst.

### 2.3 Welche Felder du aufschreibst

| Feld | Was es ist | Beispiel | Beachte |
| --- | --- | --- | --- |
| **UUID** | Gruppenkennung, 32 Zeichen mit Strichen | `B5CAA23B-BB89-4040-99D2-FCED3EA4A62B` | Alle 4 Beacons sollten dieselbe haben. Projekt-Standard: `BEACON_STANDARD.md` |
| **Major** | Standortnummer | `1` | Testraum laut Standard: 1 |
| **Minor** | Nummer des Beacons | `3` | Jeder Beacon eine andere |
| **RSSI** | Signalstärke jetzt | `−62 dBm` | Wert in 1 m Abstand notieren (siehe 2.4) |
| **TX Power** | Sendeleistung, oft „Measured power“ oder „TX Power“ | `−59` | Wenn nicht angezeigt: leer lassen, nicht raten |

**Achtung:** Der Standard (`BEACON_STANDARD.md`) nennt `B5CAA23B-…`. Das Layout im Backend hat heute **andere** UUIDs (`6f1a7f7e-…`) und bei `Indooro3` fehlen Major und Minor. Schreibe **genau auf, was der Beacon sendet**, auch wenn es vom Standard abweicht. Nicht anpassen, nicht „korrigieren“. Der Abgleich ist Sache der nächsten Schritte.

### 2.4 Ablesen, Schritt für Schritt (pro Beacon)

1. Alle anderen Beacons **ausschalten oder weit weg** halten (Batterie raus, wenn nötig). Sonst verwechselst du sie.
2. Mit dem iPhone **etwa 1 m** an den Beacon gehen. In der Scanner-Liste ist die Zeile mit der stärksten Zahl (am nächsten an 0) dein Beacon.
3. Zeile antippen. **UUID, Major, Minor, RSSI, TX Power** ablesen. Screenshot machen (Seitentaste + Lauter) als Beleg.
4. Werte in `docs/pilot-readiness/hardware/TESTRAUM_BEACON_WERTE.md` eintragen (Vorlage von Paket C), oder auf dem Notizblatt, dann abtippen. Dazu: Etikett am Beacon (`IND-…`), Wo er hängt (Ecke), Datum der Batterie.
5. Nächsten Beacon. Reihenfolge egal.
6. Ganz am Ende **alle 4 Zeilen noch einmal gegenlesen**, Zahl für Zahl. Ein Zahlendreher macht den ganzen Tag wertlos.

### 2.5 Wenn nRF Connect auf dem iPhone UUID, Major und Minor nicht zeigt

**Das ist ein bekannter Stolperstein und hier nicht abschließend geklärt.** Das Projekt nennt nRF Connect als Weg (`MARKT_EINRICHTEN.md`). Ob nRF Connect **auf iOS** bei euren Beacons den Abschnitt „Apple iBeacon“ mit allen drei Werten zeigt, ist **nicht bestätigt**: iOS liefert Apps die iBeacon-Daten unter Umständen nicht oder nur eingeschränkt. Test am Messtag: antippen und schauen. Fehlt der Abschnitt, geht es so weiter, in dieser Reihenfolge:

1. **Herstellerapp der Beacons** auf dem iPhone. Sie zeigt UUID, Major, Minor des verbundenen Beacons. Schritte: `CONFIGURE_BEACON.md` (Schritt 1 bis 4). Welche App es ist, steht noch nicht fest (`HARDWARE_SELECTION.md`). Bitte die Beacon-Verpackung oder das Etikett prüfen.
2. **Live-Beaconliste in der Indooro-Debug-App** (UUID, Major, Minor, RSSI): kommt mit Paket B, siehe Abschnitt [2.6](#b-schalter).
3. **Android-Handy mit nRF Connect** (Allgemeinwissen, im Repo nicht belegt): zeigt die iBeacon-Werte nach Erfahrung zuverlässig.
4. **Mac mit Xcode** und Debug-Build: die App schreibt `iBeacon Manufacturer erkannt uuid=… major=… minor=…` ins Log (`CONFIGURE_BEACON.md`, Abschnitt „Log-Schlüssel“). Das macht Erik oder Person A.

Hinweis: In Log und im Layout steht die UUID in Kleinbuchstaben ohne Striche. Beim Vergleichen gleich behandeln.

<a id="b-schalter"></a>
### 2.6 Platzhalter für Paket B (App-Schalter)

Diese Namen sind **noch nicht final**. Paket B füllt sie. Bis dahin gelten die heutigen Namen der Debug-App: **Messungen aufzeichnen**, **Szenario**, **Rolle** (Keine / Kalibrierung / Evaluation), **Marker**, **Sync-Marke setzen**.

| Wofür | Platzhalter |
| --- | --- |
| Rolle „Exploration“ wählen | `<<B: Schaltername Rolle Exploration>>` |
| Szenario wählen | `<<B: Schaltername Szenario>>` |
| Parallelbetrieb alt und neu aufnehmen (Shadow-Modus) | `<<B: Schaltername Shadow-Modus>>` |
| Live-Beaconliste (UUID, Major, Minor, RSSI) | `<<B: Ort der Beaconliste in den Einstellungen>>` |
| Aufnahme exportieren (Dateien-App) | `<<B: Exportweg>>` |
| Kennzeichnung gültiger Lauf | `<<B: Hinweis in der App>>` |

---

<a id="kontrolle"></a>
## 3 Kontrolle: stimmen die Werte?

Ziel: Das Backend kennt die echten Werte der 4 Beacons. **Erst dann** zählt der Rest.

1. **Werte senden** an Erik oder Claude: ein Foto/Screenshot der ausgefüllten `TESTRAUM_BEACON_WERTE.md` oder die Datei selbst. Nicht abtippen lassen.
2. **Codex trägt ein** (Admin-Bereich des Backends). Anleitung dafür: `docs/pilot-readiness/hardware/ADMIN_BEACONS_EINTRAGEN.md` und `docs/pilot-readiness/hardware/codex/CODEX_BEACON_EINTRAGUNG.md`. Du musst nichts im Admin ändern.
3. **Kontrolle auf dem Mac** (Repo-Wurzel):

   ```text
   scripts/field/check_testroom_beacons.sh
   ```

   Das Skript liest nur. **Ausgabe grün / Exit 0 heißt: keine Blocker.** Rot: Meldung lesen, Erik/Claude schicken, Eintrag korrigieren lassen, Skript neu laufen lassen.
4. **In der App prüfen:** Debug-App öffnen, Beaconliste in den Einstellungen (Platzhalter Abschnitt [2.6](#b-schalter)). **Alle 4 Beacons** müssen mit Major/Minor erscheinen und sich ändernde RSSI haben. Eine Person geht dazu zu jedem Beacon: Zahl wird stärker, wenn man näher kommt.
5. Erst wenn Schritt 3 grün **und** Schritt 4 vier Beacons zeigt: weiter mit Abschnitt 4.

Stolpert die App bei einem Beacon („passt zu keinem Beacon im aktiven Layout“), stimmt der Eintrag nicht mit dem Gerät überein. Zurück zu Schritt 1.

---

<a id="marker-und-massstab"></a>
## 4 Marker und Maßstab

### Das Raster

Das Layout ist ein Raster von **5 Zellen (x, nach rechts) × 9 Zellen (y, nach unten)**. Der Ursprung (0, 0) ist die Ecke oben links der Karte, an der `Indooro3` sitzt. In der App gilt **1 Zelle = 1 m** (die App rechnet die Karte in Meter, `MapView.swift`; `MARKT_EINRICHTEN.md`: „1 Zelle = 1 m“). Ob der echte Raum so groß ist, bestätigst du mit dem Maßband (Abschnitt 4.3).

Regale (aus dem Layout, Belegung in Zellen): Reihen y = 0 (komplett), 2, 4 und 6, jeweils links 1 Zelle (x = 0) und rechts 2 Zellen (x = 3 und 4). Frei sind die Mittelgasse (x = 1 und 2, alle Reihen) und die Querreihen y = 1, 3, 5, 7, 8.

### Die 8 Marker

Die IDs sind dieselben wie in der App (`M1` bis `M30` in der Auswahl; steht als `marker` in der Aufnahme). Koordinaten in Layout-Einheiten, das sind Zellmitten. Bei 1 Zelle = 1 m sind es auch Meter ab dem Ursprung.

| Marker | x | y | Lage |
| --- | --- | --- | --- |
| `M1` | 0,5 | 7,5 | unten links, Querreihe y = 7 |
| `M2` | 4,5 | 7,5 | unten rechts |
| `M3` | 4,5 | 5,5 | Querreihe y = 5, rechts |
| `M4` | 0,5 | 5,5 | Querreihe y = 5, links |
| `M5` | 0,5 | 3,5 | Querreihe y = 3, links |
| `M6` | 4,5 | 3,5 | Querreihe y = 3, rechts |
| `M7` | 4,5 | 1,5 | Querreihe y = 1, rechts |
| `M8` | 0,5 | 1,5 | Querreihe y = 1, links |

Alle Marker liegen auf freien Zellen, mindestens 1,5 m von jedem Beacon entfernt (nicht direkt unter einem Beacon).

<a id="marker-drucken"></a>
### 4.1 Drucken

Fertig vorhanden: `docs/pilot-readiness/hardware/marker/MARKER_SPAR-Leonding-002.html` (aus dem Layout vom 2026-11-19). Im Browser öffnen, **Drucken**, A4, Hochformat, Ränder Standard, **Hintergrundgrafiken an**. Seite 1 ist die Übersicht, Seite 2 bis 9 je ein Marker mit großer ID, Zelle, Meter, Pfeil zur Oberkante der Karte, Mini-Karte, Kästchen „Geklebt“ und „Geprüft“.

Hat sich das Layout geändert, neu erzeugen (Repo-Wurzel, nur lesend):

```text
python3 -I scripts/field/generate_marker_sheet.py --store SPAR-Leonding-002 --out docs/pilot-readiness/hardware/marker/MARKER_SPAR-Leonding-002.html
```

Bei abweichender Zellgröße (Abschnitt 4.3) `--cell-m 0.9` o. ä. anhängen. Das Skript warnt, wenn ein Marker auf einem Regal oder nahe an einem Beacon liegt.

### 4.2 Ausmessen und kleben

1. Den **Ursprung** festlegen: die Raumecke, die auf der Karte oben links ist (an `Indooro3`). Ein Kreuz aus Klebeband, beschriften „0,0“. Die Richtung „x nach rechts, y nach unten“ am Pfeil der Blätter prüfen.
2. Maßband **an der Wand entlang** auslegen. Für jeden Marker: Meter in x und y laut Blatt abmessen (nicht „nach Gefühl“).
3. Klebeband-**Kreuz** am Boden, die **Mitte** des Kreuzes ist der Marker. Blatt daneben legen oder darunter kleben.
4. Kästchen „Geklebt“ abhaken. Zweite Person misst nach, Kästchen „Geprüft“, Abweichung eintragen.
5. Zielgenauigkeit: **höchstens 0,3 m** Abweichung. Weicher: nachkleben.

### 4.3 Maßstab bestätigen

Das ist die wichtigste Prüfung. Stimmt der Maßstab nicht, sind alle Fehler in Metern falsch.

1. Lange Wand (Layout: 9 Zellen) mit dem Maßband messen. Notieren: ______ m.
2. Kurze Wand (Layout: 5 Zellen) messen. Notieren: ______ m.
3. Zellgröße = gemessene Länge geteilt durch 9, und durch 5. Beide Werte sollten ähnlich und nahe 1,00 m sein.
4. **Weicht die Zellgröße um mehr als 10 % von 1,00 m ab:** Stopp. Erik/Claude Bescheid geben. Dann werden Marker mit der echten Zellgröße neu erzeugt (`--cell-m`) und die Angaben im Positioning Lab angepasst. Nicht einfach weitermessen.
5. Ergebnis aufschreiben (Notizblatt): Wand lang, Wand kurz, Zellgröße, Datum, wer gemessen hat.

Hinweis zum Eingang: Im Layout ist **noch kein Eingang** eingetragen (wird gesetzt). Er hat auf die Messung keinen Einfluss. Eine Position des Eingangs für später (x/y in Zellen) ruhig auf dem Notizblatt festhalten.

---

<a id="ablauf"></a>
## 5 Ablauf der Begehungen

### 5.1 Wie viele Läufe

| Art | Anzahl | Rolle in der App | Zählt für die Entscheidung |
| --- | --- | --- | --- |
| **Bewertungslauf** | **mindestens 3** (besser 4 bis 5, falls einer ungültig ist) | **Evaluation** | **ja** |
| Zusatzlauf (Stehen an Markern, Rundgang zum Erkunden) | optional, nach den Bewertungsläufen | **Exploration** (Platzhalter `<<B: Schaltername Rolle Exploration>>`). Bis Paket B: Rolle **keine** | nein |

Läufe mit Rolle **Kalibrierung** gibt es heute nicht, nicht wählen. Läufe ohne Rolle oder mit Kalibrierung zählen **nie** für die Entscheidung (`POSITIONING_DECISION.md`, Abschnitt 3). Wählt vor jedem Bewertungslauf wirklich **Evaluation**.

### 5.2 Die feste Route

Ein Bewertungslauf ist **hin und zurück** in genau dieser Reihenfolge. Das sind etwa 70 m und 15 Wahrheitsmarker.

```text
Hin:     M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7 -> M8
Zurück:  M8 -> M7 -> M6 -> M5 -> M4 -> M3 -> M2 -> M1   (M8 nur einmal drücken, M1 am Anfang und am Ende)
```

Zwischen den Markern ist der Weg festgelegt, weil die Regale im Weg stehen:

| Von → nach | Weg | Länge |
| --- | --- | --- |
| M1 → M2 | gerade durch die Querreihe y = 7,5 | 4 m |
| M2 → M3 | links bis Mittelgasse (x = 2,0), 2 m hoch, rechts zu M3 | 7 m |
| M3 → M4 | gerade durch die Querreihe y = 5,5 | 4 m |
| M4 → M5 | rechts bis Mittelgasse (x = 2,0), 2 m hoch, links zu M5 | 5 m |
| M5 → M6 | gerade durch die Querreihe y = 3,5 | 4 m |
| M6 → M7 | links bis Mittelgasse, 2 m hoch, rechts zu M7 | 7 m |
| M7 → M8 | gerade durch die Querreihe y = 1,5 | 4 m |

Rückweg: die gleichen Wege rückwärts. Nie quer durch ein Regal. Die Mittelgasse ist die Spalte zwischen den Regalreihen (x von 1 bis 3).

Ein Lauf hat dann etwa 70 m. Bei 0,7 bis 1 m/s sind das etwa 70 bis 100 Sekunden, grob 200 bis 290 Auswertungsschritte. Das ist deutlich über den geforderten 100 Epochen (Auswertungstakt 0,35 s, `scripts/field/README.md`).

### 5.3 Gehen und Marker setzen

**Person mit dem iPhone (Rolle „Telefon“):**

1. Vor dem Start: Einstellungen, Debug. **Rolle: Evaluation.** **Szenario: S2** (Gehschleife). Marker-Auswahl auf **keiner** lassen (Zuordnung läuft über die Koordinate, `MEASUREMENT_PROTOCOL.md`, Abschnitt 2). Das Umstellen der Marker-Nummer in den Einstellungen kostet zu viel Zeit im Gehen. Kommt von Paket B ein schnellerer Weg, gilt der: `<<B: Schaltername Marker schnell wählen>>`.
2. **Messungen aufzeichnen** einschalten, Einstellungen schließen. Rotes Zeichen **REC · 0 Marker** muss oben links sichtbar sein.
3. iPhone **wie beim Einkaufen** halten: in der Hand vor dem Körper, Bildschirm zu dir, App im Vordergrund. Nicht in die Tasche, nicht am Ohr.
4. **Ruhig am Marker M1 stehen**, 0,6 s lang auf die Karte drücken **an der Stelle des Markers** (die Stelle auf der Karte, wo M1 liegt: Zelle Spalte 1, Reihe 8; Position liegt auf der Karte relativ zu den Regalen). Vibration spüren, Zähler = 1.
5. **Losgehen.** Nicht stehen bleiben.
6. An jedem Marker **im Gehen**: kurz langsamer werden, über dem Marker 0,6 s lang drücken, weitergehen. Zähler nach jedem Druck mit der Zahl der Drücke bisher vergleichen (nach M3: Zähler 3; nach dem Wenden an M8: Zähler 8).
7. Am Ende (M1 zurück): letzter Druck, stehen bleiben, **Messungen aufzeichnen aus**.
8. Die Datei hat einen Zeitstempel. **Dateiname und Lauf-Nummer auf dem Notizblatt notieren** (Läufe: E1, E2, E3 …).

**Gehtempo:** gleichmäßig, **etwa 0,7 bis 1 m/s** (kleiner, ruhiger Schritt, etwa ein Schritt pro Sekunde). Nicht rennen, nicht zögern. Immer dasselbe Tempo in allen Läufen.

**Marker-Treffer:** Der Tipp auf der Karte bestimmt die Referenz. Wer den falschen Punkt tippt, verfälscht die Messung. Zu Hause üben (Abschnitt 1.4). Kartengröße in den Einstellungen so wählen, dass die Regale gut sichtbar sind und eine Zelle gut tippbar ist. Zoom (Maßstab-Regler) vorher festlegen und **für alle Läufe gleich lassen**.

**Person mit Notizblatt (Rolle „Marker und Notizen“):** geht **hinter** dem iPhone-Träger, hält Abstand 2 m, und

- zählt laut mit („M3“) und prüft den Zähler,
- stoppt die Zeit,
- notiert Auffälligkeiten (Person kreuzt, Beacon ausgefallen, App ruckelt, iPhone gesperrt) mit Uhrzeit,
- ruft „Stopp, Lauf ungültig“, wenn ein Kriterium aus 5.4 eintritt.

### 5.4 Wann ein Lauf ungültig ist (wiederholen)

Ungültig und **sofort neu starten** (alte Datei nicht löschen, auf dem Notizblatt als „ungültig“ markieren, **nicht auswerten**):

- Fehlende Marker: weniger Drücke als 15 (oder einer an der falschen Stelle).
- App abgestürzt, im Hintergrund, iPhone gesperrt, Anruf oder Mitteilung auf dem Bildschirm.
- Bluetooth oder Ortung aus.
- Ein Beacon fällt aus, wird bewegt oder berührt (Batterie, Wackler).
- Weg verlassen (Regal, falsche Reihenfolge), Stehen bleiben länger als 3 Sekunden.
- Andere Rolle als **Evaluation** oder Aufnahme ohne Rolle.
- Der Lauf ist kürzer als 60 Sekunden (zu schnell) oder länger als 4 Minuten.
- Die Datei hat keine Kopfzeile oder ist leer (Abschnitt 7).

Nicht ungültig sind kurze Ausschläge der Anzeige. Die zeigt das spätere Programm. Nicht „glätten“, nicht schönen.

**Mindestens 3 gültige Läufe.** Hat die Entscheidung am Ende weniger, heißt sie „noch nicht“ (`POSITIONING_DECISION.md`).

### 5.5 Rollen

<a id="rollen"></a>

| Rolle | Aufgabe | bei 2 Personen |
| --- | --- | --- |
| **Telefon** | Geht mit dem iPhone, drückt die Marker | Person 1 |
| **Marker und Notizen** | Geht hinter dem Telefon, zählt, stoppt, notiert, entscheidet „ungültig“ | Person 2 |
| **Maßband und Sicherheit** | Räumt den Weg frei, hält andere Leute fern, wechselt Batterien, trägt Zeiten ein | Person 2 mit |

Mindestens eine Person bleibt immer beim Notizblatt. Die Person am iPhone wechselt **nicht** während einer Messung. Wenn möglich, wechseln nach 3 Läufen (anderer Handgriff, anderes Tempo), damit zwei Gehweisen vorkommen (`POSITIONING_DECISION.md`, Abschnitt 3: Empfehlung).

### 5.6 Zeitplan (ca. 90 Minuten)

| Zeit | Was | Wer |
| --- | --- | --- |
| 0:00 bis 0:10 | Material auspacken, Raum freiräumen, Batterien prüfen | alle |
| 0:10 bis 0:25 | Beacons ablesen (Abschnitt 2) und Werte senden. Parallel: Ursprung und Marker kleben (4.2) | Person 1 liest, Person 2 klebt |
| 0:25 bis 0:35 | Kontrolle (Abschnitt 3): Skript grün, App zeigt 4 Beacons. Maßstab messen (4.3) | alle |
| 0:35 bis 0:40 | Probelauf (nicht werten) | Telefon, Notizen |
| 0:40 bis 1:10 | **Bewertungsläufe E1, E2, E3** (je 5 Minuten inklusive Notizen) und bei Bedarf E4. Zwischen den Läufen 3 Minuten Pause: Akku prüfen, Notizen vergleichen, Dateinamen eintragen | Telefon, Notizen, Sicherheit |
| 1:10 bis 1:20 | Optional: Zusatzlauf (Exploration), oder ungültige Läufe wiederholen | wie vorher |
| 1:20 bis 1:30 | Dateien auf den Mac (AirDrop), Material einpacken, Marker abkleben | alle |

Auswerten (Abschnitt 6) am selben Tag oder spätestens am nächsten.

---

<a id="danach"></a>
## 6 Danach

Alles auf dem Mac, im Repo (`cd` in das Repo-Verzeichnis).

1. **Export:** Auf dem iPhone Einstellungen, Debug, Datei antippen, **Teilen**, **AirDrop** an den Mac. Oder Dateien-App: Auf meinem iPhone, Indooro, `NavigationRecordings`. `<<B: Exportweg>>` Der Dateiname ist ein Zeitstempel und enthält keine Gerätekennung.
2. **Ordner anlegen** (Beispiel, Datum anpassen) und alle **gültigen** Dateien hineinlegen. Ungültige Läufe **nicht** hineinlegen:

   ```text
   mkdir -p swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/messtag-2026-11-19
   ```

   Der Ordner `incoming/` wird von Git ignoriert, es landen keine Rohdaten im Repo.
3. **Ein Befehl** (Repo-Wurzel). Er anonymisiert die Dateien, analysiert sie, vergleicht alte und neue Positionsberechnung, wendet die Entscheidungsregel an, übernimmt die Ergebnisse in das Positioning Lab und schreibt den deutschen Bericht `BERICHT.md` und den Kommentartext `KOMMENTAR_195.md`:

   ```text
   scripts/field/evaluate_field_day.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/messtag-2026-11-19
   ```

   Die Ausgabe nennt, **wo** `BERICHT.md` und `KOMMENTAR_195.md` liegen. Optionen und Exit-Codes: Paket E, `scripts/field/README.md`.
4. **Bericht lesen:** `BERICHT.md` öffnen. Zuerst lesen:
   - **Wie viele Läufe zählen?** Mindestens 3 gültige Evaluationsläufe? Sonst steht dort „EXPLORATIV“ und die Antwort heißt „noch nicht“.
   - **Gehörte Beacons:** alle 4 in jedem Lauf?
   - **Ergebnis** der Regel: **BESSER**, **GLEICHWERTIG**, **SCHLECHTER**, **GEMISCHT**, **EXPLORATIV** (Bedeutung: `POSITIONING_DECISION.md`, Abschnitt 4). Erwartet ist GLEICHWERTIG (Abschnitt 5 dort).
   - **Hinweise** und **Grenzen** nicht überspringen.
5. **Entscheidung in #195 posten:** Der Text in `KOMMENTAR_195.md` ist dafür gedacht. Kopieren und in Story #195 als Kommentar einfügen. **Nicht** ändern, was die Zahlen aussagen. Zusätzlich: Uhrzeit, wer das iPhone getragen hat, Besonderheiten aus dem Notizblatt.
6. Die Entscheidung heißt zunächst nur: „Das Team darf in einem eigenen Change vorschlagen, die Engine hinter dem Flag einzuschalten.“ Es wird **nichts** eingeschaltet (`POSITIONING_DECISION.md`, Abschnitt 1).
7. Zum Schluss Marker vom Boden entfernen, Beacons: jetzt wie im Layout belassen oder einpacken, Batterie-Datum in `beacons.csv`.

---

<a id="fehlerbehebung"></a>
## 7 Fehlerbehebung

### Beacon nicht sichtbar

- Nächster Schritt: Batterie, Beacon einschalten (Hinweis des Herstellers beachten), mit dem iPhone **1 m** davor halten.
- iPhone Bluetooth **an**? Ortung für Indooro **Beim Verwenden**?
- Zeigt nRF Connect den Beacon, die Indooro-App aber nicht, stimmt der Eintrag im Backend nicht (UUID, Major, Minor). Zurück zu Abschnitt 3, Skript rot?
- App zeigt „passt zu keinem Beacon im aktiven Layout“ (Einstellungen: orange Zeile „Ohne Layout-Treffer: Major-Minor“): Der Beacon sendet, aber das Layout kennt die Werte nicht.
- Zwei Beacons mit gleichen Werten? Dann jeden einzeln nehmen, Abschnitt 2.4.
- Nach Batteriewechsel hat sich nichts geändert: neuer Beacon-Versuch, andere Batterie, Ersatzbeacon.

### Position springt

- Erst prüfen: Ist die App im Vordergrund? Hält jemand das iPhone anders (Tasche, Brust)?
- Nicht „glätten“, nicht „schönen“. Sprünge sind ein **Messwert**, kein Fehler im Ablauf. Notieren, Lauf zählt, wenn er sonst gültig ist (5.4).
- Wenn **alle** Läufe stark springen: Beacon-Positionen im Layout prüfen (stimmen sie mit dem Maßband?) und Maßstab (Abschnitt 4.3).
- Ein Beacon fehlt oder ist schwach: Batterie, Abschirmung (Metall, Regal, Menschen davor).

### App stürzt ab

- Lauf ist **ungültig** (5.4). Neue Datei, neuer Lauf.
- App neu öffnen, Rolle und Szenario neu wählen (sie werden nicht immer behalten).
- Absturz öfter als einmal: iPhone neu starten, Debug-App neu installieren, Reserve-iPhone nehmen. Notieren, wann und wo.
- Die Datei vor dem Absturz bleibt meist lesbar, zählt aber nicht als gültiger Lauf.

### Export leer oder fehlt

- Ist **Messungen aufzeichnen** am Ende ausgeschaltet worden? Die Datei wird erst dann sauber geschlossen.
- Datei ist 0 Byte: es wurde nichts geschrieben (App abgestürzt, Aufzeichnung nie gestartet). Neu aufnehmen.
- Keine Datei in der Liste: Debug-Build? (Release hat keinen Recorder, Abschnitt 1.3.) App neu öffnen, Einstellungen, Debug.
- AirDrop kommt nicht an: Dateien-App, Auf meinem iPhone, Indooro, `NavigationRecordings`. Oder per Kabel mit dem Mac (Finder, iPhone, Dateien). `<<B: Exportweg>>`
- Auswertung meldet „Anonymisierung fehlgeschlagen“: Datei nicht von Hand ändern. Dateiname und Meldung an Erik/Claude.
- Auswertung meldet „keine Epoche mit Referenz“: keine Wahrheitsmarker in der Datei. Der Lauf hat keine langen Drücke (Abschnitt 5.3, Zähler). Lauf ungültig, wiederholen.

### Etwas anderes

Aufschreiben (Uhrzeit, was war), weitermachen, Erik fragen. Keine Dateien löschen, keine Werte raten.

---

## Anhang: wo steht was

- Konventionen der Aufnahme (Format `indooro-recording/2`, `truth`, `sync`): `MEASUREMENT_PROTOCOL.md`, Abschnitt 2.
- Szenarien S1 bis S4: `MEASUREMENT_PROTOCOL.md`, Abschnitt 4. Für die Entscheidung #195 genügt S2 (Gehschleife).
- Beacon-Identität (UUID, Major, Minor, Etikett): `BEACON_STANDARD.md`, `CONFIGURE_BEACON.md`.
- Kennzahlen und Regel: `POSITIONING_DECISION.md`, `tools/beacon-lab/docs/METRICS.md`.
- Lab (technische Tiefe): `tools/beacon-lab/docs/FIELD_GUIDE.md`.
