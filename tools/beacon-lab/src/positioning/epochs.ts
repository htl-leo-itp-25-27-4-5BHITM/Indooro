import type { PositioningConfig, RssiSample } from "../core/types";
import type { EpochInput } from "./algorithms";

/** Safety cap against absurd step sizes (e.g. stepSec = 1e-6). */
export const MAX_EPOCHS = 500_000;

/**
 * Builds estimation epochs from (already filtered) samples.
 *
 * Epoch times: t_k = t0 + k * stepSec, t0 = first valid sample time, up to and including the last sample time.
 *
 * Per beacon and epoch t:
 *  - the beacon is ABSENT if it has no sample at all with time <= t or its last sample is older than
 *    `staleSec` (t - tLast > staleSec). Only samples with time <= t are used (causal).
 *  - rssiFilter.kind !== "none": the value is the LAST (filtered) sample value. The filter already did the
 *    smoothing causally; averaging filtered values again would smooth twice and add lag.
 *  - rssiFilter.kind === "none": the value is the MEAN of the raw samples in (t - windowSec, t].
 *    If that window is empty but the beacon is not stale, the last raw value is held.
 *
 * No rssiThreshold / topK here: those are applied by the algorithms. Epochs without any beacon are still
 * emitted (the algorithm reports a failure) so that gaps count against availability.
 * Observations are sorted by beaconId. Non-finite samples are ignored. Input is not mutated.
 */
export function buildEpochs(samples: readonly RssiSample[], cfg: PositioningConfig): EpochInput[] {
  const step = cfg.stepSec;
  if (!(Number.isFinite(step) && step > 0)) return [];
  const valid = samples.filter((s) => Number.isFinite(s.t) && Number.isFinite(s.rssi));
  if (valid.length === 0) return [];

  const byBeacon = new Map<string, { t: number; rssi: number }[]>();
  let t0 = Infinity;
  let tEnd = -Infinity;
  for (const s of valid) {
    if (s.t < t0) t0 = s.t;
    if (s.t > tEnd) tEnd = s.t;
    const arr = byBeacon.get(s.beaconId);
    if (arr) arr.push({ t: s.t, rssi: s.rssi });
    else byBeacon.set(s.beaconId, [{ t: s.t, rssi: s.rssi }]);
  }
  const beaconIds = [...byBeacon.keys()].sort();
  const series = beaconIds.map((id) => {
    const arr = byBeacon.get(id)!;
    // stable sort by time (input is normally sorted already)
    arr.sort((a, b) => a.t - b.t);
    return { id, arr, hi: 0, lo: 0 };
  });

  const window = Number.isFinite(cfg.windowSec) && cfg.windowSec > 0 ? cfg.windowSec : step;
  const stale = Number.isFinite(cfg.staleSec) && cfg.staleSec >= 0 ? cfg.staleSec : Infinity;
  const useLast = cfg.rssiFilter.kind !== "none";
  const eps = 1e-9;
  const count = Math.min(MAX_EPOCHS, Math.floor((tEnd - t0) / step + eps) + 1);

  const epochs: EpochInput[] = [];
  for (let k = 0; k < count; k++) {
    const t = t0 + k * step;
    const observations: { beaconId: string; rssi: number }[] = [];
    for (const s of series) {
      const { arr } = s;
      // hi = number of samples with time <= t (monotone pointer)
      while (s.hi < arr.length && arr[s.hi].t <= t + eps) s.hi++;
      if (s.hi === 0) continue;
      const last = arr[s.hi - 1];
      if (t - last.t > stale + eps) continue;
      if (useLast) {
        observations.push({ beaconId: s.id, rssi: last.rssi });
        continue;
      }
      while (s.lo < s.hi && arr[s.lo].t <= t - window + eps) s.lo++;
      if (s.lo >= s.hi) {
        observations.push({ beaconId: s.id, rssi: last.rssi });
      } else {
        let sum = 0;
        for (let i = s.lo; i < s.hi; i++) sum += arr[i].rssi;
        observations.push({ beaconId: s.id, rssi: sum / (s.hi - s.lo) });
      }
    }
    epochs.push({ t, observations });
  }
  return epochs;
}
