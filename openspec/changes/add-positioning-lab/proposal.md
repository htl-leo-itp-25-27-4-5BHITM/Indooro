## Why

`establish-pilot-field-measurement` defines how real beacon walks are recorded and which metrics a report needs, but the analysis side is a set of Python scripts (`scripts/field/*`) and a Swift replay. There is no place where the team can import a recording, check its quality, fit a path-loss model from calibration runs, compare positioning algorithms on the same data, look at honest maps and produce a citable report. Without it, three risks stay open:

- Results get quoted without their limits: metres without a confirmed scale, means that ignore failed estimates, rankings from one device and one run, synthetic numbers mistaken for measurements.
- Calibration data leaks into evaluation (same file imported twice, a model fitted on the run it is judged on), which makes any accuracy figure look better than it is.
- The target accuracy of about 4-5 m is a development goal. No real measurement has been evaluated yet, so the analysis tool must exist and be trustworthy before the first real campaign.

## What Changes

- New standalone browser tool `tools/beacon-lab` ("Indooro Positioning Lab"; React 19, TypeScript, Vite 7, Tailwind CSS 4). It runs locally, has no backend, no login and no network access at runtime, and stores campaigns in IndexedDB (`indooro-positioning-lab`).
- Import of RSSI measurements from CSV, JSON and the real iOS recording format (`indooro-jsonl`, JSON Lines of `NavigationRecorder`) with column mapping, line-numbered validation, a provenance record (file SHA-256, logged transformations) and no silent correction.
- Floor plan from an Indooro layout JSON or a fictional demo store; scale handling where metres are shown only after the scale was confirmed with a review note.
- RSSI analysis with causal filters, log-distance path-loss calibration from calibration runs only (with detection of censoring by the receiver sensitivity), four positioning algorithms behind one interface (strongest beacon, weighted centroid, trilateration, kNN fingerprinting), optional temporal filters, error and dynamic metrics, leakage protection, comparison on the common epoch subset, honest heatmaps, replay, a printable report and CSV/JSON exports.
- Deterministic synthetic data (8 scenarios, seeded) that is labelled SYNTHETIC end to end.
- New CI workflow `.github/workflows/beacon-lab.yaml` that runs only for changes under `tools/beacon-lab/**` (typecheck, unit tests, build, Playwright tests).
- Documentation in `tools/beacon-lab/README.md` and `tools/beacon-lab/docs/` (field guide, architecture, import formats, algorithms, metrics, map and heatmaps, synthetic data, reporting, testing, iOS integration spec).
- Follow-up, not part of this change: the iOS recorder extension `indooro-recording/2` (session line, `truth.marker`, `sync` line) is specified in `docs/IOS_INTEGRATION_SPEC.md` and will be implemented in a separate change.

## Capabilities

### New Capabilities

- `positioning-lab`: campaign management and persistence, import and validation, scale and units, RSSI filters, calibration, positioning algorithms, metrics, leakage prevention, algorithm comparison, heatmaps, replay, report and exports, synthetic data.

### Modified Capabilities

None. The lab consumes the layout JSON and the recording format that already exist and changes neither.

## Impact

- Affected: new directory `tools/beacon-lab/**`, new workflow `.github/workflows/beacon-lab.yaml`, this change. No change to the backend, the admin UI, the iOS app, the OpenAPI contract or the database.
- Relationship: complements `establish-pilot-field-measurement` (protocol, ground-truth markers, report metrics) and `beacon-placement-planning` (coverage of planned beacons). The lab does not replace the Swift replay; it approximates the iOS pipeline in principle, not 1:1 (documented in `docs/ALGORITHMS.md`).
- Privacy: data stays in the browser or in files the team exports itself. Recordings are anonymized with `scripts/field/anonymize_recording.py` before they are shared. The lab never contacts the production system.
- Node.js 22.13 or newer is required (same as `admin-ui`). The workflow does not run for changes outside `tools/beacon-lab/**`, so existing CI is unaffected.
- Documentation sources: `tools/beacon-lab/README.md` and `tools/beacon-lab/docs/*.md`; the requirements were checked against `tools/beacon-lab/src`.
