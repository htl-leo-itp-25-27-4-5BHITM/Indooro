# Testprotokoll (Papier) für einen Termin im Markt

Stand: 2026-10-17 · Grundlage: `openspec/changes/add-pilot-study-mode/design.md` (Export-Format, Entscheidung 4) und `docs/pilot-readiness/05_PILOT_IMPLEMENTATION.md`, Abschnitt 7.

Dieses Protokoll ist die Papierversion. Es dient als Rückfall, wenn der Studienmodus nicht läuft, und als Kontrolle des Exports. Die Feldnamen der Spalten entsprechen dem Export-Format. Eine Zeile je Aufgabe.

**Nur die Test-ID eintragen. Keine Namen, keine Kontaktdaten.**

---

## Kopf des Termins

| Feld | Eintrag |
|---|---|
| Test-ID (Format T plus Ziffern) | `T` `____` |
| Datum | `____________` |
| Termin-Nr. und Session-ID (Studienmodus) | `____________` |
| Markt-Kennung (`store_code`) | `<STORE_CODE>` |
| Gerät (Kennung) | `____________` |
| Positionsmodus dieser Sitzung | [ ] mit Ortung  [ ] ohne Ortung |
| Reihenfolge der Bedingungen | [ ] erst mit App, dann ohne App  [ ] erst ohne App, dann mit App |
| Rolle A (Testleitung) | `<Kürzel>` |
| Rolle B (Technik und Protokoll) | `<Kürzel>` |

---

## Teil A: Zeiten und Ergebnis je Aufgabe

| Nr. (`task_no`) | Produkt-ID (`product_id`) | Produkt (`product_name`) | Bedingung (`condition`: app oder ohne_app) | Positionsmodus (`positioning_mode`: mit_ortung, ohne_ortung oder -) | Start (Uhrzeit mit Zeitzone) | Ende (Uhrzeit mit Zeitzone) | Dauer in Sekunden (`duration_s`) | Gefunden (ja/nein) | Hilfe nötig (ja/nein) | Ergebnis (`outcome`: gefunden, hilfe oder abgebrochen) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |
| 2 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |
| 3 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |
| 4 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |
| 5 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |
| 6 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |
| 7 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |
| 8 | | | | | | | | [ ] ja [ ] nein | [ ] ja [ ] nein | |

Weitere Zeilen bei Bedarf auf einem Blatt mit gleicher Spaltenfolge ergänzen.

---

## Teil B: Zähler der App und Notizen

Die Zähler gelten nur für bedingung `app`. Bei `ohne_app` steht in diesen Spalten „-“.

| Nr. (`task_no`) | Positionskorrekturen (`manual_position_count`) | Reroutes nach Start (`reroute_count`) | Zielwechsel ohne Ereignis (`stop_change_without_event_count`) | App-Fehler (`app_error_count`) | Notiz (ohne Namen, ohne Personenbeschreibung) |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |

**Positionskorrekturen** sind die Male, in denen die Testperson die Position per „Ich bin hier“ oder durch Tippen gesetzt hat.

---

## Zuordnung zum Export

Die Spalten dieses Protokolls entsprechen den Feldern im CSV-Export des Studienmodus. Die Zeilen sind dort gleich aufgebaut (`study-<Test-ID>-<Zeitstempel>.csv`).

| Protokollspalte | Export-Feld | Regel |
|---|---|---|
| Test-ID | `test_id` | Format T plus Ziffern |
| Termin-Nr. und Session-ID | `session_id` | aus dem Studienmodus |
| Markt-Kennung | `store_code` | wie im Admin |
| Nr. | `task_no` | Reihenfolge der Aufgaben |
| Produkt-ID | `product_id` | aus der Aufgabenliste |
| Produkt | `product_name` | aus der Aufgabenliste |
| Bedingung | `condition` | nur `app` oder `ohne_app` |
| Positionsmodus | `positioning_mode` | `mit_ortung`, `ohne_ortung` oder `-` (ohne App) |
| Start und Ende | `started_at`, `ended_at` | im Export in UTC, ISO 8601. Papier in Ortszeit mit Zeitzone. Beim Übertragen umrechnen. |
| Dauer | `duration_s` | Sekunden mit einer Nachkommastelle |
| Ergebnis | `outcome` | `gefunden`, `hilfe` oder `abgebrochen` (Regel unten) |
| Positionskorrekturen | `manual_position_count` | nur bei `app`, sonst leer lassen |
| Reroutes | `reroute_count` | nur bei `app` |
| Zielwechsel ohne Ereignis | `stop_change_without_event_count` | nur bei `app` |
| App-Fehler | `app_error_count` | Anzahl im Termin |

**Regel für das Ergebnis (Vorschlag, Mensch bestätigt):**

- `abgebrochen`, wenn die Testperson die Aufgabe abbricht.
- `hilfe`, wenn Hilfe nötig war, auch wenn das Produkt am Ende gefunden wurde.
- `gefunden`, wenn das Produkt ohne Hilfe gefunden wurde.

**Zeitmessung:** Die Zeiten kommen aus dem Studienmodus oder aus einer Stoppuhr. Stoppuhrzeiten werden nicht automatisch exportiert. Sie werden von Hand in die Protokollspalte geschrieben. (Mensch: entscheiden, ob Stoppuhrzeiten in den Export übernommen werden.)

---

## Fehlerprotokoll

| Datum | Uhrzeit | Gerät (Kennung) | Test-ID | Aktion vor dem Fehler | Fehlermeldung oder Verhalten | Maßnahme (Neustart, Modus B, Liste) |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |

Bildschirmfotos nur ohne Personen. Die Ursache klärt Rolle B nach dem Termin.

---

## Abschluss des Protokolls

- Anzahl Aufgaben: `____`
- Anzahl `gefunden`: `____`  · `hilfe`: `____`  · `abgebrochen`: `____`
- Anzahl App-Fehler: `____`
- Protokoll vollständig und mit Test-ID versehen: [ ] ja

Kürzel Rolle A: `____`  · Kürzel Rolle B: `____`
