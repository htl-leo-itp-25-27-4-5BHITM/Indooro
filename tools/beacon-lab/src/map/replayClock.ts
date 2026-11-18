/**
 * Deterministic replay clock logic (no timers, no React). The Replay component feeds it frame deltas.
 * "Playback position" is milliseconds since the first epoch; epoch times are in seconds (data time base).
 */

export interface AdvanceResult {
  /** new playback position in ms, clamped to [0, durationMs] */
  posMs: number;
  /** true when the end was reached (playback should pause) */
  ended: boolean;
}

/** Advances the playback position by `deltaMs` of wall time at `speed`x. */
export function advance(posMs: number, deltaMs: number, speed: number, durationMs: number): AdvanceResult {
  const safeDelta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  const next = posMs + safeDelta * (speed > 0 ? speed : 0);
  if (next >= durationMs) return { posMs: Math.max(0, durationMs), ended: true };
  return { posMs: Math.max(0, next), ended: false };
}

/** Index of the last epoch with time <= t (binary search on ascending times). -1 if t is before the first epoch. */
export function epochIndexAtTime(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Epoch index shown at playback position `posMs` (always >= 0 for a non-empty series). */
export function epochIndexAt(times: number[], posMs: number): number {
  if (times.length === 0) return -1;
  const idx = epochIndexAtTime(times, times[0] + posMs / 1000);
  return Math.max(0, idx);
}

/** Playback position (ms) of the epoch with the given index. */
export function posOfEpoch(times: number[], index: number): number {
  if (times.length === 0) return 0;
  const i = Math.min(times.length - 1, Math.max(0, index));
  return (times[i] - times[0]) * 1000;
}

/** Step by whole epochs; result index is clamped. Returns the new index and position. */
export function stepEpoch(times: number[], currentIndex: number, delta: number): { index: number; posMs: number } {
  if (times.length === 0) return { index: -1, posMs: 0 };
  const index = Math.min(times.length - 1, Math.max(0, currentIndex + delta));
  return { index, posMs: posOfEpoch(times, index) };
}

export function durationMsOf(times: number[]): number {
  return times.length < 2 ? 0 : (times[times.length - 1] - times[0]) * 1000;
}

export const SPEEDS = [0.5, 1, 2, 5, 10] as const;

/**
 * Latest value per key within (t - windowSec, t] from time-sorted per-key series.
 * Used for "which beacons were heard in the last 2 s, with what RSSI".
 */
export function latestInWindow<T extends { t: number }>(series: T[], t: number, windowSec: number): T | null {
  let lo = 0;
  let hi = series.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (ans < 0) return null;
  return t - series[ans].t < windowSec ? series[ans] : null;
}
