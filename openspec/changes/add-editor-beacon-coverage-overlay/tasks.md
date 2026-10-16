## 1. Setup

- [ ] 1.1 After the admin rebuild merge and `add-beacon-placement-planner`: branch `pilot/editor-coverage` from `origin/main`; copy this change; baseline admin checks.
- [ ] 1.2 Export shared test vectors from the Python planner (`fixtures/vectors.json`).

## 2. Implementation

- [ ] 2.1 `editor/coverage.ts` with unit tests on shared vectors.
- [ ] 2.2 Overlay toggle, radius control, percentage; Web Worker for large layouts.
- [ ] 2.3 Import `beacons-plan.csv` as beacon elements (placeholder identities); tests.

## 3. Handover

- [ ] 3.1 Mocked browser test; checks green; PR → `main` (review by Erik/Person B); `STATUS.md`.
