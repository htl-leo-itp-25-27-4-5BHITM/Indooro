# Anleitung: Auswertung nach einer Testsitzung

## Ablauf

1. **Daten sammeln.** Exporte der Leihgeräte (`study-*.csv` und `.jsonl` aus „Testleitung → Export“) in einen Ordner legen, z. B. `~/pilot-daten/2026-11-04/study/`. Fragebogen abtippen (`survey.csv`, Spalten siehe `METHOD.md` Abschnitt 5), Feldwerte in `field-summary.csv`, Aufwand des Marktpersonals in Stunden notieren.
2. **Prüfen und auswerten:**

   ```sh
   python3 -I scripts/pilot-eval/evaluate.py \
     --study ~/pilot-daten/2026-11-04/study \
     --survey ~/pilot-daten/2026-11-04/survey.csv \
     --field ~/pilot-daten/2026-11-04/field-summary.csv \
     --staff-hours 1.5 \
     --out ~/pilot-daten/2026-11-04/bericht
   ```

   Windows (PowerShell): `python -I scripts\pilot-eval\evaluate.py --study … --out …`.
3. **Fehlermeldung ernst nehmen.** Bei ungültigen Eingaben (falsche Spalte, Name statt Test-ID, unbekannter Wert) bricht das Werkzeug mit Dateiname und Zeile ab und schreibt **keinen** Bericht. Datei korrigieren, erneut starten.
4. **Berichte lesen.** Im Ausgabeordner: `report.md` (Team, alle Kennzahlen mit Kriterium und Urteil), `report-markt.md` (zwei Seiten für den Markt, ohne technische Kennungen), `charts/success.svg`, `charts/times.svg`.

## Wohin mit echten Daten?

**Nie ins Repository.** Echte Exporte, Fragebögen und Berichte bleiben außerhalb von Git (eigener Ordner, nach dem Pilot löschen oder anonymisiert archivieren). Committet werden nur synthetische Beispiele (`scripts/pilot-eval/samples/`, `docs/pilot-readiness/evaluation/sample-report/`). Vor dem Teilen prüfen: nur Test-IDs, keine Namen im Freitext.

## Bericht an den Markt

1. `report-markt.md` lesen und prüfen: stimmen die Zahlen mit den Notizen der Testleitung überein?
2. Ergänzen, was das Werkzeug nicht weiß: Datum, Ort, Dank. Keine Namen von Testpersonen.
3. Bei „zu wenig Daten“ ehrlich bleiben: Kennzahl so weitergeben, nicht schönrechnen.
4. Als PDF oder ausgedruckt übergeben (Markdown z. B. in Word/Pages öffnen oder per Browser drucken). Erst nach Freigabe durch die Projektleitung versenden.

## Kriterien ändern

Schwellen stehen in `scripts/pilot-eval/criteria.json`. Änderung nur mit neuer `version` und kurzer Begründung in `METHOD.md`; der Bericht druckt die Version, damit alte und neue Auswertungen unterscheidbar bleiben.

## Tests des Werkzeugs

```sh
python3 -I -m unittest discover scripts/pilot-eval
```
