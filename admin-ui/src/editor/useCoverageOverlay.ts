import { useEffect, useMemo, useRef, useState } from "react";
import { clampRadius, computeCoverage, coverageRule, walkableCellCount, type CoverageResult } from "./coverage";
import type { CoverageWorkerReply, CoverageWorkerRequest } from "./coverage.worker";
import { COVERAGE_WORKER_THRESHOLD } from "./coverageView";
import type { LayoutElement } from "./model";

export interface CoverageOverlay {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  /** Radius in metres, always within the rule's minimum and maximum. */
  radius: number;
  setRadius: (value: number) => void;
  /** Last finished result; null while the overlay is off or the first worker result is pending. */
  result: CoverageResult | null;
  /** True while a worker request for the current input is still running. */
  busy: boolean;
}

interface WorkerQueue {
  instance: Worker | null;
  nextId: number;
  latestId: number;
  inFlight: boolean;
  pending: CoverageWorkerRequest | null;
}

type GridSize = { width: number; height: number };

const IDLE = { result: null as CoverageResult | null, busy: false };

function sendPending(state: WorkerQueue) {
  if (!state.instance || state.inFlight || !state.pending) return;
  state.instance.postMessage(state.pending);
  state.inFlight = true;
  state.pending = null;
}

function disposeWorker(state: WorkerQueue) {
  state.instance?.terminate();
  state.instance = null;
  state.inFlight = false;
  state.pending = null;
}

/**
 * Starts the coverage worker. At most one request is in flight; newer input replaces a queued request,
 * and replies for superseded requests are dropped.
 */
function createWorker(state: WorkerQueue, onResult: (result: CoverageResult) => void, onFailure: () => void): Worker {
  const instance = new Worker(new URL("./coverage.worker.ts", import.meta.url), { type: "module" });
  instance.onmessage = (event: MessageEvent<CoverageWorkerReply>) => {
    if (state.instance !== instance) return;
    const reply = event.data;
    state.inFlight = false;
    if (reply.requestId === state.latestId) {
      if ("error" in reply) {
        disposeWorker(state);
        onFailure();
        return;
      }
      onResult(reply.result);
    }
    sendPending(state);
  };
  instance.onerror = () => {
    if (state.instance !== instance) return;
    disposeWorker(state);
    onFailure();
  };
  return instance;
}

/**
 * View-only beacon coverage for the editor. The document is never changed; the result follows the given elements
 * (including a drag preview) live without saving.
 */
export function useCoverageOverlay(gridSize: GridSize, elements: LayoutElement[]): CoverageOverlay {
  const [enabled, setEnabled] = useState(false);
  const [requestedRadius, setRequestedRadius] = useState(coverageRule.radiusMeters);
  const radius = clampRadius(requestedRadius);
  const minBeacons = coverageRule.minBeaconsPerCell;

  const walkableCells = useMemo(() => (enabled ? walkableCellCount({ gridSize, elements }) : 0), [enabled, gridSize, elements]);
  const [workerFailed, setWorkerFailed] = useState(false);
  const useWorker = enabled && !workerFailed && walkableCells > COVERAGE_WORKER_THRESHOLD;

  const inline = useMemo(
    () => (enabled && !useWorker ? computeCoverage({ gridSize, elements }, radius, minBeacons) : null),
    [enabled, useWorker, gridSize, elements, radius, minBeacons],
  );

  const [worker, setWorker] = useState(IDLE);
  const queue = useRef<WorkerQueue>({ instance: null, nextId: 0, latestId: 0, inFlight: false, pending: null });

  useEffect(() => {
    const state = queue.current;
    if (!useWorker) {
      disposeWorker(state);
      setWorker(IDLE);
      return;
    }
    if (!state.instance) {
      try {
        state.instance = createWorker(state, (result) => setWorker({ result, busy: false }), () => setWorkerFailed(true));
      } catch {
        setWorkerFailed(true);
        return;
      }
    }
    state.nextId += 1;
    state.latestId = state.nextId;
    state.pending = { requestId: state.latestId, gridSize, elements, radius, minBeacons };
    setWorker((previous) => ({ ...previous, busy: true }));
    sendPending(state);
  }, [useWorker, gridSize, elements, radius, minBeacons]);

  useEffect(() => () => disposeWorker(queue.current), []);

  return {
    enabled,
    setEnabled,
    radius,
    setRadius: (value: number) => setRequestedRadius(clampRadius(value)),
    result: useWorker ? worker.result : inline,
    busy: useWorker && worker.busy,
  };
}
