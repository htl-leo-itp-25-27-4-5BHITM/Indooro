import { useSyncExternalStore } from "react";
import type { StoreDemo } from "./useStoreDemo";

/**
 * Read/write bridge to the live store demo, used by the guided tour to drive the demo
 * (switch market, add products, start navigation …) without prop drilling.
 * StoreDemo publishes its current state on every render.
 */
export type ViewMode = "3d" | "2d";

export interface DemoHandle extends StoreDemo {
  viewMode: ViewMode;
  setViewMode(mode: ViewMode): void;
}

let current: DemoHandle | null = null;
const listeners = new Set<() => void>();

export const demoBridge = {
  publish(handle: DemoHandle | null) {
    current = handle;
    listeners.forEach((l) => l());
  },
  get(): DemoHandle | null {
    return current;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
};

export function useDemoHandle(): DemoHandle | null {
  return useSyncExternalStore(demoBridge.subscribe, demoBridge.get, () => null);
}
