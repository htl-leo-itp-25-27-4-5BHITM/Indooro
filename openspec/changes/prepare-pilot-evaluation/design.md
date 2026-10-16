## Context

Acceptance criteria (provisional, `03_PILOT_READINESS.md` 6.3): task success without help ≥ 90 %; with app faster in ≥ 60 % of paired rare-product tasks; median manual position corrections per tour ≤ 2; unjustified stop changes = 0; false reroutes ≤ 1 per tour; aborts ≤ 10 %; „würde wieder nutzen“ ≥ 4 for ≥ 60 %; staff effort ≤ 2 h; technical incidents ≤ 1 per 20 tours.

Study export: CSV header and enums defined in `add-pilot-study-mode/design.md` decision 4. Questionnaire CSV: `test_id,q1,q2,q3,q4,q5,freitext` with values 1–5 (defined together with `fragebogen.md`). Field summaries: `docs/pilot-readiness/hardware/reports/*.md` front matter or a CSV `field-summary.csv` (`site,date,device,median_error_m,p90_error_m,correct_aisle_share,reroutes_per_tour`).

## Goals / Non-Goals

Goals: one command produces the full evaluation with criteria verdicts; reproducible; works on Windows.

Non-goals: statistics beyond descriptive measures and a paired sign test; dashboards; storing personal data.

## Decisions

1. **Python standard library only**, `python -I scripts/pilot-eval/evaluate.py --study <dir> --survey <csv> --field <csv> --criteria criteria.json --out <dir>`.
2. **Criteria as data.** `scripts/pilot-eval/criteria.json` holds thresholds so they can be revised after the first session without code changes; the report prints the criteria version.
3. **Pairing.** For the with/without comparison, tasks are paired per test id by product difficulty class (column `pair_id` optional in the task list; otherwise consecutive app/ohne_app tasks are paired). Report median difference and a sign test p-value; small samples are flagged („n < 10: nur beschreibend“).
4. **Outputs.** `report.md` (team), `report-markt.md` (two pages, no technical jargon), `charts/*.svg` (bar chart success, box-like plot of times written as simple SVG).
5. **Validation of inputs.** Reject files with unknown enum values, missing columns or names instead of test ids (regex `^T\d{1,3}$`).

## Risks / Trade-offs

- Small sample sizes in an HTL pilot; the report must say so explicitly.
- Format drift from the iOS export; guarded by the shared sample files and an input validator.

## Migration / Rollback

Additive tool.
