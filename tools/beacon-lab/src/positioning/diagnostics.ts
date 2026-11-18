/**
 * Beacon diagnostics: data-driven hints on badly placed / silent / wrongly registered beacons.
 *
 * All functions are pure and deterministic (no clock, no randomness, inputs never mutated).
 * They produce EVIDENCE, not verdicts: every finding carries the numbers it is based on, and anything
 * below the minimum sample size is reported as "zu wenige Daten" instead of a judgement.
 * See docs/BEACON_DIAGNOSTICS.md for formulas, thresholds and limits.
 */
import type {
  Beacon,
  Campaign,
  EvaluationOptions,
  MeasurementRun,
  PathLossModel,
  PositioningConfig,
} from "../core/types";
import { distanceToRssi } from "./pathloss";
import { runPositioning } from "./pipeline";
import { runHolds } from "./reference";
import { mean, median, std } from "./stats";

/* ------------------------------------------------------------------ */
/* Thresholds                                                          */
/* ------------------------------------------------------------------ */

export interface DiagnosticsThresholds {
  /** |mean residual| above this (dB) is reported as "systematische Abweichung". */
  biasThresholdDb: number;
  /** minimum number of residual samples per beacon for a judgement. */
  minSamples: number;
  /** minimum number of stationary holds per beacon for a judgement. */
  minHolds: number;
  /** residual analysis: ignore (beacon, hold) pairs farther than this (m) – far pairs are censored by the receiver. */
  maxDistanceM: number;
  /** ignore samples weaker than this (dBm), like the positioning pipeline. */
  rssiThreshold: number;
  /** a hold counts as "near" a beacon within this distance (m). */
  nearDistanceM: number;
  /** near hold is "silent" when its rate is below this fraction of the median near rate. */
  silentFraction: number;
  /** share of near holds that must be silent / deviating for a flag. */
  holdShare: number;
}

export const DEFAULT_THRESHOLDS: DiagnosticsThresholds = {
  biasThresholdDb: 6,
  minSamples: 30,
  minHolds: 3,
  maxDistanceM: 10,
  rssiThreshold: -100,
  nearDistanceM: 5,
  silentFraction: 0.1,
  holdShare: 0.5,
};

const LEAVE_ONE_OUT_NOTE =
  "Die Werte gelten nur für den gewählten Lauf, Algorithmus und diese Konfiguration (Filter, Parameter, Pfadverlustmodell). Mit anderen Einstellungen können sie anders ausfallen.";

function mpuOf(campaign: Campaign): number {
  const m = campaign.floorPlan.scale.metersPerUnit;
  return Number.isFinite(m) && m > 0 ? m : 1;
}

function modelFor(beacon: Beacon, campaign: Campaign, overrides?: Record<string, PathLossModel>): PathLossModel {
  return overrides?.[beacon.id] ?? beacon.pathLoss ?? campaign.pathLoss;
}

/* ------------------------------------------------------------------ */
/* a) leave-one-out                                                    */
/* ------------------------------------------------------------------ */

export interface LeaveOneOutRow {
  beaconId: string;
  /** Δ = (without beacon) − (baseline). Positive = the beacon helps. null if a side has no value. */
  deltaMedian: number | null;
  deltaP95: number | null;
  /** in fraction points (0.05 = 5 percentage points) */
  deltaFailureRate: number | null;
  /** number of epochs in which the beacon was an input at baseline (it is 0 without the beacon) */
  deltaEpochsHeard: number;
  epochsHeardShare: number | null;
  /** metrics without this beacon */
  medianWithout: number | null;
  p95Without: number | null;
  failureRateWithout: number;
}

export interface LeaveOneOutResult {
  runId: string;
  unit: "m" | "LE";
  baseline: { median: number | null; p95: number | null; failureRate: number; epochs: number; epochsWithTruth: number };
  rows: LeaveOneOutRow[];
  note: string;
  warnings: string[];
}

function delta(a: number | null, b: number | null): number | null {
  return a !== null && b !== null ? a - b : null;
}

/**
 * Baseline evaluation, then one re-run per enabled beacon with that beacon disabled (campaign is copied, never
 * mutated). Evaluation runs only: runPositioning enforces the leakage rules and throws LeakageError otherwise.
 * Errors are in the unit of the scale (m if confirmed, otherwise LE).
 */
export function beaconLeaveOneOut(
  run: MeasurementRun,
  campaign: Campaign,
  config: PositioningConfig,
  options: EvaluationOptions,
  calibrationRuns: MeasurementRun[] = [],
): LeaveOneOutResult {
  const base = runPositioning({ run, campaign, config, options, calibrationRuns });
  const heard = new Map<string, number>();
  for (const e of base.estimates) for (const i of e.inputs) heard.set(i.beaconId, (heard.get(i.beaconId) ?? 0) + 1);
  const epochs = base.estimates.length;

  const rows: LeaveOneOutRow[] = [];
  for (const b of campaign.beacons) {
    if (!b.enabled) continue;
    const copy: Campaign = { ...campaign, beacons: campaign.beacons.map((x) => (x.id === b.id ? { ...x, enabled: false } : x)) };
    const res = runPositioning({ run, campaign: copy, config, options, calibrationRuns });
    const n = heard.get(b.id) ?? 0;
    rows.push({
      beaconId: b.id,
      deltaMedian: delta(res.metrics.median, base.metrics.median),
      deltaP95: delta(res.metrics.p95, base.metrics.p95),
      deltaFailureRate: res.metrics.failureRate - base.metrics.failureRate,
      deltaEpochsHeard: n,
      epochsHeardShare: epochs > 0 ? n / epochs : null,
      medianWithout: res.metrics.median,
      p95Without: res.metrics.p95,
      failureRateWithout: res.metrics.failureRate,
    });
  }
  return {
    runId: run.id,
    unit: base.metrics.unit,
    baseline: {
      median: base.metrics.median,
      p95: base.metrics.p95,
      failureRate: base.metrics.failureRate,
      epochs,
      epochsWithTruth: base.metrics.epochsWithTruth,
    },
    rows,
    note: LEAVE_ONE_OUT_NOTE,
    warnings: base.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* b) residuals                                                        */
/* ------------------------------------------------------------------ */

export const BIAS_CAUSES: readonly string[] = [
  "Position im Layout falsch eingetragen",
  "Abschattung durch Regal, Kühlmöbel oder Montage (Wand, Metall)",
  "abweichende Sendeleistung (TX-Power) gegenüber dem Modell",
  "Beacon defekt oder Batterie schwach",
];

export interface HoldResidual {
  runId: string;
  holdIndex: number;
  distanceM: number;
  n: number;
  meanResidualDb: number;
}

export interface ResidualPoint {
  distanceM: number;
  residualDb: number;
  runId: string;
}

export interface BeaconResidual {
  beaconId: string;
  n: number;
  holds: number;
  /** mean(measured − model), dB. Positive = stronger than the model predicts. */
  biasDb: number | null;
  stdDb: number | null;
  perHold: HoldResidual[];
  /** share of holds whose own mean residual exceeds the threshold */
  deviatingHoldShare: number | null;
  /** bias minus the median bias of all beacons with enough data (removes a common model offset) */
  relativeBiasDb: number | null;
  /** |bias| > threshold */
  flaggedBias: boolean;
  /** >= holdShare of holds deviate by more than the threshold (position-dependent mismatch) */
  flaggedHoldInconsistent: boolean;
  enoughData: boolean;
  /** ready-to-plot points (decimation is up to the caller) */
  points: ResidualPoint[];
}

export interface ResidualsResult {
  beacons: BeaconResidual[];
  /** median bias over all beacons with enough data; a large value points at the MODEL, not at one beacon */
  commonOffsetDb: number | null;
  thresholds: DiagnosticsThresholds;
  causes: readonly string[];
  warnings: string[];
}

/**
 * Residuals measured − model for samples inside stationary holds (raw RSSI, no filter).
 *
 * `runs` may be calibration or evaluation runs. Nothing is fitted here, so there is no leakage; evaluation runs
 * are merely used to look at the data (diagnostic only – do NOT feed the findings back into a model fitted on
 * the same run). The model is `beacon.pathLoss ?? campaign.pathLoss` unless overridden via `models`.
 * Only (beacon, hold) pairs within `maxDistanceM` and samples >= `rssiThreshold` are used: far samples are
 * censored by the receiver sensitivity and would bias the mean upwards.
 */
export function beaconResiduals(
  runs: readonly MeasurementRun[],
  campaign: Campaign,
  models?: Record<string, PathLossModel>,
  thresholds: Partial<DiagnosticsThresholds> = {},
): ResidualsResult {
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const mpu = mpuOf(campaign);
  const warnings: string[] = [];
  const byId = new Map(campaign.beacons.map((b) => [b.id, b]));
  const acc = new Map<string, { values: number[]; points: ResidualPoint[]; holds: Map<string, { dist: number; values: number[]; runId: string; idx: number }> }>();
  for (const b of campaign.beacons) acc.set(b.id, { values: [], points: [], holds: new Map() });

  let holdCount = 0;
  for (const run of runs) {
    const holds = runHolds(run);
    holdCount += holds.length;
    // samples are sorted by t; linear scan per sample is fine for typical hold counts (<100)
    for (const s of run.samples) {
      if (!Number.isFinite(s.t) || !Number.isFinite(s.rssi) || s.rssi < th.rssiThreshold) continue;
      const b = byId.get(s.beaconId);
      if (!b || !Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)) continue;
      const hi = holds.findIndex((h) => s.t >= h.start && s.t <= h.end);
      if (hi < 0) continue;
      const h = holds[hi];
      const d = Math.hypot(b.position.x - h.position.x, b.position.y - h.position.y) * mpu;
      if (d > th.maxDistanceM) continue;
      const pred = distanceToRssi(Math.max(d, 0.1), modelFor(b, campaign, models));
      if (!Number.isFinite(pred)) continue;
      const r = s.rssi - pred;
      const a = acc.get(b.id)!;
      a.values.push(r);
      a.points.push({ distanceM: d, residualDb: r, runId: run.id });
      const key = `${run.id}|${hi}`;
      const hs = a.holds.get(key);
      if (hs) hs.values.push(r);
      else a.holds.set(key, { dist: d, values: [r], runId: run.id, idx: hi });
    }
  }
  if (holdCount === 0) warnings.push("Keine stationären Haltepunkte in den gewählten Läufen: Residuen können nicht berechnet werden.");

  const base = campaign.beacons.map((b): BeaconResidual => {
    const a = acc.get(b.id)!;
    const perHold: HoldResidual[] = [...a.holds.values()]
      .map((h) => ({ runId: h.runId, holdIndex: h.idx, distanceM: h.dist, n: h.values.length, meanResidualDb: mean(h.values) as number }))
      .sort((x, y) => x.runId.localeCompare(y.runId) || x.holdIndex - y.holdIndex);
    const bias = mean(a.values);
    const dev = perHold.filter((h) => Math.abs(h.meanResidualDb) > th.biasThresholdDb).length;
    const enough = a.values.length >= th.minSamples && perHold.length >= th.minHolds;
    return {
      beaconId: b.id,
      n: a.values.length,
      holds: perHold.length,
      biasDb: bias,
      stdDb: std(a.values),
      perHold,
      deviatingHoldShare: perHold.length > 0 ? dev / perHold.length : null,
      relativeBiasDb: null,
      flaggedBias: enough && bias !== null && Math.abs(bias) > th.biasThresholdDb,
      flaggedHoldInconsistent: enough && perHold.length > 0 && dev / perHold.length >= th.holdShare,
      enoughData: enough,
      points: a.points,
    };
  });
  const commonOffset = median(base.filter((r) => r.enoughData && r.biasDb !== null).map((r) => r.biasDb as number));
  // A large common offset is a model problem: judge position dependence relative to it, not to the (wrong) model.
  const centre = commonOffset !== null && Math.abs(commonOffset) > th.biasThresholdDb ? commonOffset : 0;
  const beacons = base.map((r) => {
    const dev = r.perHold.filter((h) => Math.abs(h.meanResidualDb - centre) > th.biasThresholdDb).length;
    return {
      ...r,
      relativeBiasDb: r.biasDb !== null && commonOffset !== null ? r.biasDb - commonOffset : null,
      deviatingHoldShare: r.perHold.length > 0 ? dev / r.perHold.length : null,
      flaggedHoldInconsistent: r.enoughData && r.perHold.length > 0 && dev / r.perHold.length >= th.holdShare,
    };
  });
  if (commonOffset !== null && Math.abs(commonOffset) > th.biasThresholdDb) {
    warnings.push(
      `Alle Beacons weichen im Median um ${commonOffset.toFixed(1)} dB vom Modell ab: Das spricht eher für ein unpassendes Pfadverlustmodell (z. B. unkalibrierte Standardwerte) als für einzelne Beacons. Erst kalibrieren, dann Einzelabweichungen deuten.`,
    );
  }
  if (campaign.pathLoss.source === "default") {
    warnings.push("Das Kampagnenmodell ist unkalibriert (Standardwerte): Bias-Werte sind nur relativ zwischen Beacons aussagekräftig.");
  }
  return { beacons, commonOffsetDb: commonOffset, thresholds: th, causes: BIAS_CAUSES, warnings };
}

/* ------------------------------------------------------------------ */
/* c) reception                                                        */
/* ------------------------------------------------------------------ */

export interface ReceptionCell {
  runId: string;
  holdIndex: number;
  distanceM: number;
  durationSec: number;
  count: number;
  /** samples per second */
  rate: number;
  near: boolean;
  silent: boolean;
}

export interface BeaconReception {
  beaconId: string;
  cells: ReceptionCell[];
  nearHolds: number;
  silentNearHolds: number;
  totalSamples: number;
  /** flagged "nicht empfangen obwohl nah" */
  silentWhileNear: boolean;
  enoughData: boolean;
}

export interface UnknownBeacon {
  id: string;
  samples: number;
}

export interface ReceptionResult {
  beacons: BeaconReception[];
  /** median samples/s over all (beacon, hold) pairs within nearDistanceM; null if fewer than 3 such pairs */
  medianNearRate: number | null;
  /** ids heard in the runs that the campaign does not know (wrong ID mapping? other venue?) */
  unknown: UnknownBeacon[];
  thresholds: DiagnosticsThresholds;
  warnings: string[];
}

/**
 * Reception rate per beacon and hold, compared with the median near-rate (same idea as the censoring check in
 * pathloss.detectCensoring). A beacon within `nearDistanceM` of at least 2 holds that is heard at < 10 % of the
 * median near rate in at least half of them is flagged. Uses ALL samples (no RSSI threshold): a sample is
 * "heard" if it was recorded.
 */
export function beaconReception(
  runsIn: MeasurementRun | readonly MeasurementRun[],
  campaign: Campaign,
  thresholds: Partial<DiagnosticsThresholds> = {},
): ReceptionResult {
  const runs = Array.isArray(runsIn) ? (runsIn as readonly MeasurementRun[]) : [runsIn as MeasurementRun];
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const mpu = mpuOf(campaign);
  const warnings: string[] = [];
  const known = new Set(campaign.beacons.map((b) => b.id));
  const cells = new Map<string, ReceptionCell[]>();
  for (const b of campaign.beacons) cells.set(b.id, []);
  const totals = new Map<string, number>();
  const unknown = new Map<string, number>();
  let holdCount = 0;

  for (const run of runs) {
    const holds = runHolds(run);
    holdCount += holds.length;
    const counts = new Map<string, number>(); // `${holdIdx}|${beaconId}`
    for (const s of run.samples) {
      if (!known.has(s.beaconId)) {
        unknown.set(s.beaconId, (unknown.get(s.beaconId) ?? 0) + 1);
        continue;
      }
      totals.set(s.beaconId, (totals.get(s.beaconId) ?? 0) + 1);
      if (!Number.isFinite(s.t)) continue;
      const hi = holds.findIndex((h) => s.t >= h.start && s.t <= h.end);
      if (hi >= 0) counts.set(`${hi}|${s.beaconId}`, (counts.get(`${hi}|${s.beaconId}`) ?? 0) + 1);
    }
    holds.forEach((h, hi) => {
      const dur = h.end - h.start;
      if (!(dur > 0)) return;
      for (const b of campaign.beacons) {
        if (!Number.isFinite(b.position.x) || !Number.isFinite(b.position.y)) continue;
        const d = Math.hypot(b.position.x - h.position.x, b.position.y - h.position.y) * mpu;
        const count = counts.get(`${hi}|${b.id}`) ?? 0;
        cells.get(b.id)!.push({ runId: run.id, holdIndex: hi, distanceM: d, durationSec: dur, count, rate: count / dur, near: d <= th.nearDistanceM, silent: false });
      }
    });
  }
  if (holdCount === 0) warnings.push("Keine stationären Haltepunkte in den gewählten Läufen: Empfangsraten je Haltepunkt nicht berechenbar.");

  const nearRates = [...cells.values()].flat().filter((c) => c.near).map((c) => c.rate);
  const ref = nearRates.length >= 3 ? median(nearRates) : null;
  const beacons = campaign.beacons.map((b): BeaconReception => {
    const cs = (cells.get(b.id) ?? []).map((c) => ({ ...c, silent: ref !== null && ref > 0 && c.near && c.rate < th.silentFraction * ref }));
    const near = cs.filter((c) => c.near);
    const silentNear = near.filter((c) => c.silent).length;
    const enough = ref !== null && ref > 0 && near.length >= 2;
    return {
      beaconId: b.id,
      cells: cs,
      nearHolds: near.length,
      silentNearHolds: silentNear,
      totalSamples: totals.get(b.id) ?? 0,
      silentWhileNear: enough && silentNear / near.length >= th.holdShare,
      enoughData: enough,
    };
  });
  if (ref === null && holdCount > 0) warnings.push(`Weniger als 3 Beacon-Haltepunkt-Paare innerhalb von ${th.nearDistanceM} m: kein Referenz-Empfang bestimmbar.`);
  return {
    beacons,
    medianNearRate: ref,
    unknown: [...unknown.entries()].map(([id, samples]) => ({ id, samples })).sort((a, b) => b.samples - a.samples || a.id.localeCompare(b.id)),
    thresholds: th,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* d) summary                                                          */
/* ------------------------------------------------------------------ */

export type FindingSeverity = "info" | "warning";
export type FindingCode =
  | "residual-bias"
  | "residual-common-offset"
  | "residual-position-dependent"
  | "silent-while-near"
  | "leave-one-out-harmful"
  | "leave-one-out-critical"
  | "insufficient-data"
  | "disabled";

export interface BeaconFinding {
  code: FindingCode;
  severity: FindingSeverity;
  /** German, neutral wording – a hint, not a verdict */
  text: string;
  evidence: Record<string, number | string>;
}

export interface BeaconHealth {
  beaconId: string;
  /** highest severity among findings; null = no finding with sufficient data */
  severity: FindingSeverity | null;
  /** false = "zu wenige Daten" (no judgement possible from residuals/reception) */
  dataSufficient: boolean;
  findings: BeaconFinding[];
}

export interface HealthSummary {
  beacons: BeaconHealth[];
  unknown: UnknownBeacon[];
  warnings: string[];
}

const de = (v: number, digits = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Relative loss of leave-one-out thresholds. */
const LOO_HARMFUL_REL = 0.05;
const LOO_CRITICAL_P95_REL = 0.2;
const LOO_CRITICAL_FAIL_PP = 0.05;
const LOO_MIN_EPOCHS = 100;

/**
 * Combines residuals, reception and (optional) leave-one-out into per-beacon findings. No finding without
 * evidence; beacons below the minimum sample size get "zu wenige Daten" instead of a judgement.
 */
export function summarizeBeaconHealth(args: {
  campaign: Campaign;
  residuals: ResidualsResult;
  reception: ReceptionResult;
  leaveOneOut?: LeaveOneOutResult | null;
}): HealthSummary {
  const { campaign, residuals, reception, leaveOneOut } = args;
  const th = residuals.thresholds;
  const resById = new Map(residuals.beacons.map((r) => [r.beaconId, r]));
  const recById = new Map(reception.beacons.map((r) => [r.beaconId, r]));
  const looById = new Map((leaveOneOut?.rows ?? []).map((r) => [r.beaconId, r]));
  const causes = residuals.causes.join("; ");

  const beacons = campaign.beacons.map((b): BeaconHealth => {
    const findings: BeaconFinding[] = [];
    if (!b.enabled) {
      findings.push({ code: "disabled", severity: "info", text: "Beacon ist in der Kampagne deaktiviert und wird von den Verfahren nicht genutzt.", evidence: {} });
    }
    const res = resById.get(b.id);
    const rec = recById.get(b.id);
    const resOk = !!res?.enoughData;
    const recOk = !!rec?.enoughData;

    if (res && resOk && res.biasDb !== null) {
      const common = residuals.commonOffsetDb;
      const commonLarge = common !== null && Math.abs(common) > th.biasThresholdDb;
      if (res.flaggedBias) {
        const relBig = res.relativeBiasDb !== null && Math.abs(res.relativeBiasDb) > th.biasThresholdDb;
        if (relBig || !commonLarge) {
          findings.push({
            code: "residual-bias",
            severity: "warning",
            text: `Systematische Abweichung: gemessener RSSI liegt im Mittel ${de(res.biasDb)} dB ${res.biasDb > 0 ? "über" : "unter"} dem Modell (σ ${de(res.stdDb ?? NaN)} dB, n = ${res.n}, ${res.holds} Haltepunkte). Mögliche Ursachen (ohne Gewähr): ${causes}.`,
            evidence: { biasDb: res.biasDb, stdDb: res.stdDb ?? "–", n: res.n, holds: res.holds, relativeBiasDb: res.relativeBiasDb ?? "–" },
          });
        } else {
          findings.push({
            code: "residual-common-offset",
            severity: "info",
            text: `Abweichung ${de(res.biasDb)} dB vom Modell, aber fast alle Beacons weichen ähnlich ab (Median ${de(common ?? NaN)} dB): wahrscheinlich ein Modellproblem, kein Einzelbeacon. Modell kalibrieren und erneut prüfen.`,
            evidence: { biasDb: res.biasDb, commonOffsetDb: common ?? "–", relativeBiasDb: res.relativeBiasDb ?? "–" },
          });
        }
      }
      if (res.flaggedHoldInconsistent && res.deviatingHoldShare !== null) {
        findings.push({
          code: "residual-position-dependent",
          severity: "warning",
          text: `Standortabhängige Abweichung: an ${Math.round(res.deviatingHoldShare * res.holds)} von ${res.holds} Haltepunkten weicht der mittlere RSSI um mehr als ${th.biasThresholdDb} dB vom Modell ab (teils mit wechselndem Vorzeichen möglich). Das passt zu einer abweichend eingetragenen Position oder Abschattung; es ist kein Beweis.`,
          evidence: { deviatingHolds: Math.round(res.deviatingHoldShare * res.holds), holds: res.holds, thresholdDb: th.biasThresholdDb },
        });
      }
    }
    if (rec && recOk && rec.silentWhileNear) {
      findings.push({
        code: "silent-while-near",
        severity: "warning",
        text: `Nicht empfangen obwohl nah: an ${rec.silentNearHolds} von ${rec.nearHolds} Haltepunkten innerhalb von ${th.nearDistanceM} m kam weniger als ${Math.round(th.silentFraction * 100)} % der üblichen Empfangsrate an (Median ${de(reception.medianNearRate ?? NaN, 2)} Samples/s). Mögliche Ursachen: Batterie leer, Beacon aus, falsche ID-Zuordnung, Abschirmung.`,
        evidence: { silentNearHolds: rec.silentNearHolds, nearHolds: rec.nearHolds, medianNearRate: reception.medianNearRate ?? "–", totalSamples: rec.totalSamples },
      });
    }
    const loo = looById.get(b.id);
    if (loo && leaveOneOut && leaveOneOut.baseline.epochsWithTruth >= LOO_MIN_EPOCHS) {
      const bm = leaveOneOut.baseline.median;
      const bp = leaveOneOut.baseline.p95;
      const u = leaveOneOut.unit;
      if (bm !== null && loo.deltaMedian !== null && bm > 0 && loo.deltaMedian < -LOO_HARMFUL_REL * bm) {
        findings.push({
          code: "leave-one-out-harmful",
          severity: "info",
          text: `Ohne diesen Beacon sinkt der Median-Fehler um ${de(-loo.deltaMedian, 2)} ${u} (${de((-loo.deltaMedian / bm) * 100, 0)} %). Gilt nur für diesen Lauf und diesen Algorithmus – kein Beleg für einen Defekt.`,
          evidence: { deltaMedian: loo.deltaMedian, baselineMedian: bm, unit: u },
        });
      } else if (
        (bp !== null && loo.deltaP95 !== null && bp > 0 && loo.deltaP95 > LOO_CRITICAL_P95_REL * bp) ||
        (loo.deltaFailureRate !== null && loo.deltaFailureRate >= LOO_CRITICAL_FAIL_PP)
      ) {
        findings.push({
          code: "leave-one-out-critical",
          severity: "info",
          text: `Kritisch für die Abdeckung: ohne diesen Beacon steigt P95 um ${de(loo.deltaP95 ?? NaN, 2)} ${u} bzw. die Ausfallrate um ${de((loo.deltaFailureRate ?? 0) * 100, 1)} Prozentpunkte. Hier fehlt Redundanz; ein Ausfall würde spürbar.`,
          evidence: { deltaP95: loo.deltaP95 ?? "–", deltaFailureRate: loo.deltaFailureRate ?? "–", unit: u },
        });
      }
    }

    const dataSufficient = resOk || recOk;
    if (!dataSufficient && b.enabled) {
      findings.push({
        code: "insufficient-data",
        severity: "info",
        text: `Zu wenige Daten für eine Aussage (n = ${res?.n ?? 0} Samples, ${res?.holds ?? 0} Haltepunkte im Bereich ≤ ${th.maxDistanceM} m; Mindestwerte: ${th.minSamples} Samples, ${th.minHolds} Haltepunkte).`,
        evidence: { n: res?.n ?? 0, holds: res?.holds ?? 0, minSamples: th.minSamples, minHolds: th.minHolds },
      });
    }
    const severity: FindingSeverity | null = findings.some((f) => f.severity === "warning") ? "warning" : findings.some((f) => f.code !== "disabled" && f.code !== "insufficient-data") ? "info" : null;
    return { beaconId: b.id, severity, dataSufficient, findings };
  });

  const warnings = [...residuals.warnings, ...reception.warnings];
  if (reception.unknown.length > 0) {
    warnings.push(`${reception.unknown.length} Beacon-ID(s) in den Läufen sind in der Kampagne unbekannt: ${reception.unknown.slice(0, 5).map((u) => u.id).join(", ")}${reception.unknown.length > 5 ? " …" : ""}. Falsche ID-Zuordnung oder fremde Beacons?`);
  }
  return { beacons, unknown: reception.unknown, warnings };
}
