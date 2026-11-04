import type { EvaluationResult } from "../core/types";
import type { ReportInput } from "./reportModel";

/**
 * Machine-readable results: metadata, configuration and metrics of every evaluation.
 * Per-epoch estimates are omitted by default (can be large); pass `includeEstimates` to add them.
 */
export function buildResultsJson(input: ReportInput, opts: { includeEstimates?: boolean } = {}): string {
  const { campaign, runs, results } = input;
  const payload = {
    format: "indooro-positioning-lab-results/1",
    tool: { name: "Indooro Positioning Lab", version: input.toolVersion, gitCommit: input.gitCommit ?? null },
    generatedAt: input.generatedAt,
    hasSyntheticData: runs.some((r) => r.origin === "synthetic") || results.some((r) => r.origin === "synthetic"),
    campaign: {
      id: campaign.id,
      name: campaign.name,
      date: campaign.date,
      market: campaign.market,
      device: campaign.device,
      scale: campaign.floorPlan.scale,
      pathLoss: campaign.pathLoss,
      beacons: campaign.beacons.map((b) => ({ id: b.id, position: b.position, txPowerDbm: b.txPowerDbm ?? null, enabled: b.enabled })),
    },
    runs: runs.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      role: r.role,
      origin: r.origin,
      samples: r.samples.length,
      references: r.references.length,
      fileName: r.provenance.fileName,
      sha256: r.provenance.sha256,
      synthetic: r.provenance.synthetic ?? null,
    })),
    results: results.map((r) => ({
      runId: r.runId,
      runName: r.runName,
      origin: r.origin,
      configHash: r.configHash,
      config: r.config,
      options: r.options,
      metrics: r.metrics,
      dynamic: r.dynamic,
      warnings: r.warnings,
      computedAt: r.computedAt,
      ...(opts.includeEstimates ? { estimates: r.estimates } : {}),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per evaluation with all error and dynamic metrics (RFC 4180, comma separated, '.' decimals). */
export function resultsToCsv(results: EvaluationResult[]): string {
  const header = [
    "run", "origin", "algorithm", "unit", "epochs_with_truth", "valid", "failed", "failure_rate",
    "mean", "median", "rmse", "p90", "p95", "max", "within2", "within3", "within5",
    "pairs", "jumps", "jump_rate", "mean_step", "lag_sec", "stationary_precision", "stationary_bias", "config_hash",
  ];
  const lines = [header.join(",")];
  for (const r of results) {
    const m = r.metrics;
    const d = r.dynamic;
    lines.push(
      [
        r.runName, r.origin, r.config.algorithm, m.unit, m.epochsWithTruth, m.validEstimates, m.failedEstimates, m.failureRate,
        m.mean, m.median, m.rmse, m.p90, m.p95, m.max, m.within2, m.within3, m.within5,
        d.pairs, d.jumps, d.jumpRate, d.meanStepDistance, d.lagSec, d.stationaryPrecision, d.stationaryBias, r.configHash,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
