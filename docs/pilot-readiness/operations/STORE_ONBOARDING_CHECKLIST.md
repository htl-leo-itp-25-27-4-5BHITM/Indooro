# Checkliste vor jedem Pilottermin im Markt

Stand: 2026-10-17 · Grundlage: OpenSpec `prepare-pilot-store-operations`, Anforderung „Pilot sessions use a checklist and documented consent“ (Spec `pilot-store-operations`).

**Regel:** Vor jedem Termin im Markt sind alle neun Punkte erledigt. Die Checkliste wird für jeden Termin neu ausgefüllt. Ein ausgefülltes Exemplar liegt außerhalb des Repositorys. Im Repository bleibt nur diese Vorlage.

**Sperrregel:** Gibt es für den Tag des Termins kein Backup, startet der Termin nicht (Spec-Szenario „Missing backup blocks the session“).

---

## Termin

| Feld | Eintrag |
|---|---|
| Markt (Kurzname) | `<Name des Marktes>` |
| Markt-Kennung im Admin | `<STORE_ID>` |
| Termin-Nummer und Datum | `<Termin-Nr.>` · `<JJJJ-MM-TT>` |
| Uhrzeit | `<hh:mm>` bis `<hh:mm>` |
| Rolle A (Testleitung) | `<Rolle, Kürzel laut Teamliste>` |
| Rolle B (Technik und Protokoll) | `<Rolle, Kürzel laut Teamliste>` |

---

## Die neun Punkte

Jeder Punkt wird mit dem Nachweis abgehakt. Der Nachweis wird im ausgefüllten Exemplar abgelegt.

| Nr. | Punkt | Spec-Begriff | Nachweis | Erledigt (ja/nein) | Datum und Uhrzeit | Prüft (Rolle) |
|---|---|---|---|---|---|---|
| 1 | Vereinbarung unterschrieben | agreement signed | Unterschriebene Pilotvereinbarung (`kit/pilotvereinbarung.md`), Ablage außerhalb des Repositorys | [ ] | | |
| 2 | Bereich und Termine festgelegt | area and dates fixed | Bereich im Grundriss markiert, Termin mit der Ansprechperson des Marktes bestätigt | [ ] | | |
| 3 | Layout aktiviert, jedes Regal beschriftet | layout activated (every shelf labeled) | Nummer der aktiven Layout-Version. Anzahl Regale ohne Bezeichnung: `0`. Verfahren in `STORE_DATA_ENTRY.md`, Schritt 3 und 6 | [ ] | | |
| 4 | Bereitschaftsbericht ohne blockierende Fehler | readiness report without blocking errors | Markdown-Export der Seite „Pilot-Bereitschaft“ mit Datum. Warnungen sind im Export vermerkt | [ ] | | |
| 5 | Produktstichprobe: 20 Produkte am Regal geprüft | product sample of 20 checked at the shelf | Liste mit 20 Produkt-IDs und Vermerk „Regal richtig ja/nein“, auf dem ausgefüllten Exemplar dieser Checkliste. Die Stichprobe ist kein Testlauf und wird nicht im Testprotokoll erfasst | [ ] | | |
| 6 | Beacons erfasst | beacons recorded | Konfigurationstabelle: Minor, Major, Position x/y, Montagehöhe, Montageort, Batteriedatum. Vorgaben in `STORE_DATA_ENTRY.md`, Schritt 5. Entfällt im Modus ohne Ortung, dann Vermerk „entfällt“ | [ ] | | |
| 7 | Backup am selben Tag erstellt | backup taken the same day | Dateiname mit Datum des Termins. Ablauf wie in `docs/pilot-readiness/releases/RELEASE_2026-10-17.md` (Datenbank-Dump und Produkt-Export). Ohne diesen Nachweis: Termin startet nicht | [ ] | | |
| 8 | Smoke-Check bestanden | smoke check passed | Ergebnis der Prüfliste aus `RELEASE_2026-10-17.md`, Abschnitt „Smoke-Check“, am Tag des Termins. (Mensch: Prüfliste für Pilotmärkte festlegen, die Liste dort ist für den Release-Stand geschrieben.) | [ ] | | |
| 9 | Testgeräte mit Pilot-Build geladen | test devices charged with the pilot build | Gerätekennung, Build-Version, Akkustand in Prozent. Studienmodus nur auf Team-Geräten | [ ] | | |

---

## Einwilligung und Daten

- [ ] Vor jeder Teilnahme unterschreibt die Testperson das Einwilligungsformular: `kit/einwilligung-testperson.md`, bei Minderjährigen `kit/einwilligung-testperson-minderjaehrig.md`. Ohne Unterschrift keine Aufgabe.
- [ ] Alle Aufzeichnungen, Protokolle und Fragebögen tragen nur die Test-ID (Format `T` plus ein bis drei Ziffern, zum Beispiel `T07`). Kein Name, keine Kontaktdaten.
- [ ] Einwilligungsformulare werden getrennt von den Daten abgelegt und liegen außerhalb des Repositorys: `<Ablageort außerhalb des Repositorys, Mensch>`.
- [ ] Der Markt erhält keine personenbezogenen Daten (Pilotvereinbarung, Punkt 4).

---

## Freigabe des Termins

| Entscheidung | Ergebnis |
|---|---|
| Alle neun Punkte erledigt und Einwilligungsregeln erfüllt | [ ] ja, Termin startet |
| Ein Punkt offen | [ ] nein, Termin verschoben. Grund: `<Punkt-Nr.>` |
| Backup fehlt | [ ] nein, Termin startet nicht (Sperrregel) |

Unterschrift oder Kürzel der Rolle A: `<Kürzel>` · Rolle B: `<Kürzel>`

---

## Hinweise zur Pflege

- Die Vorlage nicht mit echten Namen, Telefonnummern oder Mailadressen füllen.
- Änderungen an der Vorlage nur über einen Eintrag in `docs/pilot-readiness/team/STATUS.md` (Entscheidungen), nicht still im Dokument.
- Der Ablauf des Termins steht in `SESSION_RUN_SHEET.md`.
