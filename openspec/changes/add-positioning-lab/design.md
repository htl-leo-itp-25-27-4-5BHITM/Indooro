## Context

- The iOS app records RSSI and ground truth in DEBUG builds only (`NavigationRecorder.swift`, JSON Lines with the line types `measurement`, `truth`, `layout`, `scan`, `step`, `heading`, `event`). The recording has no device model, scenario or run role.
- `establish-pilot-field-measurement` defines markers, stationary windows and walking loops. Its tooling (`scripts/field/*`, Swift replay) produces a per-tick CSV and a Markdown table; it does not compare algorithms or fit a path-loss model.
- Default path-loss model of the iOS app: -72 dBm at 1 m, exponent 2.8, distances clamped to 0.35-11 m. These values are marked provisional in the app.
- No real measurement has been evaluated with the lab. All bundled data is synthetic.

## Goals / Non-Goals

Goals: reproducible evaluation of field recordings; results that carry their own limits; no number in a report that was not computed from imported data.

Non-goals: a production positioning engine, a 1:1 port of the iOS pipeline, a backend or multi-user sync, multi-floor plans, wall attenuation or body shadowing in the simulation, automatic conclusions or rankings in the report, changes to the iOS app (see `docs/IOS_INTEGRATION_SPEC.md`).

## Decisions

1. **Local-only, IndexedDB.** The lab is a static Vite app with no backend, authentication or runtime network access. Campaigns, runs and saved results live in the IndexedDB database `indooro-positioning-lab` of the browser. Data leaves the browser only through an export the team triggers (campaign bundle, HTML report, JSON, CSV). Alternative considered: reuse the admin backend; rejected because measurement data is not customer data and the lab must work without any Indooro system. Trade-off: data is per browser and not synchronised; the campaign bundle is the exchange format.
2. **Layout units and confirmed scale.** All positions are layout units (LE, grid cells, origin top left, y downwards, like the layout JSON). Metres appear only when `scale.confirmed` is true; otherwise results are labelled LE, the thresholds `within2/3/5` mean 2/3/5 LE and a warning is added. Confirming the scale requires a review note. The convention "1 cell = 1 m" is only a default, never a fact.
3. **Raw data is immutable, no silent correction.** Import keeps raw samples unchanged. Every transformation (delimiter detection, decimal comma with `;`, Unicode minus, milliseconds to seconds, ISO-8601 to epoch seconds with UTC assumption, discarding invalid rows, stable sort, exact duplicate removal, merging identical reference repeats) is listed in `provenance.transformations`; every discarded row is a line-numbered issue. Ambiguity blocks the import instead of being guessed (mixed time formats, decimal comma with another delimiter, no valid row). RSSI 0 from CoreLocation means "unknown" and is dropped with a note.
4. **Causal RSSI filters.** Smoothing filters use only past values, so a later measurement cannot change an earlier epoch (tested). Filters work on copies. The one centred filter, Hampel, is documented as offline cleaning and off by default.
5. **Leakage rules.** Calibration and fingerprints use runs with role `calibration` only; evaluation runs only on role `evaluation`. `runPositioning` throws `LeakageError` when the run is a calibration run, when a calibration run is an evaluation run, when both share an id, when both share the raw-data SHA-256 (same content under another id or role), or when a path-loss model was fitted on the evaluated run (`fittedOnRunIds`). Split by run, never by sample, because neighbouring RSSI values are correlated. This is the only intended exception to "failures are results, not exceptions".
6. **Failure policy.** An algorithm returns `{position: null, reason}` for too few beacons, collinear geometry, invalid model or scale, non-convergence or missing fingerprints. Failures are counted: `failureRate` is always reported, `within*` has the epochs with truth as denominator (failure = not within), mean/median/RMSE/P90/P95/max cover valid estimates only. The temporal filter never fills a failure with the last position; a failure plus a time gap above 3 median epoch steps resets the filter state.
7. **Percentile type 7.** Percentiles use linear interpolation between order statistics (Hyndman-Fan type 7, NumPy default, Excel `PERCENTILE.INC`). Example from the docs: errors 1, 2, 3, 4 give P90 3.7 and P95 3.85. The error CDF uses the same denominator as `within*`, so it ends at `1 - failureRate`.
8. **Censoring detection.** A receiver reports only packets above its sensitivity, so far beacons appear mainly when propagation was favourable; the fitted exponent is then too low. `detectCensoring` compares the receive rate of each beacon/hold pair with the median within 5 m and warns from the distance at which at least half of the pairs fall below 50 % of that rate, with a recommended maximum distance. `calibrateFromRuns` accepts `maxDistanceM`. The lab does not choose the limit; the team decides and documents it in the report. Evidence from the synthetic demo campaign (simulated A -70 dBm, n 2.6): without a limit A -74.1 and n 2.05 with warning; with 8 m A -70.6 and n 2.54 without warning (`src/integration/pipeline.integration.test.ts`).
9. **Comparison on the common epoch subset.** `compareAlgorithms` computes the individual metrics and, in addition, metrics restricted to epochs where all compared configurations had a valid estimate and a reference (`commonEpochs`). On that subset the failure rate is 0 by construction, so availability is read from the individual metrics. Comparison needs equal `stepSec`.
10. **Honest heatmaps.** Heatmap input is measured values at real positions. The default mode (`points`) never interpolates. `binned` and `idw` hatch areas without data and mark them "no data"; IDW is labelled as interpolated with its power and maximum distance, computes nothing beyond `maxDistance` (default 3 LE) of a real measurement, and real points are drawn on top. Failed estimates are never drawn at an invented position.
11. **Synthetic stays synthetic.** Generated runs carry `origin: "synthetic"`, `provenance.format: "synthetic"`, the full generator configuration and "SYNTHETISCH" in their name. The origin is passed through tables, charts and the report. The generator uses only a seeded `mulberry32` PRNG and fixed timestamps, so equal configuration and campaign give byte-identical output. Its limits (no wall attenuation, no body shadowing, uncorrelated normal noise, no device differences) are documented, and results on it only show that the evaluation chain computes correctly.
12. **Report limitations derived from facts.** The "limits" section is generated only from facts in the data (synthetic origin, unconfirmed scale, default or manual path-loss model, fewer than 100 evaluated epochs, no ground truth, single device, fewer than 3 evaluation runs per run kind, failures, unknown beacons, non-evaluable runs, data errors, every pipeline warning). The report contains no hard-coded numbers, no ranking and no evaluative wording. The team's interpretation is a separate section, escaped and labelled as the team's hypothesis. The report is a self-contained HTML file without JavaScript; PDF goes through the browser print dialog.
13. **CI scope.** A dedicated workflow `.github/workflows/beacon-lab.yaml` uses a path filter on `tools/beacon-lab/**`, so the lab cannot slow down or break the existing `ci.yaml` and `ios.yaml`.

## Implemented vs. planned

Implemented: everything covered by the specs of this change; Vitest (446 tests in 36 files, run of 2026-11-05) and Playwright (20 tests: 17 desktop, 1 mobile, 2 screenshots) as documented in `docs/TESTING.md`.

Planned or open (not requirements of this change): the iOS recorder `indooro-recording/2` in a separate change; the first evaluation of a real campaign; on-site confirmation of the scale; a web worker for large runs (not needed so far: 30 min x 10 beacons x 5 Hz in under 0.5 s); walls as obstacles for propagation.

## Risks / Trade-offs

- The lab approximates the iOS pipeline in principle (trilateration with robust fit, speed gate, smoothing); the Levenberg-Marquardt solver, the missing confidence and the missing map matching differ from the app. Lab numbers are not app numbers.
- Ground truth by tapping the map limits meaningful accuracy to roughly decimetres; interpolated truth assumes constant walking speed.
- The path-loss calibration is valid only for the device used (antenna, firmware) and for the time and conditions of the calibration runs.
- Epochs of one run are autocorrelated; P95 needs at least about 100 valid estimates and statements need repeated runs, otherwise the pipeline flags the result as exploratory.
- IndexedDB data can be lost by clearing site data; exports are the backup.

## Migration / Rollback

Additive. The tool is a new directory plus one workflow file; removing both reverts the change. There is no data migration and no change to existing systems.
