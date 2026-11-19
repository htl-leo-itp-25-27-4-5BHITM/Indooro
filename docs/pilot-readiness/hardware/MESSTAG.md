# Messtag Testraum: die Anleitung

Stand: 2026-11-19 · Story [#195](https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro/issues/195) · Raum: HTL-Testraum „Spar HTL Leonding“ (Markt `SPAR-Leonding-002`)

**Ziel:** Wir wollen wissen, ob die neue Positionsberechnung der App besser ist als die alte. Dafür gehen wir im Testraum feste Wege mit einem iPhone und die App schreibt dabei Messdaten auf. Ein Programm vergleicht danach alt und neu.

**Das ist die einzige Einstiegsseite.** Zum Ausdrucken: `MESSTAG_CHECKLISTE.md`. Du brauchst keine Programmierkenntnisse. Bei jedem Schritt steht, **wer** ihn macht: **Wer: Team** (Schüler:innen vor Ort) oder **Wer: Erik** (Mac und Admin). Unklar? Aufschreiben, weitermachen, Erik fragen.

**Kontakt am Tag:** Erik, Telefon `<<Telefon Erik>>`.
**Notfallregel:** Läuft etwas nicht (App stürzt wiederholt ab, Beacon fällt aus, Raum nicht frei): **abbrechen, nichts löschen, Erik anrufen, neuen Termin machen.** Ein abgebrochener Tag ist kein Fehler.

## Zwei Termine

| Termin | Dauer | Was | Wer |
| --- | --- | --- | --- |
| **Vortermin** | ca. 30 Minuten | Beacons mit nRF Connect ablesen, Raum mit dem Maßband prüfen, Werte an Erik | Team |
| dazwischen | ein paar Stunden bis Tage | Erik trägt die Werte ein und prüft sie (Abschnitt 3) | Erik |
| **Messtag** | ca. 90 Minuten | Marker kleben, 3 Läufe gehen (plus Reserve), Dateien exportieren | Team, Erik am Mac danach |

Am Messtag braucht ihr im Raum **nur das iPhone** (und Papier). Kein Mac, kein Internet nötig.

**Raum reservieren:** Der Testraum gehört der Schule. **Beide Termine vorher bei der zuständigen Lehrkraft reservieren** und fragen, ob Klebeband am Boden erlaubt ist (sonst Malerkrepp, der sich rückstandsfrei löst, oder Marker nur mit Blättern und Gewichten legen). Ohne Zusage nicht anfangen.

Inhalt: [Glossar](#glossar) · [1 Vorbereitung](#vorher-zu-hause) · [2 Vortermin: Beacons ablesen](#beacons-ablesen) · [3 Kontrolle](#kontrolle) · [4 Marker und Maßstab](#marker-und-massstab) · [5 Läufe am Messtag](#ablauf) · [6 Danach](#danach) · [7 Fehlerbehebung](#fehlerbehebung) · [Für Entwickler](#fuer-entwickler)

<a id="glossar"></a>
## Glossar

| Wort | Bedeutung |
| --- | --- |
| **Beacon** | Kleiner Funksender mit Batterie. Das iPhone hört ihn und schätzt daraus, wo es im Raum ist. Im Testraum gibt es 4. |
| **UUID, Major, Minor** | Die „Ausweisnummer“ eines Beacons. Die App erkennt ihn daran. Muss genau stimmen. |
| **RSSI** | Signalstärke in dBm. Näher an 0 (zum Beispiel −55) heißt: nah am Beacon. −90 heißt: weit weg. |
| **Marker** | Ein Klebeband-Kreuz am Boden mit bekannter Position (M1 bis M8). |
| **Wahrheitsmarker** | Ein langer Druck (0,6 s) auf die Karte in der App, wenn man auf einem Marker steht. So weiß die App: „Hier war ich wirklich.“ |
| **Begehung / Lauf** | Einmal die feste Route gehen, mit eingeschalteter Aufnahme. Eine Begehung ergibt eine Datei. |
| **Durchgang „Evaluation“** | Läufe, die für die Entscheidung zählen (E1 bis E3, Reserve E4). |
| **Durchgang „Exploration“** | Zusätzliche Läufe zum Ausprobieren (X1). Zählen nicht für die Entscheidung. |
| **Epoche** | Ein Auswertungsschritt (alle 0,35 s eine geschätzte Position). Pro Lauf brauchen wir mindestens 100. |
| **Debug-App** | Besondere Version der Indooro-App, die aufnehmen kann. Die normale App und TestFlight können das nicht. |
| **Admin** | Die Verwaltungsseite des Backends, in der Beacons eingetragen werden. Nur Erik. |
| **Codex** | Ein KI-Assistent, den Erik bedient. Er trägt die Beacon-Werte im Admin ein. Ihr müsst nichts damit tun. |
| **Repo** | Der Ordner mit dem ganzen Projekt auf Eriks Mac. |
| **Positioning Lab** | Programm, das Messdaten ansieht und vergleicht (Eriks Mac). |
| **Anonymisieren** | Namen und Gerätekennungen aus den Dateien entfernen, bevor sie ausgewertet oder abgelegt werden. Das macht das Auswertungsprogramm. |
| **#195** | Die Aufgabe (GitHub-Issue) zu dieser Messung. Erik schreibt das Ergebnis dort als Kommentar. |

Dateien, die dazugehören:

| Datei | Wofür |
| --- | --- |
| `docs/pilot-readiness/hardware/MESSTAG_CHECKLISTE.md` | Eine Seite zum Abhaken (ausdrucken) |
| `docs/pilot-readiness/hardware/TESTRAUM_BEACON_WERTE.md` | Vorlage für die abgelesenen Beacon-Werte (**ausdrucken**, vom Team ausgefüllt). Spalten: Etikett, Zelle (x, y), UUID, Major, Minor, Admin-Name, TX-Power, abgelesen von/Datum |
| `docs/pilot-readiness/hardware/marker/MARKER_SPAR-Leonding-002.html` | Druckbogen der Marker |
| `docs/pilot-readiness/hardware/POSITIONING_DECISION.md` | Die Entscheidungsregel (nicht ändern) |

---

<a id="vorher-zu-hause"></a>
## 1 Vorbereitung

### 1.1 Material

**Vortermin (Wer: Team):**

- [ ] Ausgedrucktes `TESTRAUM_BEACON_WERTE.md` (1 Blatt), Stift
- [ ] iPhone mit der App **nRF Connect for Mobile** (kostenlos im App Store)
- [ ] 4 neue Batterien (Typ des Beacons auf dem Gerät nachsehen), dazu 4 Ersatzbatterien
- [ ] Maßband (mindestens 10 m)
- [ ] Leiter oder Stuhl, wenn Beacons hoch hängen
- [ ] Handy mit Telefonnummer von Erik

**Messtag (Wer: Team):**

- [ ] iPhone mit der Debug-App (Erik installiert sie vorher), Powerbank und Kabel, Reserve-iPhone wenn möglich
- [ ] Marker-Blätter gedruckt (9 Seiten), Malerkrepp/Klebeband, Schere
- [ ] Maßband, Notizblatt mit Laufblatt (siehe `MESSTAG_CHECKLISTE.md`), 2 Stifte
- [ ] Stoppuhr (Handy-Uhr einer zweiten Person)
- [ ] Ersatzbatterien für die Beacons

### 1.2 Erik bereitet vor (Wer: Erik)

- [ ] Debug-App auf dem iPhone installieren (Anleitung: `APP_AUFS_IPHONE.md`, kommt noch). Die Debug-App ist **nötig**, die normale App kann nicht aufnehmen.
- [ ] `TESTRAUM_BEACON_WERTE.md` und `MESSTAG_CHECKLISTE.md` und die Marker-Blätter für das Team drucken.
- [ ] Raum reservieren (siehe oben).

### 1.3 iPhone einstellen (Wer: Team, am Messtag, vor dem ersten Lauf)

- [ ] Bluetooth **an**
- [ ] Ortungsdienste an, Indooro: **Beim Verwenden der App**
- [ ] Bewegung und Fitness für Indooro **erlauben**
- [ ] Anzeige und Helligkeit, Automatische Sperre: **Nie**
- [ ] Nicht stören: **an**, Flugmodus aus
- [ ] iPhone zu mindestens 90 % geladen

### 1.4 Probeaufnahme (Wer: Team, zu Hause oder am Messtag zum Üben)

1. Debug-App öffnen, Zahnrad (Einstellungen), Abschnitt **Debug**. Fehlt er: das ist keine Debug-App. Stopp, Erik fragen.
2. Rolle **Evaluation**, Szenario **S2** wählen. **Messungen aufzeichnen** einschalten, Einstellungen schließen. Oben links erscheint das rote Zeichen **REC · 0 Marker**.
3. **0,6 Sekunden lang** auf die Karte drücken. Es vibriert kurz, der Zähler springt auf 1. Keine Vibration, kein Marker.
4. Einstellungen, **Messungen aufzeichnen** ausschalten. Unten erscheint eine Datei mit Zeitstempel. Antippen, **Teilen**, AirDrop an Eriks Mac.

Die Probe wird nicht ausgewertet.

---

<a id="beacons-ablesen"></a>
## 2 Vortermin: Beacons ablesen (nRF Connect)

**Wer: Team.** Dauer ca. 30 Minuten.

**Warum:** Im Backend stehen für den Testraum noch nicht die echten Werte jedes Beacons. Ohne sie ordnet die App die Signale nicht zu. Die Werte stehen **im Beacon selbst**. Ihr lest sie ab. **Ihr ändert nichts und hängt keinen Beacon um.**

**Wie viele:** 4 Beacons. Im Layout stehen sie (nur zur Orientierung, wo sie hängen sollten):

| Name im Layout | Zelle (x, y) | Ecke im Raum |
| --- | --- | --- |
| `Indooro3` | 0, 0 | oben links (hier beginnt die Zählung, siehe Abschnitt 4) |
| `Indooro2` | 5, 0 | oben rechts |
| `Indooro4` | 0, 9 | unten links |
| `Indooro1` | 5, 9 | unten rechts |

Welcher echte Beacon (Etikett `IND-…`) in welcher Ecke hängt, schreibt ihr auf. **Erik entscheidet danach**, welcher Layout-Name zu welchem Gerät gehört, aus eurer Zelle. Ihr sortiert nichts um.

### 2.1 Batterien

Zu Beginn des Vortermins in **jeden** Beacon eine **neue Batterie** einlegen (Beacon dazu abnehmen oder an der Stelle öffnen). **Datum der Batterie auf das Blatt** `TESTRAUM_BEACON_WERTE.md` schreiben. Erik überträgt es später in die Liste. Am Messtag werden Batterien **nicht** gewechselt, nur bei einem Ausfall.

### 2.2 So sieht der Bildschirm aus

nRF Connect öffnen, Bluetooth erlauben.

- Unten eine Leiste. Der Reiter **Scanner** ist der richtige. Er listet alle Geräte, die Bluetooth senden.
- Jede Zeile ist ein Gerät: links der Name oder „N/A“, rechts eine Zahl mit **dBm**. Das ist der **RSSI**.
- Tippst du eine Zeile an, öffnen sich die Details („Advertising data“). Bei einem iBeacon soll ein Abschnitt **Apple iBeacon** erscheinen (Quelle: `docs/pilot-readiness/operations/MARKT_EINRICHTEN.md`). Die Menütexte können in eurer App-Version etwas anders heißen.

### 2.3 Was ihr aufschreibt

Pro Beacon eine Zeile auf dem Blatt:

| Feld | Was es ist | Beispiel |
| --- | --- | --- |
| Etikett | Aufkleber am Beacon | `IND-1-3` |
| Zelle (x, y) | Ecke, in der er hängt (Tabelle oben) | 0, 9 |
| **UUID** | lange Kennung | `B5CAA23B-BB89-4040-99D2-FCED3EA4A62B` |
| **Major** | Zahl | `1` |
| **Minor** | Zahl | `3` |
| Admin-Name | falls bekannt, sonst leer | `Indooro4` |
| **TX Power** | falls angezeigt („TX Power“ oder „Measured power“), sonst leer | `−59` |
| abgelesen von / Datum | Name und Tag | |
| RSSI | Wert dicht am Beacon | `−48` |
| Batterie-Datum | siehe 2.1 | |

**Regel:** Schreibt **genau auf, was angezeigt wird**, auch wenn es seltsam aussieht (zum Beispiel andere UUID als im Projekt-Standard, oder Major/Minor fehlt). Nichts korrigieren, nicht raten, **weitermachen**. Das Prüfprogramm von Erik entscheidet, ob es passt. Das ist kein Grund, aufzuhören. Fehlt ein Feld ganz: „nicht angezeigt“ schreiben.

### 2.4 Einen Beacon nach dem anderen erkennen

Alle 4 senden gleichzeitig, deshalb erscheinen mehrere Zeilen. So findet ihr den richtigen:

1. Mit dem iPhone so nah wie möglich an den Beacon (bei hoch hängenden Beacons Leiter oder Stuhl, iPhone nach oben halten, soweit ihr kommt).
2. In der Liste die Zeile mit der **stärksten Zahl** nehmen (am nächsten bei 0, meist besser als −60). Das ist dieser Beacon.
3. **Gegenprobe:** 5 Schritte weggehen. Die Zahl in genau dieser Zeile muss deutlich schlechter werden (zum Beispiel von −50 auf −70). Wird sie es nicht, war es ein anderer Beacon.
4. Zeile antippen, Werte ablesen, **Screenshot** (Seitentaste und Lauter) als Beleg.
5. Nächster Beacon.
6. Am Ende alle Zahlen **noch einmal gegenlesen**. Ein Zahlendreher macht die Messung wertlos.

### 2.5 Wenn nRF Connect UUID, Major, Minor nicht zeigt

Das kommt vor und ist **hier nicht abschließend geklärt**: iOS gibt Apps die iBeacon-Daten unter Umständen nicht oder nur eingeschränkt weiter. Ob es bei euren Beacons klappt, zeigt sich vor Ort. Fehlt der Abschnitt „Apple iBeacon“:

1. **Herstellerapp der Beacons** auf dem iPhone. Welche App es ist, steht noch nicht fest (`HARDWARE_SELECTION.md`). Verpackung oder Etikett prüfen. Schritte: `CONFIGURE_BEACON.md` (Schritt 1 bis 4). Nur ansehen, nichts ändern.
2. **Ein Android-Handy mit nRF Connect** (allgemeiner Erfahrungswert, im Projekt nicht belegt).
3. Sonst: **Screenshot der Liste** machen, Zellen und Etiketten notieren und Erik schicken. Erik liest die Werte mit Xcode am Mac aus der Debug-App aus (`CONFIGURE_BEACON.md`, Abschnitt „Log-Schlüssel“).

### 2.6 Maßstab prüfen (auch Vortermin)

Zählt in Abschnitt 4.3. Danach: **Blatt und Fotos an Erik** (Telefon oder Foto).

### 2.7 Platzhalter für die App (werden noch ergänzt)

Diese Namen sind **noch nicht final**. Bis dahin gelten die heutigen Namen der Debug-App: **Messungen aufzeichnen**, **Szenario**, **Rolle** (keine / Kalibrierung / Evaluation), **Marker**, **Sync-Marke setzen**.

| Wofür | Platzhalter |
| --- | --- |
| Rolle „Exploration“ wählen | `<<B: Schaltername Rolle Exploration>>` |
| Szenario wählen | `<<B: Schaltername Szenario>>` |
| Parallelbetrieb alt und neu aufnehmen | `<<B: Schaltername Shadow-Modus>>` |
| Liste der gehörten Beacons (UUID, Major, Minor, RSSI) | `<<B: Ort der Beaconliste in den Einstellungen>>` |
| Aufnahme exportieren | `<<B: Exportweg>>` |
| Hinweis „gültiger Lauf“ in der App | `<<B: Hinweis in der App>>` |
| Marker schnell wählen | `<<B: Schaltername Marker schnell wählen>>` |
| Zelle auf der Karte erkennen (wo ist „Spalte 4, Reihe 7“?) | `<<B: Kartenraster oder Zellennummern anzeigen>>` |

---

<a id="kontrolle"></a>
## 3 Kontrolle: stimmen die Werte?

**Ziel:** Das Backend kennt die echten Werte der 4 Beacons. Das passiert **zwischen** den Terminen, nicht im Raum.

**Wer: Erik** (Admin und Mac). Das Team muss hier nichts tun.

1. Blatt und Screenshots vom Vortermin entgegennehmen, gegenlesen.
2. Layout-Namen zu Geräten zuordnen: aus den notierten Zellen (Tabelle in Abschnitt 2). Die Beacons werden **nicht** umgehängt.
3. Werte eintragen lassen: Codex (der KI-Assistent) trägt sie im Admin ein, während Erik angemeldet ist. Anleitungen: `docs/pilot-readiness/hardware/ADMIN_BEACONS_EINTRAGEN.md` und `docs/pilot-readiness/hardware/codex/CODEX_BEACON_EINTRAGUNG.md`. Plane dafür ruhig 1 bis 2 Stunden, nicht 15 Minuten.
4. Prüfen:

   > **Für Erik (Mac), Repo-Wurzel:**
   > ```text
   > scripts/field/check_testroom_beacons.sh
   > ```
   > Das Skript liest nur. **Exit 0 = keine Blocker.** Sonst Meldung lesen, Eintrag korrigieren lassen, neu laufen lassen.
5. Batterie-Datum in `docs/pilot-readiness/hardware/beacons.csv` übertragen.
6. Erst bei Exit 0 den Messtag ansetzen.

**Am Messtag, im Raum (Wer: Team):** In der Debug-App die Beaconliste öffnen (`<<B: Ort der Beaconliste in den Einstellungen>>`). **Alle 4 Beacons** müssen mit sich änderndem RSSI erscheinen (nah dran wird die Zahl stärker). Fehlt einer: Abschnitt 7, sonst nicht starten.

---

<a id="marker-und-massstab"></a>
## 4 Marker und Maßstab

### 4.1 Das Raster und wie man Zellen zählt

Der Raum ist ein Raster von **5 Zellen nach rechts (x) × 9 Zellen nach unten (y)**. In der App ist 1 Zelle = 1 m. Ob der echte Raum so groß ist, prüft ihr in 4.3.

**Zählregel:** Die Zählung beginnt **bei 0** an der Ecke, an der der Beacon **`Indooro3`** hängt (Ecke oben links auf der Karte). Die erste Zelle ist Spalte 0, Reihe 0. Von dort zählt ihr nach rechts (Spalte) und nach unten (Reihe). Der Marker liegt **in der Mitte** der genannten Zelle. Beispiel M2: Spalte 4, Reihe 7 heißt: 4 Zellen nach rechts, 7 Zellen nach unten, dann mitten in diese Zelle. Das gleiche steht auf jedem Marker-Blatt („So zählen“).

Wo genau diese Ecke im echten Raum ist, legt ihr am Messtag so fest, dass Karte und Raum gleich ausgerichtet sind: die Ecke, in der `Indooro3` hängt (Etikett prüfen, Vortermin-Blatt).

### 4.2 Die 8 Marker

IDs wie in der App (Auswahl M1 bis M30). Koordinaten in Zellen (Zellmitte).

| Marker | x | y | Zelle (Spalte, Reihe) | Lage |
| --- | --- | --- | --- | --- |
| `M1` | 0,5 | 7,5 | 0, 7 | unten links |
| `M2` | 4,5 | 7,5 | 4, 7 | unten rechts |
| `M3` | 4,5 | 5,5 | 4, 5 | rechts |
| `M4` | 0,5 | 5,5 | 0, 5 | links |
| `M5` | 0,5 | 3,5 | 0, 3 | links |
| `M6` | 4,5 | 3,5 | 4, 3 | rechts |
| `M7` | 4,5 | 1,5 | 4, 1 | rechts |
| `M8` | 0,5 | 1,5 | 0, 1 | oben links |

Alle Marker liegen auf freien Zellen (nicht auf Regalen) und mindestens 1,5 m von jedem Beacon entfernt.

**Zum Ausdrucken:** `docs/pilot-readiness/hardware/marker/MARKER_SPAR-Leonding-002.html`. Im Browser öffnen, Drucken, A4 Hochformat, **Hintergrundgrafiken an**. Seite 1 Übersicht, Seite 2 bis 9 je ein Marker mit großer ID, Zelle, „So zählen“, Meter, Mini-Karte und Pfeil zur Oberkante der Karte (dorthin zeigt der Pfeil, wenn das Blatt richtig liegt).

> **Für Erik (Mac), Repo-Wurzel, nur nötig wenn sich Layout oder Zellgröße ändert** (liest nur):
> ```text
> python3 -I scripts/field/generate_marker_sheet.py --store SPAR-Leonding-002 --out docs/pilot-readiness/hardware/marker/MARKER_SPAR-Leonding-002.html
> ```
> Mit abweichender Zellgröße, zum Beispiel 0,9 m, ergänzt: `--cell-m 0.9`.

### 4.3 Maßstab prüfen (Vortermin, Wer: Team)

Das Maßband zeigt, ob 1 Zelle wirklich 1 m ist.

1. Lange Wand messen (soll 9 Zellen = 9 m sein): ______ m
2. Kurze Wand messen (soll 5 Zellen = 5 m sein): ______ m
3. Auf das Blatt schreiben, Foto vom Maßband an der Wand.
4. **Mehr als 10 % Abweichung** (zum Beispiel lange Wand unter 8,1 m oder über 9,9 m)? Dann **nur die gemessenen Werte aufschreiben und Erik Bescheid geben.** Ihr entscheidet nichts. Erik entscheidet, ob die Marker neu erzeugt werden oder der Termin verschoben wird.

Der **Eingang** ist im Layout noch nicht eingetragen. Er stört die Messung nicht. Wenn ihr wollt: Zelle des Eingangs aufs Blatt schreiben.

### 4.4 Marker kleben (Messtag, Wer: Team)

1. Ursprung: Ecke mit `Indooro3`. Kreuz aus Klebeband, „0,0“ daneben.
2. Maßband an der Wand entlang. Jeden Marker laut Blatt abmessen (Meter in x und y), nicht „nach Gefühl“.
3. Klebeband-Kreuz am Boden, **die Mitte des Kreuzes ist der Marker.** Blatt daneben.
4. Zweite Person misst nach. Abweichung höchstens 0,3 m. Kästchen „Geklebt“ und „Geprüft“ abhaken, Abweichung eintragen.

---

<a id="ablauf"></a>
## 5 Läufe am Messtag

### 5.1 Anzahl der Läufe (fest)

| Lauf | Anzahl | Durchgang in der App | Zählt für #195 |
| --- | --- | --- | --- |
| **E1, E2, E3** | **3, Pflicht** | **Evaluation** | ja |
| **E4** | Reserve, nur wenn einer von E1 bis E3 ungültig war | Evaluation | ja |
| X1 | optional, erst danach | Exploration (`<<B: Schaltername Rolle Exploration>>`), bis dahin Rolle „keine“ | nein |

**Abbruchregel:** Sind nach E4 weniger als 3 Läufe gültig, **Schluss für heute**, neuen Termin machen. Nicht weitermessen, bis es passt. Die Regel kennt nur gültig oder ungültig (`POSITIONING_DECISION.md`).

### 5.2 Die feste Route

Ein Lauf ist **hin und zurück**, etwa 70 m, **15 Drücke**:

```text
Hin:     M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7 -> M8
Zurück:  M8 -> M7 -> M6 -> M5 -> M4 -> M3 -> M2 -> M1
```

M8 wird nur einmal gedrückt (Wendepunkt), M1 am Anfang und am Ende. Wegen der Regale gilt:

| Von → nach | Weg | Länge |
| --- | --- | --- |
| M1 → M2 | gerade durch die untere Querreihe | 4 m |
| M2 → M3 | links bis zur Mittelgasse, 2 m hoch, rechts zu M3 | 7 m |
| M3 → M4 | gerade durch die Querreihe | 4 m |
| M4 → M5 | rechts zur Mittelgasse, 2 m hoch, links zu M5 | 5 m |
| M5 → M6 | gerade durch die Querreihe | 4 m |
| M6 → M7 | links zur Mittelgasse, 2 m hoch, rechts zu M7 | 7 m |
| M7 → M8 | gerade durch die Querreihe | 4 m |

Rückweg: dieselben Wege rückwärts. **Nie durch ein Regal.** Die Mittelgasse ist die freie Spalte zwischen den Regalreihen (Zellen 1 und 2).

**Zielzeit pro Lauf: 70 bis 100 Sekunden** (Gehtempo etwa 0,7 bis 1 m/s, ein ruhiger kleiner Schritt pro Sekunde), gestoppt vom ersten bis zum letzten Druck. **Stoppuhr-Zeit ins Laufblatt eintragen.** Immer gleich schnell gehen.

### 5.3 Ablauf eines Laufs

**Person „Telefon“:**

1. Einstellungen, Debug: **Rolle: Evaluation**, **Szenario: S2**. Marker-Auswahl auf **keiner** lassen (die Zuordnung läuft über die Position, `MEASUREMENT_PROTOCOL.md`). Das Umstellen der Marker-Nummer im Gehen dauert zu lange; ein schnellerer Weg: `<<B: Schaltername Marker schnell wählen>>`.
2. **Messungen aufzeichnen** einschalten, Einstellungen schließen. **REC · 0 Marker** muss oben links stehen.
3. iPhone **wie beim Einkaufen** halten: vor dem Körper in der Hand, Bildschirm zu dir, App vorn. Nicht in der Tasche.
4. An **M1** stehen. 0,6 s auf die Karte drücken, **an der Stelle von M1 auf der Karte** (Spalte 0, Reihe 7, siehe 4.1). Vibration spüren, Zähler = 1. Wo die Zelle auf der Karte liegt, erkennt ihr an den Regalen (graue Flächen) und den Beacon-Symbolen; die Zelle zu treffen übt ihr in der Probeaufnahme. `<<B: Kartenraster oder Zellennummern anzeigen>>`.
5. Losgehen, nicht stehen bleiben. An jedem Marker kurz langsamer werden, 0,6 s drücken, weitergehen. Zähler stimmt mit der Zahl der bisherigen Drücke überein.
6. Am Ende (M1) letzter Druck. **Messungen aufzeichnen** ausschalten.

**Person „Notizen“** (geht 2 m hinter dem Telefon): zählt laut mit („M3“), stoppt die Zeit, trägt **Dateiname, Stoppuhr-Zeit, Zähler** ins Laufblatt ein, notiert Auffälligkeiten mit Uhrzeit, ruft „Stopp, Lauf ungültig“ bei einem Kriterium aus 5.4.

**Person „Sicherheit“** (bei 2 Personen macht die Notiz-Person das mit): hält den Weg frei, andere Leute fern.

Zoom der Karte vorher festlegen (Maßstab-Regler in den Einstellungen) und **für alle Läufe gleich lassen**. Der richtige Wert hängt vom Gerät ab und steht nicht fest; wählt, was Regale und Zellen gut erkennen lässt.

### 5.4 Wann ein Lauf ungültig ist (Wer: Team, nur was ihr seht)

Sofort neu starten. Alte Datei **nicht löschen**, im Laufblatt als „ungültig“ markieren:

- App abgestürzt, im Hintergrund, iPhone gesperrt, Anruf oder Meldung im Bild
- Weniger als 15 Drücke (Zähler), oder ein Druck an der falschen Stelle, oder ein Marker vergessen
- Beacon bewegt, berührt oder ausgefallen
- Weg verlassen oder länger als 3 Sekunden stehen geblieben
- Rolle war nicht **Evaluation**
- Stoppuhr unter 60 s (zu schnell) oder über 4 Minuten
- Beim Export hat die Datei **0 Byte**

Was ihr nicht sehen könnt (zum Beispiel zu wenige Epochen, fehlender Dateikopf, nicht alle Beacons gehört), prüft **Erik** im Auswertungsbericht. Er sagt dann, ob ein Lauf wiederholt werden muss.

### 5.5 Zeitplan Messtag (ca. 90 Minuten)

| Zeit | Was | Wer |
| --- | --- | --- |
| 0:00 bis 0:10 | Auspacken, Raum freiräumen, iPhone einstellen (1.3) | alle |
| 0:10 bis 0:30 | Beaconliste in der App prüfen (4 Beacons). Marker kleben und nachmessen (4.4) | Telefon prüft, Rest klebt |
| 0:30 bis 0:40 | Probelauf, nicht werten | Telefon, Notizen |
| 0:40 bis 1:10 | **E1, E2, E3** (je ca. 5 Minuten mit Notizen), 3 Minuten Pause dazwischen, bei Bedarf E4 | alle |
| 1:10 bis 1:20 | Optional X1, oder ungültige Läufe wiederholen | alle |
| 1:20 bis 1:30 | Dateien exportieren (AirDrop an Erik), Marker abkleben, einpacken | alle |

Wenn möglich: nach E2 die Rollen tauschen (anderer Handgriff, andere Gehweise). Das ist eine Empfehlung der Entscheidungsregel, keine Pflicht.

---

<a id="danach"></a>
## 6 Danach

### 6.1 Export (Wer: Team)

Debug, Datei antippen, **Teilen**, **AirDrop** an Eriks Mac. Oder Dateien-App: Auf meinem iPhone, Indooro, `NavigationRecordings`. `<<B: Exportweg>>`. Der Dateiname ist ein Zeitstempel ohne Gerätekennung. Nur gültige Läufe schicken, **dazu das Laufblatt (Foto)**.

### 6.2 Auswertung (Wer: Erik)

> **Für Erik (Mac), Repo-Wurzel.** Dateien in einen Ordner legen (Beispiel mit Datum), dann ein Befehl:
> ```text
> mkdir -p swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/messtag-2026-11-19
> scripts/field/evaluate_field_day.sh swift/indooro-EinkaeuferFinal/NavigationFixtures/incoming/messtag-2026-11-19
> ```
> Das Programm anonymisiert die Dateien, analysiert sie, vergleicht alte und neue Positionsberechnung, wendet die Regel aus `POSITIONING_DECISION.md` an, übernimmt die Ergebnisse ins Positioning Lab und schreibt `BERICHT.md` (deutsch) und `KOMMENTAR_195.md`. Die Ausgabe nennt, wo beide Dateien liegen. Der Ordner `incoming/` wird von Git ignoriert (keine Rohdaten im Repo).

### 6.3 Bericht lesen und Ergebnis einordnen (Wer: Erik)

Zuerst im Bericht: Zählen mindestens 3 gültige Evaluationsläufe? Wurden in jedem Lauf alle 4 Beacons gehört? Dann das **Ergebnis**:

| Ergebnis | Was es in einem Satz heißt |
| --- | --- |
| **BESSER** | Die neue Berechnung ist in allen geprüften Punkten besser oder gleich: das Team darf vorschlagen, sie in einem eigenen Change einzuschalten. |
| **GLEICHWERTIG** | Kein belegter Unterschied: die neue Berechnung bleibt aus. |
| **SCHLECHTER** | Mindestens ein Wert ist deutlich schlechter und keiner besser: die neue Berechnung bleibt aus, die Ursache wird gesucht. |
| **GEMISCHT** | Manches besser, manches schlechter: die neue Berechnung bleibt aus. |
| **EXPLORATIV** | Weniger als 3 gültige Läufe: noch keine Entscheidung, weiter messen. |

Details: `POSITIONING_DECISION.md`, Abschnitt 4. Gelesen werden auch die Abschnitte „Hinweise“ und „Grenzen“ im Bericht.

### 6.4 Ergebnis in #195 (Wer: Erik)

Die Aufgabe heißt [#195](https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro/issues/195). Erik kopiert den Text aus `KOMMENTAR_195.md` dort als Kommentar, ergänzt Uhrzeit, wer das iPhone getragen hat und Besonderheiten aus dem Laufblatt. Die Zahlen werden **nicht** verändert. Ein „BESSER“ schaltet nichts ein: es erlaubt nur den Vorschlag (`POSITIONING_DECISION.md`, Abschnitt 1).

### 6.5 Aufräumen (Wer: Team)

Marker vom Boden entfernen (rückstandsfrei). Beacons bleiben, wie sie sind.

---

<a id="fehlerbehebung"></a>
## 7 Fehlerbehebung

Erst die **Notfallregel** oben im Dokument: bei Zweifel abbrechen und Erik anrufen (`<<Telefon Erik>>`).

### Beacon nicht sichtbar

- Bluetooth am iPhone an? Ortung für Indooro „Beim Verwenden“?
- Beacon sehr nah (1 m) vor das iPhone halten. Batterie prüfen (Ersatz einlegen, Datum aufs Blatt).
- Zeigt nRF Connect ihn, aber die Indooro-App nicht: das Backend kennt die Werte nicht. Das behebt Erik (Abschnitt 3), nicht im Raum.
- Orange Zeile „Ohne Layout-Treffer: Major-Minor“ in den Debug-Einstellungen: der Beacon sendet, das Layout kennt ihn nicht. An Erik melden.
- Fehlt einer von 4, **nicht** messen. Erik anrufen, sonst abbrechen.

### Position springt

- Ist die App vorn? Wird das iPhone anders gehalten (Tasche, Brust)?
- Nicht glätten, nichts schönen. Sprünge sind ein Messwert. Lauf wie sonst gültig, wenn 5.4 nicht greift.
- Springt es in allen Läufen stark: Erik melden (Beacon-Position, Maßstab).

### App stürzt ab

- Lauf ist ungültig (5.4). Neue Datei, neuer Lauf. App neu öffnen, Rolle und Szenario neu wählen.
- Zweiter Absturz in Folge: iPhone neu starten, Reserve-iPhone nehmen, Erik anrufen. Dritter: abbrechen.

### Export leer oder fehlt

- Wurde **Messungen aufzeichnen** am Ende ausgeschaltet? Erst dann wird die Datei sauber geschlossen.
- 0 Byte: nichts aufgenommen. Lauf ungültig, neu aufnehmen.
- Keine Datei in der Liste: Debug-App? (Die normale App hat keinen Recorder.)
- AirDrop kommt nicht an: Dateien-App, Auf meinem iPhone, Indooro, `NavigationRecordings`.
- Meldungen der Auswertung (zum Beispiel „keine Epoche mit Referenz“, „Anonymisierung fehlgeschlagen“): Datei **nicht** ändern, Erik prüft. „Keine Epoche mit Referenz“ heißt meist: es gab keine langen Drücke, der Lauf ist zu wiederholen.

### Etwas anderes

Aufschreiben (Uhrzeit, was war), Erik anrufen. Keine Dateien löschen, keine Werte raten.

---

<a id="fuer-entwickler"></a>
## Für Entwickler (nicht nötig am Messtag)

- Konventionen der Aufnahme (Format `indooro-recording/2`, `truth`, `sync`): `docs/pilot-readiness/hardware/MEASUREMENT_PROTOCOL.md`, Abschnitt 2. Szenarien S1 bis S4: dort Abschnitt 4. Für #195 genügt S2.
- Beacon-Identität: `BEACON_STANDARD.md`, `CONFIGURE_BEACON.md`.
- Kennzahlen: `tools/beacon-lab/docs/METRICS.md`. Lab: `tools/beacon-lab/docs/FIELD_GUIDE.md`.
- Einzelaufnahme auswerten, Zusatzläufe: `docs/pilot-readiness/hardware/TESTRAUM_TAG.md`.
- Skripte: `scripts/field/README.md`.
