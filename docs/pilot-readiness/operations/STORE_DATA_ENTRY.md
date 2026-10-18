# Dateneingabe für einen Pilotmarkt

Stand: 2026-10-17 · Grundlage: OpenSpec `prepare-pilot-store-operations` (Aufgaben 2.2, 2.3, 3.6), `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md` (Abschnitte 1, 3, 5), `LAYOUT_CONVENTIONS.md` in diesem Ordner.

Dieses Dokument beschreibt, wie ein Markt von der Vermessung bis zur Prüfung in der App eingerichtet wird. Die Schritte sind in der Reihenfolge zu machen, in der sie hier stehen.

**Status:** Schritte 1 bis 8 sind Anleitung. Die Abschnitte „Echte Marktdaten“ und „Konvertierung regalplan_export.csv“ warten auf Aufgabe 5.2 (Herkunft der Daten) und sind bis dahin gesperrt.

Platzhalter in spitzen Klammern ausfüllen, zum Beispiel `<STORE_ID>` oder `<Name des Marktes>`. Keine Zugangsdaten in dieses Dokument oder in Dateien im Repository schreiben.

---

## Vorbedingungen

- [ ] Schriftliche Vereinbarung mit dem Markt liegt vor (`kit/pilotvereinbarung.md`). Ohne Zustimmung zu Vermessung und Montage beginnt keine Arbeit vor Ort (05, Abschnitt 8, Zeile 1).
- [ ] Pilotbereich ist festgelegt: 3 bis 5 Gänge, 300 bis 600 m², stabile Warengruppen (05, Abschnitt 1, Schritt 2).
- [ ] Ansprechperson des Marktes ist benannt.
- [ ] Zwei Teammitglieder sind für die Vermessung eingeteilt (05, Abschnitt 1, Schritt 3).

---

## Schritt 1: Fläche vermessen

Aufwand: 3 bis 4 Stunden, zwei Personen (05, Abschnitt 1).

1. Eingang, Gänge, Regale, Kassen und Hindernisse messen. Maße in Metern, Genauigkeit etwa 0,5 m.
2. Regale nach Gang und Seite notieren. Die Bezeichnung folgt `LAYOUT_CONVENTIONS.md`, Abschnitt 3.
3. Fotos nur mit Erlaubnis des Marktes machen und nur ohne Personen im Bild (05, Abschnitt 2).
4. Die Skizze und die Fotos liegen außerhalb des Repositorys. Pläne und Regalfotos werden nicht im öffentlichen Repository abgelegt (05, Abschnitt 2).

[Screenshot: Skizze der vermessenen Fläche mit Maßen] (Mensch: einfügen, falls vorhanden)

## Schritt 2: Grundriss im Admin-Editor zeichnen

Der Editor für einen bestimmten Markt öffnet sich laut Spec unter `/admin/editor/?storeId=<STORE_ID>`. (Mensch: Pfad im neuen Admin unter `/admin/next/` prüfen, da die Release-Notiz nur die Seiten unter `/admin/next/` nennt.) Ohne `storeId` öffnet sich der alte, globale Modus, der für Pilotmärkte nicht gilt (Spec `store-layout-management`, „Layout editor keeps legacy and store modes distinct“).

1. Anmelden (Mensch: Anmeldung selbst durchführen; Zugangsdaten nicht in Dokumente schreiben).
2. Grundriss zeichnen: Wände, Regale, Gänge, Kassen, Eingang. Maßstab 1 Zelle = 1 m (siehe `LAYOUT_CONVENTIONS.md`, Abschnitt 1).
3. Genau einen Eingang (`entrance`) setzen.
4. Den Bereich `gridSize` auf die vermessene Größe setzen.

[Screenshot: Admin-Editor mit Grundriss im Store-Modus] (Mensch: einfügen)

## Schritt 3: Regale beschriften

Jedes Ziel-Regal bekommt drei Angaben im Inspektor:

- `category`: `<Kategorie>/<Meter>`, zum Beispiel `520/1`.
- `meter`: die Meterzahl als ganze Zahl.
- `label` (im Editor als Feld „Bezeichnung“): `Gang <n> · <links|rechts> · <Warengruppe>`.

Ein Regal ohne diese drei Angaben blockiert die Aktivierung. Die Bereitschaftsseite zeigt diese Regale an (Schritt 7).

Vor dem Druck der Regaletiketten: Die Festlegung „links“ und „rechts“ bestätigen lassen (`LAYOUT_CONVENTIONS.md`, Abschnitt 3).

[Screenshot: Inspektor eines Regals mit ausgefüllter Bezeichnung] (Mensch: einfügen)

## Schritt 4: Produkte erfassen und importieren

Aufwand: 4 bis 8 Stunden für 100 bis 200 Produkte (05, Abschnitt 1, Schritt 6).

1. Regale abschnittsweise fotografieren, ohne Personen (05, Abschnitt 5.2).
2. Die Liste in die Vorlage `kit/produkte-vorlage.csv` übertragen. Spalten: `id;name;marke;menge;regal_label;kategorie;meter;fach;reihe;preis`.
3. Mit dem Konverter prüfen und in ein Importformat umwandeln. Befehle und Fehlerliste: Abschnitt „Konverter-Workflow“ unten.
4. Die erzeugte Datei im Admin importieren (Admin-Katalogimport, Format `ndjson`) oder über die API (Format `array`).
5. Stichprobe: 20 zufällige Produkte in der App suchen und am Regal prüfen (05, Abschnitt 5.2, Schritt 4). Die Quote „100 % richtig“ ist das Kriterium aus `03_PILOT_READINESS.md`, Abschnitt 6.2.

Die Zeit pro Produkt notieren. Das ist eine Kennzahl des Piloten (05, Abschnitt 5.2, letzter Absatz).

## Schritt 5: Beacons registrieren und platzieren

Dieser Schritt betrifft nur den Pilot mit Ortung (Variante C in `03_PILOT_READINESS.md`, Abschnitt 4.3). Im reinen Modus ohne Ortung entfällt er.

**Beacon-Identität** (Spec `beacon-deployment`, „Beacons use one documented identity scheme“):

- Alle Beacons senden dieselbe Projekt-UUID. Sie steht in `docs/pilot-readiness/hardware/BEACON_STANDARD.md`. (Mensch: Diese Datei existiert noch nicht. Sie entsteht mit Aufgabe 2.1 aus `establish-pilot-field-measurement`. Vorher keine Beacons konfigurieren.)
- **Major** = Standortnummer. Vorgesehen: 1 für den Testraum, 2 für den großen Testraum, 10 oder höher für Märkte (`establish-pilot-field-measurement`, `design.md`). Für diesen Markt: `<Standortnummer ab 10>`.
- **Minor** = laufende Beacon-Nummer. Sie steht auch auf dem Etikett am Gerät.
- Die Platzhalter-UUID aus lauter Nullen ist nicht zulässig. Ein Layout mit dieser UUID besteht die Prüfung nicht.

**Konfigurationsdatensatz pro Beacon** (Spec `beacon-deployment`, „Beacon configuration is recorded per site“):

| Feld | Inhalt |
|---|---|
| Minor, Major | siehe oben |
| Koordinate x/y in Metern | Montageposition, auf 0,5 m genau gemessen |
| Montagehöhe und Montageort | z. B. „Regaloberkante, Gang 2, Säule links“ |
| TX-Leistung und Sendeintervall | einheitlich, Werte aus `BEACON_STANDARD.md` |
| Batteriedatum | Datum des Batteriewechsels |

**Montage** (05, Abschnitt 3.5): über Kopfhöhe, auf Regalen oder Säulen, nicht hinter Ware und nicht an Kühlmöbeln. Rückstandsfrei lösbare Klebung oder Kabelbinder, kein Bohren. Keine Montage an Fluchtwegschildern oder elektrischen Anlagen. Jeder Montageort braucht die ausdrückliche Zustimmung des Marktes.

**Im Layout platzieren**: Im Editor im Store-Modus die zugewiesenen Beacons auswählen und als Beacon-Element setzen. Ein Beacon kann nicht zweimal platziert werden. Ist kein Beacon mehr frei, zeigt der Editor einen leeren Zustand an (Spec `store-layout-management`).

(Mensch: Beacon-Modell ist noch nicht gewählt. Laut `05_PILOT_IMPLEMENTATION.md`, Abschnitt 3.3, muss vor dem Kauf ein Modell entschieden und dokumentiert werden.)

[Screenshot: Editor mit platzierten Beacon-Elementen] (Mensch: einfügen)

## Schritt 5a: QR-Anker setzen und drucken

Grundlage: OpenSpec `add-qr-anchor-positioning`. QR-Anker setzen die Position in der App, wenn Beacons fehlen oder die Position nicht verlässlich ist.

1. **Anker platzieren.** Im Editor das Werkzeug „QR-Anker“ wählen und an jedem Gangende einen Anker setzen. Der Editor schreibt immer 1 × 1.
2. **Bezeichnen.** Jeder Anker hat eine `anchorId` im Format `[A-Z0-9-]{1,12}` (zum Beispiel `A12`), eindeutig pro Layout, und ein Label wie „Gang 4 – Anfang“.
3. **Veröffentlichen.** Die Anker-IDs werden erst beim Veröffentlichen geprüft, nicht im Entwurf (Schritt 6).
4. **Drucken.** Im Editor „QR-Codes drucken“ wählen: 6 Codes pro A4-Seite, Codegröße mindestens 4 cm. Der Code enthält `https://<host>/customer/?store=<storeCode>&a=<anchorId>`.
5. **Aufkleben.** Codes am Gangende in Augenhöhe anbringen. Nur mit Erlaubnis des Marktes.
6. **Nach Layout-Änderungen neu drucken.** Alte Codes mit geänderter oder entfernter `anchorId` wegwerfen.
7. **Prüfen.** Mit der iPhone-Kamera jeden Code scannen: Die App zeigt die Position am Anker. Gehört der Code zu einem anderen Markt, fragt die App „Dieser Code gehört zu <Filiale>. Wechseln?“.

Hinweis: Die Kunden-Webansicht liest den Parameter `a` noch nicht.

---

## Schritt 6: Layout-Version speichern und aktivieren

1. **Entwurf speichern.** Der Entwurf ersetzt noch nicht das Layout, das die App verwendet (Spec `store-layout-management`, „User saves a draft“).
2. **Validierung ausführen.** Blockierende Fehler müssen behoben werden. Warnungen lassen sich nach Bestätigung speichern.
3. **Veröffentlichen.** Die Version wird aktiv. Pro Markt gibt es nur eine aktive Version. Ältere Versionen bleiben einsehbar.
4. **Export.** Für den Konverter braucht man die JSON der aktiven Version. Der Export liegt in der Import/Export-Funktion des Editors (Mensch: Schaltfläche im Editor bestätigen).

[Screenshot: Validierungsliste vor dem Veröffentlichen] (Mensch: einfügen)

## Schritt 7: Bereitschaftsbericht ausführen

Der Bereitschaftsbericht prüft Layout, Produkte und Beacons des Marktes gemeinsam. Er ist der Nachweis für den Punkt „readiness report without blocking errors“ in der Checkliste (`STORE_ONBOARDING_CHECKLIST.md`).

- **Im Admin:** Seite „Pilot-Bereitschaft“ (Route `/admin/next/stores/readiness/`, laut `docs/pilot-readiness/releases/RELEASE_2026-10-17.md`). Die Seite zeigt eine Ampel, die Befunde und Links zu Element oder Produkt. Es gibt einen Export als Markdown für die Checkliste.
- **Per API:** `GET /api/stores/{storeId}/readiness?radius=8.0` (Quelle: Release-Notiz und Aufgabe 3.1 aus `add-store-pilot-readiness-check`). Rollen: admin, region-manager und store-manager mit Zuordnung zum Markt. Ein Aufruf ohne Anmeldung wird umgeleitet.

Aufruf im Live-System: (Mensch: Anmeldung im Admin und Aufruf der Seite prüfen. Laut Release-Notiz ist der Login-Test der neuen Seiten noch offen, und Claude hat keine Zugangsdaten eingegeben.)

Was zu tun ist:

- Blockierende Fehler auf null bringen. Dann Schritt 6 oder die Daten korrigieren und den Bericht erneut ausführen.
- Warnungen notieren. Sie stehen im Export und gehen in die Checkliste.
- Radius und Abdeckungsregel (Standard 8 m, mindestens 3 Beacons) sind eine offene Teamentscheidung (`team/STATUS.md`, Zeile „Entscheidung Abdeckungsregel“; Release-Notiz, Punkt „Offen“). (Mensch: Entscheidung treffen.)

[Screenshot: Seite Pilot-Bereitschaft mit Befunden] (Mensch: einfügen, nach dem Login)

## Schritt 8: Prüfung in der App

1. Pilot-Build auf einem Team-Gerät installieren. (Mensch: Stand des Pilot-Builds prüfen. Der Build hängt an `prepare-pilot-ios-build`, Aufgabe 3.1 in `add-ios-pilot-ui-tests` wartet darauf.)
2. Den Markt in der App auswählen. Die automatische Markterkennung soll im Pilot-Build abgeschaltet sein (03, Abschnitt 3.1: „Auto-Erkennung im Pilot-Build abschalten“). (Mensch: Stand prüfen.)
3. 20 Suchbegriffe aus der Stichprobe suchen, einschließlich Sonderzeichen. Jedes Ergebnis mit dem Regal am Markt vergleichen.
4. Eine Testroute vom Eingang aus starten. Mit der Ortung: Position prüfen. Ohne Ortung: prüfen, ob die Liste in Laufreihenfolge erscheint.
5. Flugmodus testen. Die Suche muss mit dem zuletzt geladenen Stand des Marktes laufen oder klar melden, dass sie offline ist (03, Blocker K4).

[Screenshot: App-Suche mit Regalangabe] (Mensch: einfügen)

---

## Konverter-Workflow

Der Konverter ist `scripts/pilot-data/csv_to_ndjson.py`. Er braucht nur Python 3.10 oder neuer und keine Installation. Er liest die CSV, prüft jede Zeile gegen das Layout-JSON und schreibt nur bei Erfolg eine Datei.

### Vorbereitung

1. Die Produktliste als **CSV UTF-8 (Trennzeichen-getrennt)** speichern. Dieses Format bewahrt Umlaute und Semikolons (Excel auf Windows).
2. Das Layout-JSON der aktiven Version exportieren (Schritt 6, Punkt 4). Die Datei heißt hier `<layout>.json`.
3. Den Pfad zu den Ausgabedateien festlegen. Ausgabedateien gehören nicht ins Repository.

### Aufruf

Die Befehle stehen im Repository-Stammverzeichnis. `<STORE_ID>` und `<STORE_CODE>` sind die Kennungen des Marktes aus dem Admin (Mensch: Werte vom Admin-Team erfragen).

**Windows (PowerShell):**

```powershell
py -3 -I scripts\pilot-data\csv_to_ndjson.py <produkte>.csv <layout>.json --store-id <STORE_ID> --store-code <STORE_CODE> --out <produkte>.ndjson
```

**macOS:**

```bash
python3 -I scripts/pilot-data/csv_to_ndjson.py <produkte>.csv <layout>.json --store-id <STORE_ID> --store-code <STORE_CODE> --out <produkte>.ndjson
```

Wichtige Optionen:

| Option | Bedeutung |
|---|---|
| `--format ndjson` | Standard. Ein Produkt pro Zeile. Für den Admin-Katalogimport. |
| `--format array` | JSON-Array. Für `POST /api/products/bulk`. |
| `--id-start <n>` | Startwert für automatisch vergebene IDs (Standard 1). Leere `id`-Zellen bekommen fortlaufende Nummern. |

Das Skript wählt das Trennzeichen (`;` oder `,`) und das BOM automatisch und meldet, was es erkannt hat.

### Rückgabecodes

| Code | Bedeutung |
|---|---|
| 0 | Erfolg, Datei geschrieben |
| 1 | Fehler in der CSV. Keine Datei geschrieben. Alle Zeilenfehler werden mit Zeilennummer gemeldet. |
| 2 | Eingabe oder Layout nicht lesbar, oder Ausgabe nicht schreibbar |

Bei Code 1 die Zeilen korrigieren und den Befehl erneut ausführen. Eine vorhandene Ausgabedatei bleibt bei einem Fehler unverändert.

Bei Erfolg zeigt das Skript eine Zusammenfassung: Zeilen, verwendete Regale, Regale ohne Produkte, Anzahl automatisch vergebener IDs. Regale ohne Produkte sind keine Fehler. Vor dem Pilot prüfen, ob dort ein Sortiment fehlt.

### Import

Beide Wege brauchen eine Anmeldung als Admin.

1. **Admin-Katalogimport** (empfohlen, Format `ndjson`): Im Admin den Produktimport öffnen und die Datei einfügen oder hochladen.
2. **API** (Format `array`): `POST /api/products/bulk` mit einem Admin-Token. Den Token nicht in Dateien oder Chats speichern. Der Befehl als Vorlage:

```bash
curl -X POST http://localhost:8080/api/products/bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  --data-binary @<produkte>.json
```

`<ADMIN_TOKEN>` ersetzen. Der Wert gehört nicht in dieses Dokument.

### Zurücksetzen

Die IDs stehen im Feld `id` jeder Produktzeile der Ausgabedatei. Der Befehl zum Auslesen der IDs steht in `scripts/pilot-data/README.md`.

**Nicht geprüft:** Ob Admin oder API einen Löschvorgang nach ID anbieten, ist nicht verifiziert (Caveat in `scripts/pilot-data/README.md`). (Mensch: an einer Testinstanz prüfen, bevor der Pilot beginnt. Vor dem Löschen sicherstellen, dass nur Produkte des Pilotmarktes betroffen sind, zum Beispiel über `storeId`.)

### Spalte `preis`

Die Spalte `preis` ist Pflicht im Konverter. Eine leere Zelle ergibt den Fehler „preis ist ungueltig“. Die Werte in `produkte-vorlage.csv` sind Beispielwerte aus Aufgabe 3.1.

- Preise realer Produkte werden nicht erfunden. Ein Preis gehört nur in die Datei, wenn er aus einer belegbaren Quelle stammt.
- Im Pilot-MVP sind Preise kein Verkaufsargument (03, Abschnitt 3.2). (Mensch: entscheiden, ob für den Test ein Platzhalterpreis zulässig ist, oder ob der Konverter die Pflicht lockert. Die Änderung am Konverter ist eine Code-Änderung und nicht Teil dieses Auftrags.)

### Tests des Konverters

```bash
python3 -I -m unittest discover scripts/pilot-data
```

Auf Windows: `py -3 -I -m unittest discover scripts\pilot-data`. Die Tests nutzen nur synthetische Fixtures.

---

## Echte Marktdaten

**Status: wartet auf Aufgabe 5.2 (Mensch: Freigabe).**

Zwei Dateien im Repository stammen aus einem realen Markt:

- das Layout `SparSupermarkt_Posttrasse` (`app/launch_supermarkt/SparSupermarkt_Posttrasse_layout.json`)
- der Belegplan `Belegplan_ocr.pdf`

Sie dürfen nur verwendet werden, wenn Aufgabe 5.2 klärt:

- wer der Markt ist (SPAR-Filiale oder selbstständiger Kaufmann),
- wer Ansprechperson ist,
- mit welcher Erlaubnis Layout und Belegplan erhoben wurden.

Die Antwort steht in `docs/pilot-readiness/team/STATUS.md`. Bis dahin gilt:

- Die Dateien werden nicht in Tests, Dokumente oder das Kit übernommen.
- Die Tests laufen mit den synthetischen Fixtures in `scripts/pilot-data/fixtures/`.
- Der Stand ist als Risiko M7 („Herkunft realer Daten“) in `03_PILOT_READINESS.md`, Abschnitt 2.2, geführt.

---

## Konvertierung regalplan_export.csv

**Status: wartet auf Aufgabe 5.2 (Mensch: Freigabe).**

Die Datei `backend/indooro_server/regalplan_export.csv` hat diese Kopfzeile:

```
Produktname;Regalcode;Kategorie;Meter;Pos
```

Mehr ist in diesem Dokument nicht festgehalten. Die Zeilen werden erst nach der Freigabe gelesen.

**Vorschlag für die Spaltenzuordnung** (nur Vorschlag, nicht umgesetzt):

| Quelle | Ziel in `produkte-vorlage.csv` | Vorschlag | Offen |
|---|---|---|---|
| `Produktname` | `name` | in `name` übernehmen, `marke` getrennt | Enthält der Produktname die Marke? |
| `Regalcode` | `regal_label` | nicht direkt übernehmen | Der Code ist vermutlich eine interne Kennung und kein Kundentext. Zuordnung Code zu Bezeichnung über eine Tabelle, die der Mensch erstellt. |
| `Kategorie` | `kategorie` | 1:1 | Stimmt die Zahl mit dem Präfix der `category` im Layout überein? |
| `Meter` | `meter` | 1:1 | – |
| `Pos` | `fach` und `reihe` | nur wenn das Format klar ist, zum Beispiel zwei Zahlen | Format von `Pos` ist aus der Kopfzeile nicht erkennbar. (Mensch: Format klären.) |
| – | `id` | leer lassen, der Konverter vergibt Nummern | – |
| – | `menge` | leer oder aus der Quelle | – |
| – | `preis` | Pflichtfeld, siehe oben | Die Quelle hat keinen Preis. Nicht erfinden. (Mensch: entscheiden.) |

Ergebnis des Laufs (wird nach der Freigabe eingetragen):

| Kennzahl | Wert |
|---|---|
| Zeilen in der Quelle | wartet auf 5.2 |
| Zeilen mit Fehler (nach Zeilennummer) | wartet auf 5.2 |
| Verwendete Regale | wartet auf 5.2 |
| Regale ohne Produkte | wartet auf 5.2 |

---

## Offene Punkte für das Team

- Festlegung „links“ und „rechts“ bestätigen (`LAYOUT_CONVENTIONS.md`, Abschnitt 3).
- `BEACON_STANDARD.md` erstellen (Aufgabe 2.1 aus `establish-pilot-field-measurement`) und das Beacon-Modell festlegen.
- Abdeckungsregel der Bereitschaftsseite festlegen (Radius, Schwelle).
- Login-Test der Seite „Pilot-Bereitschaft“ und Export des Layouts prüfen.
- Umgang mit der Pflicht-Spalte `preis` entscheiden.
- Herkunft der Daten aus `SparSupermarkt_Posttrasse` und `Belegplan_ocr.pdf` klären (Aufgabe 5.2).
