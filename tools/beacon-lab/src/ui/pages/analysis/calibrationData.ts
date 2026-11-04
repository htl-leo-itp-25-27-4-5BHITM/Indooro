import type { Campaign, MeasurementRun, PathLossModel } from "../../../core/types";
import { distanceToRssi } from "../../../positioning/pathloss";
import { runHolds } from "../../../positioning/reference";

export interface DistanceRssiPair {
  beaconId: string;
  distanceM: number;
  rssi: number;
}

/**
 * (distance, RSSI) pairs exactly as calibrateFromRuns builds them: samples inside stationary holds, distance beacon–hold
 * position in metres (layout units × metersPerUnit), RSSI >= threshold, optional maximum distance. Used for the scatter plot only.
 */
export function calibrationPairs(
  runs: readonly MeasurementRun[],
  campaign: Campaign,
  rssiThreshold: number,
  maxDistanceM?: number | null,
): DistanceRssiPair[] {
  const mpu = campaign.floorPlan.scale.metersPerUnit;
  const maxD = maxDistanceM !== null && maxDistanceM !== undefined && Number.isFinite(maxDistanceM) && maxDistanceM > 0 ? maxDistanceM : Infinity;
  const beacons = new Map(campaign.beacons.map((b) => [b.id, b]));
  const out: DistanceRssiPair[] = [];
  for (const run of runs) {
    const holds = runHolds(run);
    for (const s of run.samples) {
      if (!Number.isFinite(s.t) || !Number.isFinite(s.rssi) || s.rssi < rssiThreshold) continue;
      const b = beacons.get(s.beaconId);
      if (!b) continue;
      const hold = holds.find((h) => s.t >= h.start && s.t <= h.end);
      if (!hold) continue;
      const d = Math.hypot(b.position.x - hold.position.x, b.position.y - hold.position.y) * mpu;
      if (d > maxD || !(d > 0)) continue;
      out.push({ beaconId: s.beaconId, distanceM: d, rssi: s.rssi });
    }
  }
  return out;
}

/** Points of the model curve RSSI(d) on a log-spaced distance grid. */
export function modelCurve(model: PathLossModel, minM: number, maxM: number, steps = 60): { x: number; y: number }[] {
  const lo = Math.max(0.1, minM);
  const hi = Math.max(lo * 1.01, maxM);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = lo * Math.pow(hi / lo, i / steps);
    pts.push({ x: d, y: distanceToRssi(d, model) });
  }
  return pts;
}

export const SOURCE_LABEL: Record<PathLossModel["source"], string> = {
  default: "unkalibriert (Standardwert)",
  fitted: "kalibriert (Fit)",
  manual: "manuell – ungeprüft",
};
