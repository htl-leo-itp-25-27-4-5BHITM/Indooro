/** Preset configurations, sweep parameters and comparison export – pure, tested. */
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../../../core/defaults";
import type { ErrorMetrics, EvaluationOptions, EvaluationResult, MeasurementRun, PositioningConfig } from "../../../core/types";
import type { ComparisonResult } from "../../../positioning/pipeline";

export interface NamedConfig {
  id: string;
  name: string;
  config: PositioningConfig;
}

export function cloneConfig(c: PositioningConfig): PositioningConfig {
  return JSON.parse(JSON.stringify(c)) as PositioningConfig;
}

export function baseConfig(): PositioningConfig {
  return cloneConfig(DEFAULT_POSITIONING_CONFIG);
}

/** Presets used by the comparison and replay pages. kNN is only offered when calibration runs exist. */
export function presetConfigs(hasCalibrationRuns: boolean): NamedConfig[] {
  const out: NamedConfig[] = [];
  const mk = (id: string, name: string, patch: (c: PositioningConfig) => void) => {
    const c = baseConfig();
    patch(c);
    out.push({ id, name, config: c });
  };
  mk("preset-strongest", "Strongest Beacon", (c) => {
    c.algorithm = "strongest-beacon";
  });
  mk("preset-wc", "Weighted Centroid", (c) => {
    c.algorithm = "weighted-centroid";
  });
  mk("preset-wc-ema-kalman", "Weighted Centroid + EMA-RSSI + Kalman-Position", (c) => {
    c.algorithm = "weighted-centroid";
    c.rssiFilter = { ...c.rssiFilter, kind: "ema", alpha: 0.3 };
    c.temporal = { ...c.temporal, kind: "kalman" };
  });
  mk("preset-trilat", "Trilateration", (c) => {
    c.algorithm = "trilateration";
  });
  if (hasCalibrationRuns) {
    mk("preset-knn", "kNN-Fingerprint", (c) => {
      c.algorithm = "knn-fingerprint";
    });
  }
  return out;
}

export function defaultEvalOptions(run: Pick<MeasurementRun, "kind"> | undefined): EvaluationOptions {
  return { ...DEFAULT_EVALUATION_OPTIONS, referenceMatching: run?.kind === "walk" ? "interpolate" : "hold-or-nearest" };
}

/* ------------------------------------------------------------------ */
/* parameter sweep                                                     */
/* ------------------------------------------------------------------ */

export type SweepParamId = "weightExponent" | "topK" | "rssiFilter.window" | "rssiFilter.alpha" | "temporal.alpha" | "temporal.maxSpeedMps" | "windowSec";

export interface SweepParam {
  id: SweepParamId;
  label: string;
  min: number;
  max: number;
  integer: boolean;
}

export const SWEEP_PARAMS: SweepParam[] = [
  { id: "weightExponent", label: "Gewichtsexponent g", min: 0, max: 5, integer: false },
  { id: "topK", label: "Top-K Beacons", min: 0, max: 50, integer: true },
  { id: "rssiFilter.window", label: "RSSI-Filter: Fenster (Samples)", min: 1, max: 100, integer: true },
  { id: "rssiFilter.alpha", label: "RSSI-Filter: α", min: 0.01, max: 1, integer: false },
  { id: "temporal.alpha", label: "Zeitfilter: α", min: 0.01, max: 1, integer: false },
  { id: "temporal.maxSpeedMps", label: "Max. Geschwindigkeit (m/s)", min: 0, max: 10, integer: false },
  { id: "windowSec", label: "Epochenfenster (s)", min: 0.1, max: 30, integer: false },
];

export const MAX_SWEEP_VALUES = 20;

export interface ParsedSweepValues {
  values: number[];
  errors: string[];
}

/** Parses "1, 2; 3 4" (separators: comma, semicolon, whitespace; decimals with a dot or a comma between digits). */
export function parseSweepValues(text: string, param: SweepParam): ParsedSweepValues {
  const errors: string[] = [];
  // a comma between two digits is a decimal comma only if no other separators are used ("0,5"); otherwise it separates values
  const normalized = /[;\s]/.test(text.trim()) ? text.replace(/(\d),(\d)/g, "$1.$2") : text;
  const tokens = normalized
    .split(/[\s;,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const values: number[] = [];
  for (const tok of tokens) {
    const v = Number(tok);
    if (!Number.isFinite(v)) {
      errors.push(`„${tok}“ ist keine Zahl`);
      continue;
    }
    if (v < param.min || v > param.max) {
      errors.push(`${tok} liegt außerhalb von ${param.min} … ${param.max}`);
      continue;
    }
    if (param.integer && !Number.isInteger(v)) {
      errors.push(`${tok} ist keine ganze Zahl`);
      continue;
    }
    if (!values.includes(v)) values.push(v);
  }
  if (values.length === 0 && errors.length === 0) errors.push("keine Werte angegeben");
  if (values.length > MAX_SWEEP_VALUES) {
    errors.push(`höchstens ${MAX_SWEEP_VALUES} Werte`);
    values.length = MAX_SWEEP_VALUES;
  }
  values.sort((a, b) => a - b);
  return { values, errors };
}

export function setSweepParam(config: PositioningConfig, id: SweepParamId, value: number): PositioningConfig {
  const c = cloneConfig(config);
  switch (id) {
    case "weightExponent":
      c.params.weightExponent = value;
      break;
    case "topK":
      c.params.topK = value;
      break;
    case "rssiFilter.window":
      c.rssiFilter.window = value;
      break;
    case "rssiFilter.alpha":
      c.rssiFilter.alpha = value;
      break;
    case "temporal.alpha":
      c.temporal.alpha = value;
      break;
    case "temporal.maxSpeedMps":
      c.temporal.maxSpeedMps = value;
      break;
    case "windowSec":
      c.windowSec = value;
      break;
  }
  return c;
}

export function getSweepParam(config: PositioningConfig, id: SweepParamId): number {
  switch (id) {
    case "weightExponent":
      return config.params.weightExponent;
    case "topK":
      return config.params.topK;
    case "rssiFilter.window":
      return config.rssiFilter.window;
    case "rssiFilter.alpha":
      return config.rssiFilter.alpha;
    case "temporal.alpha":
      return config.temporal.alpha;
    case "temporal.maxSpeedMps":
      return config.temporal.maxSpeedMps;
    case "windowSec":
      return config.windowSec;
  }
}

/** Hints when a sweep parameter has no effect on the chosen base configuration. */
export function sweepParamHint(config: PositioningConfig, id: SweepParamId): string | null {
  if (id === "weightExponent" && config.algorithm !== "weighted-centroid") return "Der Gewichtsexponent wirkt nur beim Weighted Centroid – die Kurve bleibt sonst flach.";
  if (id === "rssiFilter.window" && !["moving-average", "median", "trimmed-mean"].includes(config.rssiFilter.kind)) return "Das Fenster wirkt nur bei Mittel-, Median- und getrimmtem Mittel-Filter.";
  if (id === "rssiFilter.alpha" && config.rssiFilter.kind !== "ema") return "α wirkt hier nur beim EMA-RSSI-Filter.";
  if (id === "temporal.alpha" && config.temporal.kind !== "ema") return "α wirkt hier nur beim EMA-Zeitfilter.";
  return null;
}

export type SweepMetric = "median" | "p95" | "failureRate";

export const SWEEP_METRICS: { id: SweepMetric; label: string; unit: "dist" | "%" }[] = [
  { id: "median", label: "Median-Fehler", unit: "dist" },
  { id: "p95", label: "P95-Fehler", unit: "dist" },
  { id: "failureRate", label: "Ausfallrate", unit: "%" },
];

export function sweepMetricValue(m: ErrorMetrics, metric: SweepMetric): number | null {
  if (metric === "failureRate") return m.failureRate * 100;
  return metric === "median" ? m.median : m.p95;
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

export interface ComparisonExportInput {
  run: Pick<MeasurementRun, "id" | "name" | "origin" | "provenance">;
  names: string[];
  options: EvaluationOptions;
  comparison: ComparisonResult;
  generatedAt: string;
}

export function comparisonToJson(input: ComparisonExportInput): string {
  const { run, names, options, comparison, generatedAt } = input;
  return JSON.stringify(
    {
      schema: "indooro-positioning-lab/algorithm-comparison",
      generatedAt,
      run: { id: run.id, name: run.name, origin: run.origin, sha256: run.provenance.sha256 },
      options,
      commonEpochs: comparison.commonEpochs,
      note: "Fehlschläge sind in 'metrics' (Ausfallrate, within*) enthalten und nicht verworfen; 'metricsOnCommonEpochs' beschränkt auf Epochen, in denen alle Konfigurationen eine Position lieferten.",
      configurations: comparison.results.map((r: EvaluationResult, i) => ({
        name: names[i],
        configHash: r.configHash,
        config: r.config,
        metrics: r.metrics,
        dynamic: r.dynamic,
        warnings: r.warnings,
        metricsOnCommonEpochs: comparison.common[i],
      })),
    },
    null,
    2,
  );
}

const csvNum = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "" : String(Math.round(v * 1e6) / 1e6));
const csvText = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function comparisonToCsv(input: ComparisonExportInput): string {
  const { comparison, names } = input;
  const head = ["name", "config_hash", "scope", "unit", "epochs_with_truth", "valid", "failed", "failure_rate", "mean", "median", "rmse", "p90", "p95", "max", "within2", "within3", "within5", "jump_rate", "lag_sec"];
  const lines = [head.join(",")];
  comparison.results.forEach((r, i) => {
    const row = (scope: string, m: ErrorMetrics, withDyn: boolean) =>
      [
        csvText(names[i]), r.configHash, scope, m.unit, m.epochsWithTruth, m.validEstimates, m.failedEstimates, csvNum(m.failureRate),
        csvNum(m.mean), csvNum(m.median), csvNum(m.rmse), csvNum(m.p90), csvNum(m.p95), csvNum(m.max), csvNum(m.within2), csvNum(m.within3), csvNum(m.within5),
        withDyn ? csvNum(r.dynamic.jumpRate) : "", withDyn ? csvNum(r.dynamic.lagSec) : "",
      ].join(",");
    lines.push(row("all", r.metrics, true));
    lines.push(row(`common(n=${comparison.commonEpochs})`, comparison.common[i], false));
  });
  return lines.join("\n") + "\n";
}

/** Errors (display units) of valid estimates, for CDF / box plot. */
export function errorValues(result: EvaluationResult, toDisplay: (units: number) => number): number[] {
  const out: number[] = [];
  for (const e of result.estimates) if (e.errorUnits !== null && e.errorUnits !== undefined && Number.isFinite(e.errorUnits)) out.push(toDisplay(e.errorUnits));
  return out;
}
