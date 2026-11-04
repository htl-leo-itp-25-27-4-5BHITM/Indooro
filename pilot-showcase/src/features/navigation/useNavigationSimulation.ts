import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlannedRoute } from "../../domain/types";
import { buildRouteModel, routeSignature } from "./routeModel";
import {
  initialSim,
  nextStopSim,
  pauseSim,
  progressOf,
  resumeSim,
  seekSim,
  startSim,
  stepSim,
  type SimModel,
  type SimPhase,
  type SimState
} from "./simulationCore";

export type SimulationState = SimPhase;

export interface NavigationSimulation {
  state: SimulationState;
  /** Position in metres (fractional) + heading in degrees (0 = east), null before start. */
  position: { x: number; y: number; heading: number } | null;
  /** 0..1 along the whole route. */
  progress: number;
  activeStopIndex: number;
  reachedStopIds: ReadonlySet<string>;
  remainingMeters: number;
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  /** Jump to the next stop (skip animation). */
  nextStop(): void;
  /** Manually set progress 0..1 (scrubber / dragging). */
  seek(progress: number): void;
  /** Playback speed multiplier. */
  speed: number;
  setSpeed(speed: number): void;
  /** Selectable speeds (1×, 2×, 4×). */
  speedOptions: readonly number[];
  /** Number of stops reached so far. */
  reachedCount: number;
  /** Walked distance in metres along the smoothed route. */
  distance: number;
}

export const SPEED_OPTIONS = [1, 2, 4] as const;
const MAX_FRAME_MS = 100;

interface Store {
  sig: string;
  sim: SimState;
}

/**
 * rAF-driven walk along the smoothed route (~1.2 m/s × speed) with an automatic pause of
 * ~1.2 s at each stop. Resets when the route (its content signature) changes. The position is
 * SIMULATED and has nothing to do with real Bluetooth positioning.
 */
export function useNavigationSimulation(route: PlannedRoute | null): NavigationSimulation {
  const sig = routeSignature(route);
  const routeModel = useMemo(() => (route ? buildRouteModel(route) : null), [sig]);
  const model = useMemo<SimModel>(() => ({ length: routeModel?.length ?? 0, stopDistances: routeModel?.stopDistances ?? [] }), [routeModel]);

  const [store, setStore] = useState<Store>({ sig, sim: initialSim() });
  const [speed, setSpeedState] = useState<number>(1);

  // route changed → restart from the beginning, idle
  if (store.sig !== sig) setStore({ sig, sim: initialSim() });
  const sim = store.sig === sig ? store.sim : initialSim();

  const modelRef = useRef(model);
  const sigRef = useRef(sig);
  const speedRef = useRef(speed);
  modelRef.current = model;
  sigRef.current = sig;
  speedRef.current = speed;

  const apply = useCallback((fn: (s: SimState, m: SimModel) => SimState) => {
    setStore((prev) => {
      const base = prev.sig === sigRef.current ? prev.sim : initialSim();
      return { sig: sigRef.current, sim: fn(base, modelRef.current) };
    });
  }, []);

  const ticking = sim.phase === "running" || sim.phase === "arrived-at-stop";
  useEffect(() => {
    if (!ticking) return;
    let raf = 0;
    let last: number | null = null;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(MAX_FRAME_MS, now - last);
      last = now;
      if (dt > 0) apply((s, m) => stepSim(s, m, dt, speedRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ticking, apply]);

  const start = useCallback(() => apply((s) => startSim(s)), [apply]);
  const pause = useCallback(() => apply((s) => pauseSim(s)), [apply]);
  const resume = useCallback(() => apply((s) => resumeSim(s)), [apply]);
  const reset = useCallback(() => apply(() => initialSim()), [apply]);
  const nextStop = useCallback(() => apply((s, m) => nextStopSim(s, m)), [apply]);
  const seek = useCallback((p: number) => apply((s, m) => seekSim(s, m, p)), [apply]);
  const setSpeed = useCallback((v: number) => setSpeedState(v > 0 ? v : 1), []);

  const order = route?.order ?? [];
  const reachedStopIds = useMemo(
    () => new Set(order.slice(0, sim.reached).map((s) => s.id)),
    [sig, sim.reached]
  );

  const progress = progressOf(sim, model);
  const position = routeModel && sim.phase !== "idle" ? routeModel.geometry.pointAt(sim.distance) : null;

  return {
    state: sim.phase,
    position,
    progress,
    activeStopIndex: route && sim.reached < order.length ? sim.reached : -1,
    reachedStopIds,
    remainingMeters: route ? Math.max(0, route.totalMeters * (1 - progress)) : 0,
    start,
    pause,
    resume,
    reset,
    nextStop,
    seek,
    speed,
    setSpeed,
    speedOptions: SPEED_OPTIONS,
    reachedCount: sim.reached,
    distance: sim.distance
  };
}
