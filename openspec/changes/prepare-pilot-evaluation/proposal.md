## Why

The pilot only proves something if its results are evaluated consistently against the criteria defined beforehand (`docs/pilot-readiness/03_PILOT_READINESS.md` 6.2 and 6.3): task success without staff help, search time with versus without the app, manual position corrections, unjustified route and stop changes, aborts, satisfaction, staff effort, technical error rate, plus the positioning numbers from field measurement. Without a prepared evaluation the team would compute these by hand after the sessions, under time pressure before the diploma thesis deadline, and the store would receive a report weeks late.

## What Changes

- Add a cross-platform Python evaluation tool `scripts/pilot-eval/` that reads the study exports (CSV/JSONL from `add-pilot-study-mode`), the questionnaire results (CSV from the paper form), and the field measurement summaries, and computes every phase 3 metric with its acceptance criterion and pass/fail.
- Generate a Markdown report for the team and a short two-page version for the store, with charts as SVG.
- Provide synthetic sample data so the tool is complete and tested before the first session.

## Capabilities

### New Capabilities

- `pilot-evaluation`: metric computation against acceptance criteria and report generation from study, questionnaire and field data.

### Modified Capabilities

- None.

## Impact

- Owner: Person C „Feld, Daten & Pilot-Kit“ (Windows), branch `pilot/pilot-evaluation` from `pilot/first-store`.
- Files: `scripts/pilot-eval/**` (new), `docs/pilot-readiness/evaluation/` (new: method, criteria, report template).
- Input contract: export format in `openspec/changes/add-pilot-study-mode/design.md` decision 4; questionnaire columns from `docs/pilot-readiness/kit/fragebogen.md` (`prepare-pilot-store-operations` 4.4).
- Privacy: tool works only with test ids; real data stays outside git, only synthetic samples are committed.
