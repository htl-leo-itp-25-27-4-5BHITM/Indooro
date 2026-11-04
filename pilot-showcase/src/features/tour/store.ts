import { useSyncExternalStore } from "react";
import { initialTourState, tourReducer } from "./machine";
import type { TourAction, TourState } from "./machine";
import { STEPS } from "./steps";

/** Global tour store: the overlay (mounted once in App) and every entry point share it. */
let state: TourState = initialTourState;
const listeners = new Set<() => void>();

function dispatch(action: TourAction) {
  const next = tourReducer(state, action);
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

const count = STEPS.length;

export const tourStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  start: (at?: number) => dispatch({ type: "start", count, at }),
  stop: () => dispatch({ type: "stop" }),
  next: () => dispatch({ type: "next", count }),
  prev: () => dispatch({ type: "prev" }),
  goto: (index: number) => dispatch({ type: "goto", index, count }),
  togglePresentation: () => dispatch({ type: "togglePresentation" })
};

export function useTour(): TourState {
  return useSyncExternalStore(tourStore.subscribe, tourStore.get, () => initialTourState);
}
