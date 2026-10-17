/**
 * Web Worker for beacon coverage on large layouts. It only runs the pure coverage module, so it has no DOM dependency.
 * Protocol: request {requestId, gridSize, elements, radius, minBeacons} -> reply {requestId, result} or {requestId, error}.
 */
import { computeCoverage, type CoverageInput, type CoverageResult } from "./coverage";

export interface CoverageWorkerRequest extends CoverageInput {
  requestId: number;
  radius: number;
  minBeacons: number;
}

export type CoverageWorkerReply = { requestId: number; result: CoverageResult } | { requestId: number; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CoverageWorkerRequest>) => void) | null;
  postMessage: (reply: CoverageWorkerReply) => void;
};

scope.onmessage = (event: MessageEvent<CoverageWorkerRequest>) => {
  const { requestId, gridSize, elements, radius, minBeacons } = event.data;
  try {
    scope.postMessage({ requestId, result: computeCoverage({ gridSize, elements }, radius, minBeacons) });
  } catch (cause) {
    scope.postMessage({ requestId, error: cause instanceof Error ? cause.message : "Abdeckung konnte nicht berechnet werden." });
  }
};
