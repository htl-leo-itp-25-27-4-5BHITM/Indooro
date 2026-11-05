import type { Aggregation } from "../../../positioning/aggregate";
import type { BootstrapCI, MetricsWithCI, ProportionCI } from "../../../positioning/uncertainty";

export interface AggregationExportMeta {
  campaignName: string;
  condition: string;
  generatedAt: string;
}

const r6 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e6) / 1e6);

function ciJson(c: BootstrapCI) {
  return { estimate: r6(c.estimate), lo: r6(c.lo), hi: r6(c.hi), blocks: c.blocks, reason: c.reason };
}
function propJson(p: ProportionCI) {
  return { p: r6(p.p), lo: r6(p.lo), hi: r6(p.hi), successes: p.successes, n: p.n };
}
function metricsJson(m: MetricsWithCI) {
  return {
    unit: m.unit,
    blockDefinition: m.blockDefinition,
    blocks: m.blocks,
    epochsWithTruth: m.metrics.epochsWithTruth,
    validEstimates: m.metrics.validEstimates,
    failedEstimates: m.metrics.failedEstimates,
    mean: ciJson(m.mean),
    median: ciJson(m.median),
    p90: ciJson(m.p90),
    p95: ciJson(m.p95),
    within2: propJson(m.within2),
    within3: propJson(m.within3),
    within5: propJson(m.within5),
    failureRate: propJson(m.failureRate),
  };
}

export function aggregationToJson(agg: Aggregation, meta: AggregationExportMeta): string {
  return JSON.stringify(
    {
      schema: "indooro-positioning-lab/multi-run-statistics",
      generatedAt: meta.generatedAt,
      campaign: meta.campaignName,
      condition: meta.condition || null,
      synthetic: agg.synthetic,
      unit: agg.unit,
      method: {
        intervals: "Block-Bootstrap (Perzentilintervall) für Mittel/Median/P90/P95; Wilson-Intervall für Trefferquoten und Ausfallrate",
        seed: agg.seed,
        iterations: agg.iterations,
        level: agg.level,
        blockSec: agg.blockSec,
        primaryPooled: agg.primary === "run" ? "Läufe als Blöcke" : "Zeitblöcke innerhalb der Läufe",
        configHash: agg.configHash,
      },
      config: agg.config,
      exploratory: agg.exploratory,
      exploratoryReasons: agg.exploratoryReasons,
      warnings: agg.warnings,
      spread: agg.spread,
      pooledRunLevel: metricsJson(agg.pooledRunLevel),
      pooledBlockLevel: metricsJson(agg.pooledBlockLevel),
      runs: agg.perRun.map((r) => ({
        id: r.run.id,
        name: r.run.name,
        kind: r.run.kind,
        origin: r.run.origin,
        configHash: r.result.configHash,
        ...metricsJson(r.uncertainty),
        trackError: r.trackError
          ? { n: r.trackError.n, skippedStationary: r.trackError.skippedStationary, skippedNoDirection: r.trackError.skippedNoDirection, along: r.trackError.along, cross: r.trackError.cross }
          : null,
      })),
    },
    null,
    2,
  );
}

const csvText = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const c = (v: number | null | undefined) => (r6(v) === null ? "" : String(r6(v)));

/** One row per run plus pooled rows. Header repeats seed/iterations/configHash in every row (self-contained file). */
export function aggregationToCsv(agg: Aggregation): string {
  const head = [
    "scope", "name", "kind", "origin", "unit", "blocks", "epochs_with_truth", "valid", "failed",
    "failure_rate", "failure_rate_lo", "failure_rate_hi",
    "mean", "mean_lo", "mean_hi", "median", "median_lo", "median_hi", "p90", "p90_lo", "p90_hi", "p95", "p95_lo", "p95_hi",
    "within2", "within2_lo", "within2_hi", "within3", "within3_lo", "within3_hi", "within5", "within5_lo", "within5_hi",
    "seed", "iterations", "level", "config_hash",
  ];
  const row = (scope: string, name: string, kind: string, origin: string, m: MetricsWithCI): string =>
    [
      scope, csvText(name), kind, origin, m.unit, m.blocks, m.metrics.epochsWithTruth, m.metrics.validEstimates, m.metrics.failedEstimates,
      c(m.failureRate.p), c(m.failureRate.lo), c(m.failureRate.hi),
      c(m.mean.estimate), c(m.mean.lo), c(m.mean.hi), c(m.median.estimate), c(m.median.lo), c(m.median.hi),
      c(m.p90.estimate), c(m.p90.lo), c(m.p90.hi), c(m.p95.estimate), c(m.p95.lo), c(m.p95.hi),
      c(m.within2.p), c(m.within2.lo), c(m.within2.hi), c(m.within3.p), c(m.within3.lo), c(m.within3.hi), c(m.within5.p), c(m.within5.lo), c(m.within5.hi),
      agg.seed, agg.iterations, agg.level, agg.configHash,
    ].join(",");
  const lines = [head.join(",")];
  for (const r of agg.perRun) lines.push(row("run", r.run.name, r.run.kind, r.run.origin, r.uncertainty));
  lines.push(row("pooled-run-blocks", "gepoolt (Läufe als Blöcke)", "", agg.origins.join("+"), agg.pooledRunLevel));
  lines.push(row("pooled-time-blocks", "gepoolt (Zeitblöcke)", "", agg.origins.join("+"), agg.pooledBlockLevel));
  return lines.join("\n") + "\n";
}
