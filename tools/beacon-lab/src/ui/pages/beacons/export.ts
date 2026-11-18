import type { Campaign } from "../../../core/types";
import type { BeaconHealth, HealthSummary, LeaveOneOutResult, ReceptionResult, ResidualsResult } from "../../../positioning/diagnostics";

export interface DiagnosticsBundle {
  campaign: Campaign;
  health: HealthSummary;
  residuals: ResidualsResult;
  reception: ReceptionResult;
  leaveOneOut: LeaveOneOutResult | null;
  /** description of the path-loss model used (source, A, n) */
  modelNote: string;
  analysisRunIds: string[];
  evaluationRunId: string | null;
  generatedAt: string;
  synthetic: boolean;
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per beacon, machine readable (dot decimals, empty = not available). */
export function diagnosticsToCsv(b: DiagnosticsBundle): string {
  const unit = b.leaveOneOut?.unit ?? "";
  const head = [
    "beacon_id", "x_le", "y_le", "enabled", "n_samples", "holds", "bias_db", "std_db", "relative_bias_db",
    "near_holds", "silent_near_holds", "total_samples", `delta_median_${unit || "einheit"}`, `delta_p95_${unit || "einheit"}`,
    "delta_failure_rate", "epochs_heard", "severity", "data_sufficient", "findings",
  ];
  const lines = [head.join(",")];
  for (const beacon of b.campaign.beacons) {
    const r = b.residuals.beacons.find((x) => x.beaconId === beacon.id);
    const c = b.reception.beacons.find((x) => x.beaconId === beacon.id);
    const l = b.leaveOneOut?.rows.find((x) => x.beaconId === beacon.id);
    const h = b.health.beacons.find((x) => x.beaconId === beacon.id) as BeaconHealth | undefined;
    lines.push(
      [
        beacon.id, beacon.position.x, beacon.position.y, beacon.enabled, r?.n, r?.holds, r?.biasDb, r?.stdDb, r?.relativeBiasDb,
        c?.nearHolds, c?.silentNearHolds, c?.totalSamples, l?.deltaMedian, l?.deltaP95, l?.deltaFailureRate, l?.deltaEpochsHeard,
        h?.severity ?? "", h?.dataSufficient, h?.findings.map((f) => f.text).join(" | "),
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

/** Full result incl. assumptions, so an export can be read without the app. */
export function diagnosticsToJson(b: DiagnosticsBundle): string {
  const { campaign, ...rest } = b;
  const slim = {
    schema: "indooro-positioning-lab/beacon-diagnostics",
    schemaVersion: 1,
    campaign: { id: campaign.id, name: campaign.name, scale: campaign.floorPlan.scale },
    ...rest,
    residuals: {
      ...rest.residuals,
      beacons: rest.residuals.beacons.map(({ points: _points, ...keep }) => keep),
    },
    assumptions: [
      b.modelNote,
      "Residuen = gemessener RSSI − Modell-RSSI in stationären Haltepunkten; nur Hinweise, keine Urteile.",
      b.leaveOneOut?.note ?? "Kein Leave-one-out berechnet.",
      b.synthetic ? "Synthetische Daten: Ergebnisse gelten nur für die Simulation." : "",
    ].filter(Boolean),
  };
  return JSON.stringify(slim, null, 2);
}
