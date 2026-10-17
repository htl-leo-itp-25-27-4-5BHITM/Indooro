## 1. Setup

- [x] 1.1 (branch `pilot/editor-coverage` from `origin/pilot/first-store` plus `origin/pilot/beacon-planner`, PR → `pilot/first-store`) After the admin rebuild merge and `add-beacon-placement-planner`: branch `pilot/editor-coverage` from `origin/main`; copy this change; baseline admin checks.
- [x] 1.2 Export shared test vectors from the Python planner (`fixtures/vectors.json`).

## 2. Implementation

- [x] 2.1 `editor/coverage.ts` with unit tests on shared vectors.
- [x] 2.2 Overlay toggle, radius control, percentage; Web Worker for large layouts.
- [x] 2.3 Import `beacons-plan.csv` as beacon elements (placeholder identities); tests.

## 3. Handover

- [x] 3.1 Mocked browser test; checks green; PR → `pilot/first-store` (instead of `main`) (review by Erik/Person B); `STATUS.md`.
