import type { PlannedRoute } from "../../domain/types";

export type SimulationState = "idle" | "running" | "paused" | "arrived-at-stop" | "finished";

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
}

/** Stub. Real implementation: requestAnimationFrame along route.path, pauses at each stop. */
export function useNavigationSimulation(route: PlannedRoute | null): NavigationSimulation {
  const noop = () => {};
  return {
    state: "idle",
    position: null,
    progress: 0,
    activeStopIndex: route && route.order.length ? 0 : -1,
    reachedStopIds: new Set(),
    remainingMeters: route?.totalMeters ?? 0,
    start: noop,
    pause: noop,
    resume: noop,
    reset: noop,
    nextStop: noop,
    seek: noop,
    speed: 1,
    setSpeed: noop
  };
}
