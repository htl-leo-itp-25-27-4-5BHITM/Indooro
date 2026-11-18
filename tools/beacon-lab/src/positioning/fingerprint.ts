import type { MeasurementRun, PositioningConfig } from "../core/types";
import type { Fingerprint } from "./algorithms";
import { LeakageError } from "./errors";
import { filterSamplesPerBeacon } from "./filters";
import { runHolds } from "./reference";
import { median } from "./stats";

/** A beacon needs at least this many samples inside a hold to enter the fingerprint (median of fewer is too noisy). */
export const MIN_SAMPLES_PER_BEACON_IN_HOLD = 3;

/**
 * One fingerprint per stationary hold of each CALIBRATION run:
 *   position = hold position,  rssi[beaconId] = MEDIAN of the (filtered) RSSI of that beacon within the hold.
 * Samples are filtered with cfg.rssiFilter first (same pre-processing as the evaluation path) and
 * samples weaker than params.rssiThreshold are ignored.
 * Throws LeakageError if any run is not a calibration run. Holds without any usable beacon are skipped.
 */
export function buildFingerprints(runs: readonly MeasurementRun[], cfg: PositioningConfig): Fingerprint[] {
  for (const r of runs) {
    if (r.role !== "calibration") {
      throw new LeakageError(`Lauf „${r.name}“ (${r.id}) hat die Rolle „${r.role}“ und darf nicht für Fingerprints verwendet werden.`);
    }
  }
  const out: Fingerprint[] = [];
  for (const run of runs) {
    const holds = runHolds(run);
    if (holds.length === 0) continue;
    const filtered = filterSamplesPerBeacon(run.samples, cfg.rssiFilter);
    for (const hold of holds) {
      const per = new Map<string, number[]>();
      for (const s of filtered) {
        if (s.t < hold.start || s.t > hold.end || s.rssi < cfg.params.rssiThreshold) continue;
        const arr = per.get(s.beaconId);
        if (arr) arr.push(s.rssi);
        else per.set(s.beaconId, [s.rssi]);
      }
      const rssi: Record<string, number> = {};
      for (const [id, vals] of per) {
        if (vals.length >= MIN_SAMPLES_PER_BEACON_IN_HOLD) rssi[id] = median(vals) as number;
      }
      if (Object.keys(rssi).length > 0) out.push({ position: { ...hold.position }, rssi, runId: run.id });
    }
  }
  return out;
}
