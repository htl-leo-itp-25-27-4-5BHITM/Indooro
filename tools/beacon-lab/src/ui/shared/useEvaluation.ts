import { useMemo } from "react";
import type { Campaign, EvaluationOptions, EvaluationResult, MeasurementRun, PositioningConfig } from "../../core/types";
import { runPositioning } from "../../positioning/pipeline";

export type EvaluationState = { result: EvaluationResult; error: null } | { result: null; error: string };

/** Runs the positioning pipeline synchronously (fast enough for typical runs) and catches leakage/other errors. */
export function evaluate(
  run: MeasurementRun,
  campaign: Campaign,
  config: PositioningConfig,
  options: EvaluationOptions,
  calibrationRuns: MeasurementRun[],
): EvaluationState {
  try {
    const needsFp = config.algorithm === "knn-fingerprint";
    return { result: runPositioning({ run, campaign, config, options, calibrationRuns: needsFp ? calibrationRuns : [] }), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export function useEvaluation(
  run: MeasurementRun | undefined,
  campaign: Campaign,
  config: PositioningConfig,
  options: EvaluationOptions,
  calibrationRuns: MeasurementRun[],
): EvaluationState | null {
  return useMemo(() => (run ? evaluate(run, campaign, config, options, calibrationRuns) : null), [run, campaign, config, options, calibrationRuns]);
}

/** Default reference matching per run kind. */
export function defaultOptionsFor(run: MeasurementRun | undefined, base: EvaluationOptions): EvaluationOptions {
  return run?.kind === "walk" ? { ...base, referenceMatching: "interpolate" } : { ...base, referenceMatching: "hold-or-nearest" };
}
