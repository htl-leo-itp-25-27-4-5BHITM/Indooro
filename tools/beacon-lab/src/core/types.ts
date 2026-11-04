/**
 * Indooro Positioning Lab – shared domain model.
 *
 * This file is the contract between all modules (data, positioning, map, ui, report).
 * Change it only deliberately; every module depends on it.
 *
 * COORDINATE CONVENTION (identical to the Indooro layout JSON, see
 * docs/pilot-readiness/operations/LAYOUT_CONVENTIONS.md and IndoorGraph.swift):
 *   - Frame "layout": origin (0,0) = top-left corner of the grid,
 *     x grows to the right, y grows DOWN. One grid cell covers [x,x+1) x [y,y+1).
 *   - All positions in this model are stored in LAYOUT UNITS (grid cells).
 *   - Physical metres = layout units * FloorPlan.scale.metersPerUnit.
 *     The Indooro docs state "1 cell = 1 m" as a convention, but this is not enforced anywhere
 *     in code. Therefore `scale.confirmed` must be explicitly set by the user after verifying it
 *     on site. While it is false, the UI shows errors in layout units ("LE") and never as metres.
 */

export type DataOrigin = "real" | "synthetic";

export interface Point {
  x: number;
  y: number;
}

/** Physical scale of a floor plan. */
export interface MapScale {
  /** metres per layout unit (grid cell). */
  metersPerUnit: number;
  /** true only if a human verified the scale (e.g. measured a known distance on site). */
  confirmed: boolean;
  /** free-text provenance, e.g. "Laser-measured 12.0 m wall = 12 cells, 2026-11-20". */
  note: string;
}

export type FloorElementType =
  | "shelf"
  | "checkout"
  | "entrance"
  | "wall"
  | "cooler"
  | "freezer"
  | "counter"
  | "anchor"
  | "other";

export interface FloorElement {
  id: string;
  type: FloorElementType;
  /** top-left corner (layout units) before rotation */
  x: number;
  y: number;
  width: number;
  height: number;
  /** degrees, clockwise, around the element centre (Indooro convention) */
  rotationDeg: number;
  label?: string;
  category?: string;
}

export interface FloorPlan {
  id: string;
  name: string;
  /** grid size in layout units */
  width: number;
  height: number;
  elements: FloorElement[];
  scale: MapScale;
  origin: DataOrigin;
  /** where the plan came from (file name, "built-in fictional demo market", ...) */
  source: string;
}

/** Log-distance path-loss model: RSSI(d) = rssiAt1m - 10 * n * log10(d / 1 m). */
export interface PathLossModel {
  rssiAt1m: number;
  pathLossExponent: number;
  /**
   * fitted   = least squares on calibration runs (see calibration fields)
   * manual   = typed in by the user (e.g. from a datasheet) – not verified
   * default  = lab default, NOT calibrated; results must be labelled as uncalibrated
   */
  source: "fitted" | "manual" | "default";
  fittedOnRunIds?: string[];
  sampleCount?: number;
  r2?: number;
  residualStdDb?: number;
}

export interface Beacon {
  /** stable identifier used in measurements (e.g. "Indooro1" or "1-4" major-minor) */
  id: string;
  label?: string;
  uuid?: string;
  major?: number;
  minor?: number;
  position: Point;
  /** advertised measured power / txPower as configured on the device, if known (dBm) */
  txPowerDbm?: number;
  enabled: boolean;
  /** optional per-beacon path-loss model; falls back to the campaign model */
  pathLoss?: PathLossModel;
}

/** One raw RSSI observation. Raw samples are NEVER mutated after import. */
export interface RssiSample {
  /** seconds (float). Absolute epoch seconds if known, otherwise relative to run start. */
  t: number;
  beaconId: string;
  /** dBm, negative. 0 is not a valid RSSI (CoreLocation reports 0 for "unknown"). */
  rssi: number;
  deviceId?: string;
  /** e.g. "ranging", "rssi", "csv" */
  source?: string;
  /** 1-based line / row number in the imported file – for traceability */
  sourceRow?: number;
}

/** Ground-truth reference observation: "at time t the device was at position". */
export interface ReferencePoint {
  t: number;
  position: Point;
  label?: string;
  sourceRow?: number;
}

export type RunKind = "stationary" | "walk";
/**
 * calibration = may be used to fit path-loss parameters or build fingerprints.
 * evaluation  = may ONLY be used to compute error metrics.
 * A run can never be both. The pipeline refuses to evaluate on calibration runs
 * (data leakage) and refuses to calibrate from evaluation runs.
 */
export type RunRole = "calibration" | "evaluation";

export type IssueSeverity = "error" | "warning" | "info";

export interface DataIssue {
  severity: IssueSeverity;
  /** machine-readable code, e.g. "rssi-out-of-range", "duplicate-row" */
  code: string;
  /** human-readable German message */
  message: string;
  /** 1-based row numbers (first few) affected */
  rows?: number[];
  count?: number;
}

export type ImportFormat = "csv" | "json" | "indooro-jsonl" | "synthetic";

export interface ImportProvenance {
  fileName: string;
  format: ImportFormat;
  importedAt: string; // ISO
  /** SHA-256 hex of the raw file bytes (or of the generator config for synthetic data) */
  sha256: string;
  totalRows: number;
  acceptedRows: number;
  rejectedRows: number;
  /** every transformation applied to the raw data, in order, human readable */
  transformations: string[];
  issues: DataIssue[];
  /** column mapping used for CSV/JSON imports (target field -> source column) */
  columnMapping?: Record<string, string>;
  /** generator parameters if origin is synthetic */
  synthetic?: SyntheticScenarioConfig;
}

export interface MeasurementRun {
  id: string;
  campaignId: string;
  name: string;
  kind: RunKind;
  role: RunRole;
  origin: DataOrigin;
  deviceId?: string;
  notes?: string;
  createdAt: string;
  /** sorted ascending by t */
  samples: RssiSample[];
  /** sorted ascending by t */
  references: ReferencePoint[];
  provenance: ImportProvenance;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  /** ISO date (YYYY-MM-DD) of the measurement */
  date: string;
  market: string;
  device: string;
  conditions: string;
  notes: string;
  floorPlan: FloorPlan;
  beacons: Beacon[];
  /** campaign-wide path-loss model, used when a beacon has none */
  pathLoss: PathLossModel;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Synthetic data                                                      */
/* ------------------------------------------------------------------ */

export type SyntheticScenarioId =
  | "good-coverage"
  | "poor-coverage"
  | "high-noise"
  | "beacon-dropout"
  | "aisle-walk"
  | "jumping-between-beacons"
  | "miscalibrated"
  | "multipath";

export interface SyntheticScenarioConfig {
  scenario: SyntheticScenarioId;
  seed: number;
  /** true path-loss used to SIMULATE (unknown to the algorithms unless calibrated) */
  trueRssiAt1m: number;
  truePathLossExponent: number;
  /** log-normal shadowing std-dev (dB) */
  shadowingStdDb: number;
  /** advertising / sampling rate per beacon (Hz) */
  sampleRateHz: number;
  /** probability that a packet is lost */
  packetLossProb: number;
  /** additional parameters per scenario, documented in docs/SYNTHETIC_DATA.md */
  extra: Record<string, number | string | boolean>;
}

/* ------------------------------------------------------------------ */
/* Signal processing & positioning                                     */
/* ------------------------------------------------------------------ */

/**
 * trimmed-mean = mirrors the iOS app (PositioningPipeline.swift): last `window` samples,
 *                drop min and max when >= 5 samples, average the rest.
 * kalman       = scalar random-walk Kalman per beacon (BeaconMeasurementStore.swift uses Q=4.0, R=0.02
 *                in its own parametrisation – the lab exposes q/r explicitly).
 */
export type RssiFilterKind = "none" | "moving-average" | "ema" | "median" | "trimmed-mean" | "kalman";

export interface RssiFilterConfig {
  kind: RssiFilterKind;
  /** window size in samples (moving-average, median) */
  window: number;
  /** smoothing factor 0<alpha<=1 (ema) */
  alpha: number;
  /** kalman: process noise variance q (dB^2 per sample) and measurement noise variance r (dB^2) */
  kalmanQ: number;
  kalmanR: number;
  /** Hampel outlier rejection before smoothing */
  outlier: { enabled: boolean; window: number; k: number };
}

export type AlgorithmId =
  | "strongest-beacon"
  | "weighted-centroid"
  | "trilateration"
  | "knn-fingerprint";

export type TemporalFilterKind = "none" | "ema" | "kalman";

export interface TemporalFilterConfig {
  kind: TemporalFilterKind;
  /** ema smoothing factor */
  alpha: number;
  /** reject / clamp position jumps faster than this (m/s converted via scale); 0 = off */
  maxSpeedMps: number;
  /** constant-velocity Kalman: process noise accel std (m/s^2) and measurement std (m) */
  kalmanAccelStd: number;
  kalmanMeasStd: number;
}

export interface AlgorithmParams {
  /** weighted centroid: weight = (10^(rssi/20))^... see positioning/algorithms docs */
  weightExponent: number;
  /** minimum number of beacons required (algorithm specific lower bound applies) */
  minBeacons: number;
  /** ignore samples weaker than this (dBm) */
  rssiThreshold: number;
  /** use only the k strongest beacons (0 = all) */
  topK: number;
  /** kNN fingerprinting */
  knnK: number;
  /** RSSI value substituted for "beacon not heard" in fingerprint vectors (dBm) */
  knnMissingRssi: number;
  /** trilateration: Huber robust-loss threshold in metres (iOS uses 0.85) ; 0 = plain least squares */
  huberDeltaM: number;
  /** trilateration: clamp estimated distances to [min,max] metres (iOS clamps 0.35..11) */
  distanceClampMinM: number;
  distanceClampMaxM: number;
}

export interface PositioningConfig {
  algorithm: AlgorithmId;
  params: AlgorithmParams;
  rssiFilter: RssiFilterConfig;
  temporal: TemporalFilterConfig;
  /** estimation epoch every stepSec seconds */
  stepSec: number;
  /** aggregate RSSI over the last windowSec seconds per epoch */
  windowSec: number;
  /** a beacon not heard for longer than this is considered absent at an epoch */
  staleSec: number;
}

export type ReferenceMatching =
  /** only epochs within toleranceSec of a reference sample, or inside a stationary hold */
  | "hold-or-nearest"
  /** linear interpolation between consecutive reference samples (walk runs) – an ASSUMPTION */
  | "interpolate";

export interface EvaluationOptions {
  referenceMatching: ReferenceMatching;
  toleranceSec: number;
}

export interface PositionEstimate {
  t: number;
  /** null = algorithm could not produce a position (failure, never silently dropped) */
  position: Point | null;
  /** position before temporal filtering (null on failure) */
  rawPosition: Point | null;
  failureReason?: string;
  /** beacons and aggregated (filtered) RSSI used at this epoch */
  inputs: { beaconId: string; rssi: number }[];
  /** ground truth at t if available */
  truth: Point | null;
  /** error in layout units (null if no truth or failure) */
  errorUnits: number | null;
}

export interface ErrorMetrics {
  /** unit of all distance values below */
  unit: "m" | "LE";
  /** epochs where truth was available (denominator for availability) */
  epochsWithTruth: number;
  validEstimates: number;
  failedEstimates: number;
  /** failed / epochsWithTruth */
  failureRate: number;
  /** computed over valid estimates with truth (conditional view) */
  mean: number | null;
  median: number | null;
  rmse: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
  /** fraction of epochsWithTruth (failures count as "not within") – end-to-end view */
  within2: number | null;
  within3: number | null;
  within5: number | null;
}

export interface DynamicMetrics {
  unit: "m" | "LE";
  /** consecutive valid estimate pairs considered (dt <= gap) */
  pairs: number;
  /** pairs whose implied speed exceeds the threshold */
  jumps: number;
  jumpRate: number | null;
  jumpSpeedThreshold: number;
  meanStepDistance: number | null;
  /** estimated lag (s) that minimises mean error; null if not computable */
  lagSec: number | null;
  /** precision (spread around own centroid) for stationary holds */
  stationaryPrecision: number | null;
  /** bias (centroid -> truth) for stationary holds */
  stationaryBias: number | null;
}

export interface EvaluationResult {
  runId: string;
  runName: string;
  origin: DataOrigin;
  config: PositioningConfig;
  options: EvaluationOptions;
  /** stable hash of config+options+run sha256 for reproducibility */
  configHash: string;
  estimates: PositionEstimate[];
  metrics: ErrorMetrics;
  dynamic: DynamicMetrics;
  /** warnings that limit validity (uncalibrated model, unconfirmed scale, few samples...) */
  warnings: string[];
  computedAt: string;
}
