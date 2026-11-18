/**
 * Pure stepping logic of the simulated walk (no React, no timers). The hook feeds it with
 * frame deltas. Walking speed 1.2 m/s × speed factor; automatic pause at each stop.
 */
export const WALK_SPEED_MPS = 1.2;
export const DWELL_MS = 1200;
const EPS = 1e-6;

export type SimPhase = "idle" | "running" | "paused" | "arrived-at-stop" | "finished";

export interface SimModel {
  /** Total route length in metres. */
  length: number;
  /** Arc length at which each stop is reached (non-decreasing). */
  stopDistances: readonly number[];
}

export interface SimState {
  phase: SimPhase;
  distance: number;
  /** Number of stops already reached. */
  reached: number;
  /** Remaining dwell time at the current stop (scaled-time ms). */
  dwellMs: number;
}

export const initialSim = (): SimState => ({ phase: "idle", distance: 0, reached: 0, dwellMs: 0 });

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function startSim(s: SimState): SimState {
  if (s.phase === "idle" || s.phase === "finished") return { phase: "running", distance: 0, reached: 0, dwellMs: 0 };
  if (s.phase === "paused") return resumeSim(s);
  return s;
}

export function pauseSim(s: SimState): SimState {
  return s.phase === "running" || s.phase === "arrived-at-stop" ? { ...s, phase: "paused" } : s;
}

export function resumeSim(s: SimState): SimState {
  if (s.phase === "idle" || s.phase === "finished") return startSim(s);
  if (s.phase !== "paused") return s;
  return { ...s, phase: s.dwellMs > 0 ? "arrived-at-stop" : "running" };
}

/** Walks `dtMs` of real time at `speed`×. */
export function stepSim(s: SimState, m: SimModel, dtMs: number, speed: number): SimState {
  const n = m.stopDistances.length;
  if (s.phase === "running") {
    const target = s.reached < n ? m.stopDistances[s.reached] : m.length;
    const next = s.distance + (WALK_SPEED_MPS * speed * dtMs) / 1000;
    if (next >= target - EPS) {
      if (s.reached < n) return { phase: "arrived-at-stop", distance: Math.max(s.distance, target), reached: s.reached + 1, dwellMs: DWELL_MS };
      return { ...s, phase: "finished", distance: m.length, dwellMs: 0 };
    }
    return { ...s, distance: next };
  }
  if (s.phase === "arrived-at-stop") {
    const dwell = s.dwellMs - dtMs * speed;
    if (dwell > 0) return { ...s, dwellMs: dwell };
    if (s.reached >= n && s.distance >= m.length - EPS) return { ...s, phase: "finished", dwellMs: 0 };
    return { ...s, phase: "running", dwellMs: 0 };
  }
  return s;
}

/** Jumps to the next stop (shows the arrival state), or to the end after the last stop. */
export function nextStopSim(s: SimState, m: SimModel): SimState {
  const n = m.stopDistances.length;
  if (s.reached < n) return { phase: "arrived-at-stop", distance: Math.max(s.distance, m.stopDistances[s.reached]), reached: s.reached + 1, dwellMs: DWELL_MS };
  if (s.distance < m.length - EPS) return { ...s, phase: "finished", distance: m.length, dwellMs: 0 };
  return s;
}

/** Manual position 0..1 (scrubber). A running walk keeps running from there; otherwise it pauses. */
export function seekSim(s: SimState, m: SimModel, progress: number): SimState {
  const p = clamp(progress, 0, 1);
  const distance = p * m.length;
  const reached = m.stopDistances.filter((d) => d <= distance + EPS).length;
  const done = p >= 1 - EPS && reached >= m.stopDistances.length;
  const phase: SimPhase = done ? "finished" : s.phase === "running" ? "running" : "paused";
  return { phase, distance, reached, dwellMs: 0 };
}

export const progressOf = (s: SimState, m: SimModel): number => (m.length > 0 ? clamp(s.distance / m.length, 0, 1) : s.phase === "finished" ? 1 : 0);
