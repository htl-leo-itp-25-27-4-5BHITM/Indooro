## 1. Setup

- [ ] 1.1 Check out `pilot/pilot-evaluation`, merge `origin/pilot/first-store`; run `npx -y @fission-ai/openspec@1.3.1 validate prepare-pilot-evaluation --strict`.
- [ ] 1.2 Read `docs/pilot-readiness/03_PILOT_READINESS.md` 6, `add-pilot-study-mode/design.md` decision 4, and `prepare-pilot-store-operations` tasks 4.4–4.5 (questionnaire, test protocol).

## 2. Method and Criteria

- [ ] 2.1 Write `docs/pilot-readiness/evaluation/METHOD.md`: study design (within-subject, with/without app, task order alternated), sample size guidance, how to pair tasks, how to handle aborts, limitations.
- [ ] 2.2 Create `scripts/pilot-eval/criteria.json` (version 1) from `03_PILOT_READINESS.md` 6.2/6.3.
- [ ] 2.3 Define the questionnaire CSV columns together with Person C's `fragebogen.md` and document them in `METHOD.md`.

## 3. Synthetic Data

- [ ] 3.1 Create `scripts/pilot-eval/samples/` with synthetic study CSV/JSONL for 12 test ids in exactly the export format (use `docs/pilot-readiness/kit/study-export-sample/` once it exists and keep both consistent), a questionnaire CSV, and a field summary CSV.

## 4. Tool

- [ ] 4.1 `scripts/pilot-eval/inputs.py`: loaders and validators per design decision 5.
- [ ] 4.2 `metrics.py`: all metrics of the requirement, pairing per design decision 3, sign test.
- [ ] 4.3 `report.py`: `report.md`, `report-markt.md`, SVG charts.
- [ ] 4.4 `evaluate.py`: CLI per design decision 1, exit codes.
- [ ] 4.5 Unit tests (`python -I -m unittest discover scripts/pilot-eval`) for validation errors, each metric on hand-computed small inputs, pairing, „zu wenig Daten“, report generation.

## 5. Templates and Handover

- [ ] 5.1 Write `docs/pilot-readiness/evaluation/REPORT_GUIDE.md`: how to run after a session, where to keep real data (outside git), how to send the store report.
- [ ] 5.2 Run the tool on the synthetic sample; commit the sample reports under `docs/pilot-readiness/evaluation/sample-report/`.
- [ ] 5.3 Run `npx -y @fission-ai/openspec@1.3.1 validate --all --strict`; open a pull request `pilot/pilot-evaluation` → `pilot/first-store`; update `STATUS.md`.
