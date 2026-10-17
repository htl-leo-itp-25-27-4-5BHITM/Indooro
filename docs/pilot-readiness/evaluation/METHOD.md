# Methode der Pilot-Auswertung

Gilt für Phase 3 (Praxistest mit Testpersonen) aus `docs/pilot-readiness/03_PILOT_READINESS.md` 6.3 und die numerisch prüfbare Zeile aus 6.2. Umgesetzt im Werkzeug `scripts/pilot-eval/` (Change `prepare-pilot-evaluation`). Alle Schwellen stehen in `scripts/pilot-eval/criteria.json` (Version 1, **vorläufig**) und werden nach dem ersten Termin überprüft.

## 1. Studiendesign

- **Within-subject:** Jede Testperson löst Suchaufgaben mit und ohne App.
- **Paare:** Pro Produkt je eine Aufgabe mit App (`condition = app`) und eine ohne App (`ohne_app`), unmittelbar hintereinander (Aufgaben 1+2, 3+4, …). Ein Paar besteht aus zwei aufeinanderfolgenden Aufgaben derselben Testperson und Sitzung mit unterschiedlicher Bedingung.
- **Reihenfolge abwechseln:** Bei der einen Person zuerst mit App, bei der nächsten zuerst ohne App, damit Lerneffekte (zweites Mal kennt man das Regal) sich ausgleichen. Das Produkt pro Paar ist dasselbe, die Reihenfolge innerhalb des Paars wechselt zwischen Personen.
- **Produkte:** seltene Produkte, die die Testperson nicht kennt (siehe Testprotokoll `kit/testprotokoll.md`, Person C).
- **Anonymität:** Es gibt nur Test-IDs `T01` … `T999`. Namen, Kontaktdaten und Freitext mit Personenbezug gehören nicht in die Dateien. Das Werkzeug lehnt alles ab, was nicht `^T\d{1,3}$` entspricht.

## 2. Stichprobe

- Mindestens **10 Paare** für den Zeitvergleich, mindestens **10 Aufgaben** bzw. Personen für Anteile (siehe `min_n` in `criteria.json`). Darunter meldet das Werkzeug „zu wenig Daten“ und zeigt die Werte nur beschreibend.
- Empfehlung: 8–12 Testpersonen mit je 2–4 Paaren ergibt 16–48 Paare. Mehr Paare je Person ersetzen keine weiteren Personen, weil die Paare einer Person nicht unabhängig sind; deshalb ist der Vorzeichentest nur ein Hinweis, kein Beleg.
- Die Auswertung ist **deskriptiv**. Es gibt keine Signifikanzaussage über Märkte oder Zielgruppen.

## 3. Kennzahlen und Rechenregeln

„Tour“ = eine Aufgabe mit `condition = app`.

| ID | Kennzahl | Rechnung | Kriterium |
|---|---|---|---|
| `task_success` | Aufgaben ohne Hilfe gelöst | Anteil `outcome = gefunden` an allen App-Aufgaben | ≥ 90 % |
| `faster_share` | Zeitvergleich gepaart | Anteil der Paare, in denen die App-Aufgabe kürzer dauert als die Aufgabe ohne App; nur Paare, in denen **beide** Aufgaben `gefunden` sind. Gleichstand zählt nicht als schneller. Dazu: Mediane, Median der Differenz (ohne App − mit App), Vorzeichentest (zweiseitig, exakt, Gleichstände ausgeschlossen) | ≥ 60 % |
| `manual_corrections_median` | Manuelle Positionskorrekturen pro Tour | Median von `manual_position_count` über App-Aufgaben | ≤ 2 |
| `unjustified_stop_changes` | Unbegründete Zielwechsel | Summe von `stop_change_without_event_count` | = 0 (ein Verstoß genügt, auch bei kleiner Stichprobe) |
| `false_reroutes_per_tour` | Falsche Routenänderungen | Mittelwert von `reroute_count` je App-Aufgabe | ≤ 1 |
| `abort_rate` | Abbrüche | Anteil `outcome = abgebrochen` an App-Aufgaben | ≤ 10 % |
| `reuse_share` | „Würde die App wieder nutzen“ | Anteil Personen mit `q1 ≥ 4` | ≥ 60 % |
| `staff_hours` | Aufwand Marktpersonal | Wert aus `--staff-hours` (Stunden gesamt, vom Projektteam erfasst) | ≤ 2 h |
| `incident_rate` | Technische Fehlerquote | Summe `app_error_count` / Zahl der App-Aufgaben | ≤ 0,05 (1 je 20 Touren) |
| `field_reroutes` | Phase 2: Reroutes im Feldlauf | Maximum von `reroutes_per_tour` über alle Zeilen der Feldwerte (ungünstigster Ort) | ≤ 1 |

**Urteil:** „erfüllt“, „nicht erfüllt“ oder „zu wenig Daten“. „Zu wenig Daten“ gilt, wenn `n` unter `min_n` liegt oder kein Wert vorhanden ist. Zähler mit `-` (nicht gemessen) werden **nie** als 0 gewertet, sondern weggelassen; sie senken `n`.

Phase 2 verlangt für Positionsfehler und Gang-Erkennung nur Entscheidungsgrößen, keine Zielwerte. Das Werkzeug zeigt Median, 90-%-Wert und Anteil richtiger Gang aus den Feldwerten, bewertet sie aber nicht.

## 4. Abbrüche und Hilfe

- `hilfe`: Testleitung musste helfen. Zählt als **nicht** erfolgreich ohne Hilfe, aber nicht als Abbruch.
- `abgebrochen`: Testperson gibt auf. Zählt als nicht erfolgreich und als Abbruch.
- Paare, in denen eine der beiden Aufgaben nicht `gefunden` wurde, gehen nicht in den Zeitvergleich ein (die Zeit wäre nicht vergleichbar), werden aber im Bericht als „ausgeschlossen“ gezählt.

## 5. Eingabeformate

**Studien-Export** (Studienmodus der App, `add-pilot-study-mode`): je Sitzung `study-<testId>-<yyyyMMdd-HHmmss>.csv` (16 Spalten, Format siehe `openspec/changes/add-pilot-study-mode/design.md` Decision 4) und `.jsonl` (ein Ereignis pro Zeile, Typen `taskStart`, `taskEnd`, `manualPosition`, `reroute`, `stopChange`, `error`, `note`). Die CSV liefert die Zahlen, die JSONL wird geprüft (gültiges JSON, bekannter Typ, Test-ID).

**Fragebogen** (`survey.csv`, Papierbogen abgetippt, Spalten gemeinsam mit `kit/fragebogen.md` von Person C): `test_id,q1,q2,q3,q4,q5,freitext`, Werte 1–5, Freitext ohne Personenbezug.

| Spalte | Frage |
|---|---|
| `q1` | Würde die App wieder nutzen (Kriterium) |
| `q2` | Bedienung war einfach |
| `q3` | Vertrauen in die Standortanzeige |
| `q4` | Würde seltener Personal fragen |
| `q5` | Gesamteindruck |

**Feldwerte** (`field-summary.csv`): `site,date,device,median_error_m,p90_error_m,correct_aisle_share,reroutes_per_tour` (Datum ISO, Anteil 0–1).

Das Werkzeug lehnt Dateien mit fehlenden oder unbekannten Spalten, unbekannten Enum-Werten, Namen statt Test-IDs, doppelten Aufgaben oder unplausiblen Zeiten ab und nennt Datei und Zeile.

## 6. Grenzen

- Kleine Stichprobe, eine Testgruppe aus dem Umfeld der Schule, ein Markt oder Testraum. Ergebnisse gelten für diesen Pilot, nicht allgemein.
- Seltene Produkte sind bewusst gewählt; für häufige Produkte ist kein Vorteil zu erwarten (siehe `03_PILOT_READINESS.md` Abschnitt 7).
- Lerneffekte bleiben trotz wechselnder Reihenfolge möglich.
- Zähler (Reroutes, Zielwechsel, Korrekturen) hängen an der Instrumentierung der App; fehlt sie, steht `-` und die Kennzahl wird nicht erfunden.
- Die Kriterien sind vorläufig. Nach dem ersten Termin prüfen und `criteria.json` mit neuer Version anpassen; der Bericht nennt die Version.
