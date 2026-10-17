# Beispielbericht (synthetisch)

Erzeugt aus den **erfundenen** Daten in `scripts/pilot-eval/samples/` (12 Test-IDs, keine echten Personen, keine Messwerte aus einem Markt). Zeigt Aufbau und Format der Berichte, nicht Ergebnisse des Piloten.

Neu erzeugen:

```sh
python3 -I scripts/pilot-eval/evaluate.py \
  --study scripts/pilot-eval/samples/study \
  --survey scripts/pilot-eval/samples/survey.csv \
  --field scripts/pilot-eval/samples/field-summary.csv \
  --staff-hours 1.5 \
  --out docs/pilot-readiness/evaluation/sample-report
```
