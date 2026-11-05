## ADDED Requirements

### Requirement: Lab runs locally and persists campaigns in the browser
The Positioning Lab (`tools/beacon-lab`) SHALL run as a static browser application without a backend, authentication or network access to the Indooro system at runtime. It SHALL persist measurement campaigns, their runs and saved evaluation results in the browser's IndexedDB database `indooro-positioning-lab`, and data SHALL leave the browser only through an export that the user triggers. A campaign SHALL hold metadata (store, device, conditions), a floor plan, beacons and a path-loss model, and SHALL be exportable and re-importable as a JSON campaign bundle that contains the raw runs. A campaign bundle that is malformed or has an unsupported schema or version SHALL be rejected with an error code and SHALL NOT create a campaign.

#### Scenario: Campaign survives a reload
- **GIVEN** a campaign with two imported runs was saved
- **WHEN** the browser tab is closed and the lab is opened again in the same browser
- **THEN** the campaign list shows the campaign and its runs are available without a new import

#### Scenario: Bundle round trip
- **GIVEN** a campaign with runs
- **WHEN** the user exports the campaign bundle and imports it into an empty browser
- **THEN** the campaign, the beacons, the floor plan and the raw runs are restored unchanged

#### Scenario: Broken bundle
- **WHEN** the user imports a bundle whose `schema` is not `indooro-positioning-lab/campaign-bundle` or whose structure is invalid
- **THEN** the lab shows an error with a code such as `bundle-schema` or `bundle-shape` and creates no campaign

#### Scenario: Demo campaign
- **WHEN** the user clicks "Demo-Kampagne laden (synthetisch)"
- **THEN** a campaign on the fictional demo store with 10 beacons, 2 calibration runs and 4 evaluation runs is created and marked synthetic

### Requirement: Import accepts CSV, JSON and Indooro recordings with validation
The lab SHALL import RSSI measurements from CSV (long format, delimiter detected from `;`, tab or `,`), from JSON (array of row objects or the `indooro-lab-json` format) and from the Indooro recording format (JSON Lines of `NavigationRecorder`, format `indooro-jsonl`). For CSV and JSON the user SHALL be able to change the column mapping; the required fields are time, beacon id and RSSI. For `indooro-jsonl`, `measurement` lines SHALL become RSSI samples, `truth` lines SHALL become reference points, `layout` lines SHALL be kept as metadata only, `scan` lines SHALL NOT become samples and SHALL be reported as unmatched iBeacons, and `step`, `heading` and `event` lines SHALL be ignored and counted. A `measurement` line with RSSI 0 SHALL be discarded with a notice. Every discarded row SHALL be reported as an issue with its line number, and the import SHALL be blocked when a required column is missing, the file is unreadable, time formats are mixed, a decimal comma occurs with a delimiter other than `;`, or no valid measurement row remains.

#### Scenario: Recording from the iOS app
- **GIVEN** a `.jsonl` recording with `measurement`, `truth`, `layout`, `scan` and `event` lines
- **WHEN** it is imported into a campaign
- **THEN** the measurements and truth points become a run, the `scan` iBeacons are listed as unmatched, the other line types are counted as ignored, and no error is raised

#### Scenario: Invalid rows are reported, not repaired
- **GIVEN** a CSV with 100 rows of which 3 have RSSI `abc`
- **WHEN** it is imported
- **THEN** the 3 rows are discarded, an issue `rssi-not-numeric` lists up to 5 example line numbers, and the remaining rows are kept

#### Scenario: Missing required column blocks the import
- **GIVEN** a CSV without an RSSI column
- **WHEN** the user imports it
- **THEN** the issue `missing-column` is shown, the "accept" action stays disabled and no run is created

#### Scenario: Ambiguous decimal comma
- **GIVEN** a comma-delimited CSV with values such as `-72,5`
- **WHEN** it is imported
- **THEN** the import is blocked with `decimal-comma-unconverted` and the values are not converted

#### Scenario: RSSI outside the plausible range
- **GIVEN** a row with RSSI `0` or `-120`
- **WHEN** it is imported
- **THEN** the row is discarded with `rssi-out-of-range`; valid RSSI lies between -110 and -1 dBm

### Requirement: Import never corrects data silently and records provenance
Raw samples SHALL stay unchanged after import. The only permitted transformations SHALL be: delimiter detection, decimal comma to decimal point with the delimiter `;`, Unicode minus to ASCII minus, milliseconds to seconds, ISO-8601 to epoch seconds, discarding invalid rows, stable sorting by time, removal of exact duplicates (first occurrence kept) and merging of identical repeated reference points. Each transformation SHALL be recorded with its count in the run's provenance, together with the source format, file name, row counts and the SHA-256 of the file. ISO-8601 timestamps without a time zone SHALL be read as UTC and this SHALL be recorded; impossible calendar dates or times SHALL be treated as invalid timestamps and SHALL NOT roll over to the next day. Relative timestamps with implausible spacing SHALL raise the warning `possible-milliseconds` and SHALL NOT be converted automatically. The lab SHALL NOT smooth, remove outliers, fill missing values or assign unknown beacons during import.

#### Scenario: Milliseconds are converted and logged
- **GIVEN** a file whose time column holds epoch milliseconds
- **WHEN** it is imported
- **THEN** times are stored in seconds and the provenance lists the transformation "milliseconds to seconds" with its row count

#### Scenario: Mixed time formats
- **GIVEN** a file whose time column mixes ISO-8601 strings and relative seconds
- **WHEN** it is imported
- **THEN** the import is blocked with `mixed-time-formats`

#### Scenario: Exact duplicates
- **GIVEN** a file with rows that are identical in time, beacon, RSSI and device
- **WHEN** it is imported
- **THEN** the first occurrence is kept, the number of removed duplicates is recorded, and more than 5 % removed duplicates raise `many-duplicates`

#### Scenario: Impossible date
- **GIVEN** a timestamp `2024-02-31T10:00:00Z`
- **WHEN** it is imported
- **THEN** the row is discarded as an invalid timestamp with its line number and is not shifted to 2 March

#### Scenario: Unknown beacons stay in the data
- **GIVEN** samples with a beacon id that is not part of the campaign
- **WHEN** the run is accepted
- **THEN** the samples are kept, the warning `unknown-beacon` is shown with the ids, and the algorithms ignore those beacons

### Requirement: Runs have a role and a quality assessment
Every run SHALL have a role `calibration` or `evaluation`, a kind `stationary` or `walk`, and an origin `real` or `synthetic`. The lab SHALL assess each run and SHALL mark it as not evaluable, with reasons, when it has no measurements, no ground truth, the role `calibration`, no measurement of a known beacon, any error-level issue, or fewer than 30 measurements. Beacons that are enabled in the campaign but never heard SHALL be reported. Reference points outside the floor plan SHALL be an error that prevents evaluation.

#### Scenario: Run without ground truth
- **GIVEN** a run with RSSI measurements but no reference points
- **WHEN** the quality assessment runs
- **THEN** the run is marked not evaluable with the reason that error metrics cannot be computed without ground truth

#### Scenario: Reference outside the floor plan
- **GIVEN** a floor plan of 30 x 20 units and a reference point at x = 45
- **WHEN** the references are validated
- **THEN** the issue `reference-out-of-bounds` is an error and the run is not evaluable

### Requirement: Distances are shown in metres only with a confirmed scale
Positions SHALL be stored and calculated in layout units (LE) with the origin at the top left and y increasing downwards. A floor plan SHALL start with the convention "1 unit = 1 m" and `scale.confirmed = false`. The lab SHALL display metres only when the scale is confirmed; otherwise errors, distances, scale bars and thresholds SHALL be shown in LE, the thresholds `within2`, `within3` and `within5` SHALL mean 2, 3 and 5 LE, and the map SHALL show the notice "Maßstab nicht bestätigt". Confirming the scale SHALL require the user to enter a review note, and saving a confirmed scale without a note SHALL be impossible.

#### Scenario: Unconfirmed scale
- **GIVEN** a campaign whose scale is not confirmed
- **WHEN** the positioning results are shown
- **THEN** all errors carry the unit "LE", a warning that metres are based on an assumption is part of the result, and no value is labelled "m"

#### Scenario: Confirming the scale
- **GIVEN** the plan page with meters per unit set to 1.0
- **WHEN** the user marks the scale as confirmed without a note
- **THEN** saving is refused with a message that a review note is required
- **AND** after the user enters the note "Regal 4: 10,0 m gemessen = 10 LE" and saves, results are shown in metres

### Requirement: RSSI filters are causal and raw data stays immutable
The RSSI smoothing filters (moving average, EMA, median, trimmed mean, Kalman) SHALL be causal: the filtered value at index i SHALL depend only on the raw values at indices up to i. Filters SHALL operate on copies and SHALL NOT modify the raw samples of a run. The Hampel outlier filter SHALL be documented as a centred offline cleaning step, SHALL be off by default and SHALL replace outliers only in the filtered copy. Epochs SHALL be built at `stepSec` intervals; a beacon SHALL be absent from an epoch when its latest sample is older than `staleSec`; with a filter other than "none" the value SHALL be the latest filtered value, and with "none" the mean of the raw values in the window.

#### Scenario: Future data does not change the past
- **GIVEN** a series filtered with the EMA filter
- **WHEN** a value at the end of the series is changed and the series is filtered again
- **THEN** all filtered values before the changed index are identical

#### Scenario: Raw data after filtering
- **GIVEN** a run that was evaluated with a median filter and Hampel enabled
- **WHEN** the run's raw samples are read afterwards
- **THEN** they are identical to the imported samples

#### Scenario: Stale beacon
- **GIVEN** a beacon whose last sample is older than `staleSec`
- **WHEN** an epoch is built
- **THEN** the beacon is not part of that epoch's observations

### Requirement: Path-loss calibration uses calibration runs only and warns about censoring
The lab SHALL fit the log-distance path-loss model `rssi = A - 10 n log10(d)` by ordinary least squares, globally and per beacon, only from runs with the role `calibration` and their stationary hold points, requiring at least 10 beacon/hold pairs, at least 2 distinct distances and distances of at least 0.1 m. The result SHALL include `r2`, the residual standard deviation, the sample count and the ids of the fitting runs (`fittedOnRunIds`), and SHALL be marked as `fitted`. A model that was not fitted SHALL be marked `default` or `manual`, and results that rely on a `default` model SHALL carry the warning "unkalibriertes Pfadverlustmodell". The calibration SHALL detect censoring by the receiver sensitivity by comparing the receive rate of each beacon/hold pair with the median rate within 5 m, and SHALL warn with a recommended maximum distance from the distance at which at least half of the pairs fall below 50 % of that rate. The user SHALL be able to limit the calibration with a maximum distance, and the lab SHALL NOT choose that limit automatically.

#### Scenario: Calibration warns about far beacons
- **GIVEN** the synthetic demo campaign whose simulated model is A = -70 dBm and n = 2.6
- **WHEN** the model is fitted without a maximum distance
- **THEN** the fit is A = -74.1 and n = 2.05 and a censoring warning with a recommended maximum distance is shown

#### Scenario: Calibration with a maximum distance
- **GIVEN** the same campaign
- **WHEN** the model is fitted with a maximum distance of 8 m
- **THEN** the fit is A = -70.6 and n = 2.54 without a censoring warning

#### Scenario: Evaluation run is rejected for calibration
- **WHEN** a run with the role `evaluation` is passed to the calibration
- **THEN** the calibration fails with a data-leak error and no model is produced

#### Scenario: Too little calibration data
- **GIVEN** calibration runs yielding fewer than 10 beacon/hold pairs
- **WHEN** the fit is started
- **THEN** the result is an error explaining the missing data and the campaign model is not changed

### Requirement: Positioning algorithms share one interface and report failure reasons
The lab SHALL provide four algorithms behind one interface that takes an epoch's observations and a context (beacons, floor plan, path-loss model, parameters, optional fingerprints) and returns either a position in LE or `position = null` with a textual reason: strongest beacon (ties broken by the smallest beacon id), weighted centroid (weights `10^(g * rssi / 10)`), trilateration (distances from the path-loss model clamped to the configured minimum and maximum, Huber-robust Levenberg-Marquardt with at most 100 iterations) and k-nearest-neighbour fingerprinting (median RSSI per hold point of calibration runs). Before estimation the lab SHALL drop non-finite RSSI, values below `rssiThreshold`, and unknown, disabled or position-less beacons, SHALL keep at most `topK` strongest beacons in a deterministic order, and SHALL require at least the larger of the algorithm minimum and `params.minBeacons`. Trilateration SHALL require at least 3 beacons, SHALL fail on collinear beacons with the reason "degenerierte Geometrie (Beacons kollinear)", and SHALL NOT clamp the result to the floor plan. Degenerate or empty input SHALL produce a failure with a reason instead of an exception.

#### Scenario: Too few beacons
- **GIVEN** an epoch with two usable beacons
- **WHEN** trilateration runs
- **THEN** the result is `position = null` with the reason "zu wenige Beacons (2 < 3)"

#### Scenario: Collinear beacons
- **GIVEN** an epoch whose three beacons lie on one line
- **WHEN** trilateration runs
- **THEN** the result is a failure with the reason "degenerierte Geometrie (Beacons kollinear)"

#### Scenario: Tie in strongest beacon
- **GIVEN** two beacons with identical RSSI
- **WHEN** the strongest-beacon algorithm runs
- **THEN** the position of the beacon with the smaller id is returned, every time

#### Scenario: Fingerprinting without calibration data
- **GIVEN** no calibration run with stationary hold points
- **WHEN** kNN fingerprinting is evaluated
- **THEN** every epoch fails with the reason that no fingerprints exist and the result carries the warning "Keine Fingerprints verfügbar"

### Requirement: Temporal filters never invent positions
The optional temporal filter on positions (EMA, constant-velocity Kalman, speed gate) SHALL keep failed epochs as failures and SHALL NOT hold or extrapolate the last position. A failure combined with a time gap larger than three times the median epoch spacing SHALL reset the filter state. The speed gate SHALL limit a step to `maxSpeed * dt` along its direction instead of discarding it. When a temporal filter is active, the result SHALL carry a notice that smoothing reduces jumps but adds delay and is not accuracy.

#### Scenario: Failure inside a smoothed track
- **GIVEN** a track with a failed epoch followed by a gap longer than three median steps
- **WHEN** the temporal filter runs
- **THEN** the failed epoch stays `null`, and the next valid position starts the filter fresh with output equal to input

#### Scenario: Speed gate
- **GIVEN** a step whose implied speed exceeds `maxSpeed`
- **WHEN** the gate is applied
- **THEN** the step is shortened to `maxSpeed * dt` in the same direction

### Requirement: Metrics are defined explicitly and failures are counted
The lab SHALL compute per run and algorithm: epochs with truth, valid estimates, failed estimates, `failureRate = failed / epochsWithTruth`, mean, median, RMSE, maximum, P90 and P95 over valid estimates, and the shares within 2, 3 and 5 units over all epochs with truth, where a failed estimate counts as not within. Percentiles SHALL use linear interpolation between order statistics (Hyndman-Fan type 7, `h = (n - 1) * p / 100`). The error CDF SHALL use the epochs with truth as denominator and therefore end at `1 - failureRate`. With no epoch with truth all metrics SHALL be null. Dynamic metrics SHALL be computed on the final positions: jump rate (steps above `jumpSpeedMps`, default 2, between consecutive valid estimates with `0 < dt <= maxGapSec`, default 2 s), mean step length, lag in seconds for walking runs with interpolated truth (search in [-3, 3] s with step 0.1 s), stationary precision (pooled RMS distance to the own centroid) and stationary bias (distance centroid to hold position). Precision and bias SHALL be reported separately.

#### Scenario: Percentile definition
- **GIVEN** valid errors 1, 2, 3 and 4
- **WHEN** the metrics are computed
- **THEN** mean = 2.5, median = 2.5, RMSE = sqrt(7.5), P90 = 3.7 and P95 = 3.85

#### Scenario: Failures count against the share within a threshold
- **GIVEN** 10 epochs with truth of which 2 have no estimate and 4 valid estimates have an error of at most 2
- **WHEN** the metrics are computed
- **THEN** `failureRate` = 0.2 and `within2` = 0.4, and the failed epochs are not part of the mean

#### Scenario: Hold detection from ground truth
- **GIVEN** two consecutive reference points with identical position
- **WHEN** the reference is resolved for an epoch between their times
- **THEN** the hold position is used as truth for that epoch

#### Scenario: Interpolated truth is flagged
- **GIVEN** a walking run evaluated with interpolated truth
- **WHEN** the result is created
- **THEN** the result carries the warning that a constant walking speed between reference points is assumed

#### Scenario: Small sample
- **GIVEN** a result based on fewer than 100 evaluated epochs
- **WHEN** the result is created
- **THEN** it carries the warning that the figures are exploratory and P90 and P95 are not reliable

### Requirement: Leakage between calibration and evaluation is prevented
`runPositioning` SHALL throw a `LeakageError`, and the user interface SHALL show an error instead of a result, when: the evaluated run has the role `calibration`; a supplied calibration run has the role `evaluation`; a calibration run and the evaluated run have the same id; a calibration run and the evaluated run have the same raw-data SHA-256; or the algorithm requires a path-loss model and the campaign or beacon model was fitted on the evaluated run (`fittedOnRunIds`). Fingerprints SHALL be built only from runs with the role `calibration`. The positioning and comparison pages SHALL NOT offer calibration runs for evaluation.

#### Scenario: Calibration run evaluated
- **WHEN** a run with the role `calibration` is passed to the positioning pipeline
- **THEN** a `LeakageError` is raised and no result is produced

#### Scenario: Same content under another role
- **GIVEN** a file imported once as calibration and once as evaluation, so that both runs have the same SHA-256
- **WHEN** the evaluation run is evaluated with that calibration run supplied
- **THEN** a `LeakageError` names the shared SHA-256 prefix

#### Scenario: Model fitted on the evaluated run
- **GIVEN** a campaign path-loss model whose `fittedOnRunIds` contains the evaluated run
- **WHEN** trilateration is evaluated on that run
- **THEN** a `LeakageError` states that the model was fitted on the same run

### Requirement: Algorithms are compared on a common epoch subset
`compareAlgorithms` SHALL evaluate several configurations on the same run and SHALL return, in addition to each configuration's own metrics, metrics restricted to the epochs at which all configurations had a valid estimate and a reference (`commonEpochs`). On that subset the failure rate SHALL be 0. The individual metrics SHALL remain the basis for availability. Comparison is meaningful only for configurations with the same `stepSec`, because configurations with different steps share few identical timestamps and `commonEpochs` becomes small; this SHALL be documented and `commonEpochs` SHALL always be reported. The comparison SHALL provide an error CDF per configuration and a parameter sweep. The report SHALL NOT rank algorithms.

#### Scenario: Algorithm that skips hard epochs
- **GIVEN** algorithm A fails in epochs where algorithm B delivers large errors
- **WHEN** both are compared
- **THEN** the individual table shows A with a failure rate above 0 and a lower mean, and the common-subset table compares both only on epochs where both had an estimate, and states `commonEpochs`

#### Scenario: Different step sizes
- **GIVEN** two configurations with different `stepSec`
- **WHEN** they are compared
- **THEN** `commonEpochs` is reported and is small, which makes the common-subset metrics visibly thin

### Requirement: Heatmaps show measured values and mark interpolation
Heatmaps SHALL be built from measured values at real positions (RSSI per beacon, position error, beacon coverage, measurement density). The default mode `points` SHALL draw circles only at real measurement positions and SHALL NOT interpolate. The modes `binned` (cell mean, only cells with measurements) and `idw` (inverse-distance weighting, default power 2) SHALL hatch areas without data and label them "keine Daten". IDW SHALL compute no value farther than `maxDistance` (default 3 LE) from a real measurement, SHALL be labelled "INTERPOLIERT (IDW, p=..., max ... LE)" in the legend, SHALL be exact at the data points, and SHALL stay within the range of the measured values. Real measurement points SHALL be drawn on top in every mode. The legend SHALL state title, unit, minimum, maximum and method. Failed position estimates SHALL NOT be drawn at an invented position.

#### Scenario: Default heatmap
- **WHEN** the user opens the heatmap page
- **THEN** only circles at real measurement positions are drawn and there is no interpolated colour field

#### Scenario: IDW heatmap
- **WHEN** the user selects IDW
- **THEN** the legend states that the map is interpolated with its power and maximum distance, cells beyond the maximum distance are hatched as "no data", and real points remain visible

#### Scenario: Failed estimates on the map
- **GIVEN** a result with failed epochs
- **WHEN** the estimates are shown on the map
- **THEN** no point is drawn for the failed epochs and the legend states how many failed and how many epochs have no reference

### Requirement: Replay reproduces a run in time
The replay SHALL play a run's ground truth and estimates over time with play/pause, previous/next epoch, a time slider and speeds 0.5x, 1x, 2x, 5x and 10x. It SHALL show the truth, the estimate, the error line with the current error, a fading trail, the beacons heard in the last 2 s with their RSSI and, in the sidebar, RSSI bars. For a failed epoch it SHALL show "keine Schätzung: <reason>" and no estimate point. Errors SHALL be shown in metres only with a confirmed scale. The replay SHALL NOT calculate a result for a calibration run and SHALL show an error instead. The user SHALL be able to switch the algorithm during replay.

#### Scenario: Pause stops time
- **GIVEN** a running replay
- **WHEN** the user presses pause
- **THEN** the displayed time stays constant until play is pressed again

#### Scenario: Failed epoch
- **GIVEN** an epoch without a valid estimate
- **WHEN** the replay reaches it
- **THEN** the notice "keine Schätzung" with the reason is shown and no estimate marker is drawn

#### Scenario: Calibration run
- **WHEN** the user opens the replay for a calibration run
- **THEN** an error is shown instead of computing positions

### Requirement: Report and exports state limitations and synthetic origin
The lab SHALL generate a printable, self-contained HTML report (no JavaScript, inline CSS, A4 print layout) only from stored data, with the sections: title and metadata, data basis (runs, origin REAL data or SYNTHETIC, row counts, files with SHA-256, transformations, data issues), test environment and beacons, scale and coordinates, algorithms and parameters with a configuration hash per result, calibration, results including the common-subset comparison and dynamic metrics, figures, limitations, team interpretation and reproducibility. The limitations section SHALL be derived only from facts in the data and SHALL list: synthetic data; unconfirmed scale; default or manual path-loss model; fewer than 100 evaluated epochs; no ground truth; only one measurement device; fewer than 3 evaluation runs per run kind; failed estimates; unknown beacons; runs that are not evaluable; data errors; and every warning issued by the evaluation. A report that contains synthetic data SHALL carry the banner "ENTHÄLT SYNTHETISCHE DATEN – KEINE MESSERGEBNISSE". The report SHALL NOT contain hard-coded results, evaluative wording or a ranking, SHALL escape user-entered text, SHALL sanitise embedded SVG, and SHALL show the team's interpretation in its own section labelled as the team's interpretation, or "Keine Interpretation erfasst." when empty. The reproducibility section SHALL state tool version, commit, configuration hashes, seeds of synthetic runs, raw-file hashes and the creation time. The lab SHALL export results as JSON (full configurations, metrics, warnings, optionally all epoch estimates), metrics and epoch estimates as CSV, and the campaign as a bundle.

#### Scenario: Report on the demo campaign
- **GIVEN** a saved result from the demo campaign
- **WHEN** the report preview is opened
- **THEN** it shows the synthetic banner, the configuration hash, the metrics, and the limitations "synthetic data" and "scale not confirmed"

#### Scenario: Interpretation text is escaped
- **GIVEN** the team entered interpretation text containing `<script>`
- **WHEN** the report is rendered
- **THEN** the text appears escaped and no script element is present in the HTML

#### Scenario: Empty interpretation
- **GIVEN** no interpretation was entered
- **WHEN** the report is rendered
- **THEN** the interpretation section reads "Keine Interpretation erfasst."

#### Scenario: Exports
- **WHEN** the user exports a saved result
- **THEN** HTML, JSON and CSV files are offered, and the CSV rows state the unit "LE" when the scale is not confirmed

### Requirement: Synthetic data is deterministic and always labelled
The lab SHALL generate synthetic runs with eight scenarios (`good-coverage`, `poor-coverage`, `high-noise`, `beacon-dropout`, `aisle-walk`, `jumping-between-beacons`, `miscalibrated`, `multipath`) from a seeded pseudo-random generator, without clock or `Math.random`, so that the same campaign, scenario configuration and role SHALL produce byte-identical output. Each generated run SHALL carry `origin = "synthetic"`, `provenance.format = "synthetic"`, the full generator configuration, the SHA-256 of the canonical configuration as its hash, and "SYNTHETISCH" in its name. The origin SHALL be passed to tables, charts, the map badge "SYNTHETISCH" and the report. Stationary calibration and evaluation scenarios SHALL use different point sets. The lab SHALL document that the model has no wall attenuation, body shadowing, device differences or correlated noise, and synthetic results SHALL NOT be presented as measurements of real hardware.

#### Scenario: Reproducible generation
- **WHEN** a scenario is generated twice with the same seed and configuration
- **THEN** the two runs are identical when serialised

#### Scenario: Labelling
- **GIVEN** a generated run
- **WHEN** it is shown in the run list, on the map and in the report
- **THEN** each place marks it as SYNTHETIC

#### Scenario: Changed configuration
- **GIVEN** the user changes the noise of a scenario before generating
- **WHEN** the run is generated
- **THEN** the changed value is stored in `provenance.synthetic` and the run has a different identifier
