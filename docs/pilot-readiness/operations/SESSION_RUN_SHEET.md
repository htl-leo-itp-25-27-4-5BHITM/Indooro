# Ablaufplan für einen Testtermin im Markt

Stand: 2026-10-17 · Grundlage: `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md` (Abschnitte 1, 5.3, 7), `03_PILOT_READINESS.md` (Abschnitte 4.3 und 5), `06_BUSINESS_OUTREACH.md` (Abschnitt D) und OpenSpec `prepare-pilot-store-operations`, Aufgabe 5.1.

Dieser Ablauf gilt für einen Termin mit 2 bis 3 Stunden. Vor dem Termin wird `STORE_ONBOARDING_CHECKLIST.md` vollständig abgehakt. Ohne vollständige Checkliste findet der Termin nicht statt.

**Sperrregel:** Kein Backup vom selben Tag, kein Termin.

Zeitangaben mit „(Annahme)“ sind Schätzungen. Vor dem ersten Termin im Markt prüfen und anpassen.

---

## Rollen

Zwei Teammitglieder sind immer anwesend (05, Abschnitt 1; 06, Abschnitt D: „Maximal zwei Personen“). Eine Person übernimmt eine Rolle.

| Rolle | Aufgaben | Hat nicht |
|---|---|---|
| **Rolle A: Testleitung** | Begrüßung der Testperson, Einwilligung und Test-ID, Einweisung (1 Minute), Aufgaben vorlesen und Zeit stoppen, Fragebogen übergeben, Gespräch mit der Ansprechperson des Marktes | Keine Bedienung der Technik während der Aufgabe |
| **Rolle B: Technik und Protokoll** | Geräte bereitstellen, App und Modus einstellen, Fehlerprotokoll führen, Positionskorrekturen beobachten und notieren, Backup- und Smoke-Status prüfen, Aufzeichnungen sichern | Keine Gespräche mit Kunden über die Aufgabe |

Die Rollen wechseln nicht während einer Testperson. Die Testperson hat einen festen Ansprechpunkt.

---

## Zeitplan (150 Minuten)

| Von | Bis | Dauer | Block | Rolle A | Rolle B |
|---|---|---|---|---|---|
| 0:00 | 0:15 | 15 min | Ankunft und Checkliste | Ansprechperson begrüßen, Hinweisschild aufstellen | Geräte prüfen (Akku, Build, Studienmodus, Kennzeichnung „Testversion“), Checkliste durchgehen |
| 0:15 | 0:30 | 15 min | Stichprobe | Regal-Prüfung am Regal (20 Produkte) | App-Suche der 20 Produkte, Ergebnisse notieren |
| 0:30 | 1:05 | 35 min | Testperson 1 | Ablauf nach Block „Je Testperson“ | Gerät, Modus, Protokoll, Fehlerprotokoll |
| 1:05 | 1:40 | 35 min | Testperson 2 | Ablauf nach Block „Je Testperson“ | Gerät, Modus, Protokoll, Fehlerprotokoll |
| 1:40 | 1:55 | 15 min | Pause und Sicherung | Gespräch mit Markt-Ansprechperson | Geräte laden, Aufzeichnung lokal sichern |
| 1:55 | 2:30 | 35 min | Testperson 3 | Ablauf nach Block „Je Testperson“ | Gerät, Modus, Protokoll, Fehlerprotokoll |
| 2:30 | 2:45 | 15 min | Abbau | Hinweisschild einpacken, Ansprechperson verabschieden | Geräte einsammeln, Vollständigkeit der Protokolle prüfen |
| 2:45 | 3:00 | 15 min | Puffer | Reserve für Verzögerungen | Reserve für Verzögerungen |

Pro Termin sind höchstens drei Testpersonen geplant. Mehr Testpersonen bedeuten einen zweiten Termin. Die Zeiten pro Person sind Annahmen. Zu prüfen nach dem ersten Termin.

---

## Je Testperson (35 Minuten, Annahme)

| Minuten | Schritt | Rolle | Ergebnis |
|---|---|---|---|
| 0 bis 5 | Einwilligung. Die Testperson unterschreibt das Formular. Test-ID vergeben (T plus Ziffern). Ist die Testperson minderjährig, gilt das Formular für Minderjährige. | A | Unterschriebenes Formular, getrennt abgelegt. Test-ID im Protokoll |
| 5 bis 6 | Einweisung (1 Minute). Gerät übergeben. Testperson darf jederzeit ohne Begründung abbrechen. | A | Testperson hat verstanden |
| 6 bis 16 | Aufgaben mit App: drei einzelne Produkte suchen. Bedingung `app`. Zeit stoppen, Ergebnis notieren. | A (Zeit), B (Protokoll) | Drei Zeilen im Testprotokoll |
| 16 bis 26 | Liste mit fünf Produkten abarbeiten. Bedingung `app`. Position korrigieren, wenn nötig, und notieren. | A (Liste), B (Korrekturen) | Fünf Zeilen mit Korrekturen |
| 26 bis 31 | Vergleich ohne App: zwei gleichwertige Produkte suchen. Bedingung `ohne_app`. Reihenfolge abwechseln: Die erste Testperson beginnt mit App, die nächste ohne App. | A | Zwei Zeilen |
| 31 bis 35 | Fragebogen allein ausfüllen. Freitext optional. Verabschieden, Gerät zurücknehmen. | A | Fragebogen mit Test-ID |

Die Zeilen je Aufgabe werden im Testprotokoll erfasst (`kit/testprotokoll.md`), der Fragebogen steht in `kit/fragebogen.md`.

---

## Ablauf bei einem Fehler der App

Die App stürzt ab, hängt, zeigt falsche Daten oder findet ein Produkt nicht, das in der Liste steht. Rolle B entscheidet, Rolle A informiert die Testperson.

**Schritte in dieser Reihenfolge:**

1. **Zeit anhalten** und den Fehler im Testprotokoll notieren: Uhrzeit, Produkt-ID, Schritt, `app_error_count` um eins erhöhen.
2. **Einmal neu starten**, aber nur mit Zustimmung der Testperson. Mehr als ein Neustart wird nicht versucht.
3. **Wechsel zum Modus B** (ohne Ortung): Start am Eingang, Liste in Laufreihenfolge, Abhaken durch die Testperson. Das ist kein Fehler des Konzepts, sondern der vorgesehene Rückfall (03, Abschnitt 4.3, Variante B).
4. **Wechsel zur ausgedruckten Liste** mit Regalangaben, falls auch Modus B nicht geht. Die Liste wird vor dem Termin aus der Produktliste gedruckt und liegt bereit (03, Abschnitt 5).
5. **Ergebnis festhalten:** Ergebnis `hilfe` oder `abgebrochen`, je nach Fall. Die Aufgabe nicht als `gefunden` werten, wenn der Wechsel zum Rückfall nötig war.
6. **Fehlerprotokoll führen:** Datum, Uhrzeit, Gerät (Kennung), Aktion, Fehlermeldung. Bildschirmfotos nur ohne Personen.
7. **Keine Fehlersuche am Termin.** Die Ursache klärt Rolle B nach dem Termin.

**Ortung ausgefallen:** Das ist kein Fehler. Die App zeigt keine Position, und die Testperson arbeitet mit Modus B oder mit der Liste weiter (03, Abschnitt 5).

**Schwellenwert für den Abbruch des Termins (Vorschlag, Mensch entscheidet):** Fallen zwei Geräte gleichzeitig aus oder sind die Daten an mehreren Stellen falsch, wird der Termin beendet und die Ansprechperson des Marktes informiert.

---

## Abbruchregeln

- Die Testperson möchte aufhören: sofort beenden, keine Nachfrage.
- Kunden im Markt oder Anliegen des Marktpersonals haben Vorrang. Der Test wird unterbrochen und später fortgesetzt oder beendet.
- Ein Beacon fällt herunter oder ist beschädigt: Team kümmert sich nicht vor Ort darum, sondern informiert die Ansprechperson und vermerkt es. Es wird kein Regal oder keine Ware angefasst.
- Eine Anweisung des Marktes zur Sicherheit gilt vor allen Testplänen.

---

## Nach dem Termin

1. **Aufzeichnungen sichern.** Studienmodus-Export (CSV und JSONL) über das Teilen-Menü auf den Team-Mac übertragen. Dateinamen enthalten nur Test-ID, keine Namen (Studienmodus-Spezifikation, `add-pilot-study-mode`).
2. **Testprotokoll vervollständigen.** Alle Test-IDs und Zeiten prüfen, Fragebögen mit Test-ID ablegen.
3. **Einwilligungsformulare** nur in den getrennten Ablageort bringen. Nicht ins Repository, nicht auf den Team-Mac in den Projektordner.
4. **Gerät laden** für den nächsten Termin (Punkt 9 der Checkliste).
5. **Backup für den nächsten Termin** einplanen. Die Sperrregel gilt für jeden Termin.
6. **Studiendaten löschen** erst nach der Auswertung und erst, wenn die Sicherung geprüft ist. Im Studienmodus „Alle Sitzungen löschen“ mit Bestätigung (05, Abschnitt 8, Zeile 6).
7. **Ansprechperson des Marktes** kurz informieren: stattgefunden, Auffälligkeiten, nächster Termin. Keine Ergebnisse mit Namen.
8. **Team-Status aktualisieren.** In `docs/pilot-readiness/team/STATUS.md` nur Zählwerte und Status eintragen, zum Beispiel Anzahl Testpersonen, Anzahl Abbrüche, Anzahl App-Fehler. Keine Test-IDs, keine Namen.
9. **Fehlerprotokoll übergeben** an die Person, die die App betreut.

---

## Vorbereitung vor dem Termin (Kurzliste)

- [ ] `STORE_ONBOARDING_CHECKLIST.md` vollständig, Backup vom selben Tag vorhanden.
- [ ] Gedruckte Liste mit Regalangaben (Rückfall) liegt bereit.
- [ ] Hinweisschild aus `kit/hinweisschild.md` ist gedruckt.
- [ ] Einwilligungsformulare für Erwachsene und für Minderjährige sind gedruckt.
- [ ] Protokolle und Fragebögen sind gedruckt, Test-IDs vorab vergeben.
- [ ] Stift, Klemmbrett, Stoppuhr (oder Studienmodus), Ladekabel.
- [ ] Ansprechperson des Marktes hat den Termin und die Uhrzeit bestätigt.
