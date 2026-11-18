import type { EvaluationOptions, MapScale, PathLossModel, PositioningConfig } from "./types";

/**
 * Lab default path-loss model. NOT CALIBRATED.
 * -72 dBm @1 m and n = 2.8 mirror the current iOS app defaults
 * (StabilizedNavigationConfig.swift) so that uncalibrated lab results are comparable with the app.
 * Results computed with this model are always flagged as "unkalibriert".
 */
export const DEFAULT_PATH_LOSS: PathLossModel = {
  rssiAt1m: -72,
  pathLossExponent: 2.8,
  source: "default",
};

export const DEFAULT_POSITIONING_CONFIG: PositioningConfig = {
  algorithm: "weighted-centroid",
  params: {
    weightExponent: 1,
    minBeacons: 1,
    rssiThreshold: -100,
    topK: 0,
    knnK: 3,
    knnMissingRssi: -105,
    huberDeltaM: 0.85,
    distanceClampMinM: 0.35,
    distanceClampMaxM: 11,
  },
  rssiFilter: {
    kind: "none",
    window: 5,
    alpha: 0.3,
    kalmanQ: 1,
    kalmanR: 16,
    outlier: { enabled: false, window: 7, k: 3 },
  },
  temporal: {
    kind: "none",
    alpha: 0.3,
    maxSpeedMps: 0,
    kalmanAccelStd: 0.5,
    kalmanMeasStd: 3,
  },
  stepSec: 1,
  windowSec: 2,
  staleSec: 3,
};

export const DEFAULT_EVALUATION_OPTIONS: EvaluationOptions = {
  referenceMatching: "hold-or-nearest",
  toleranceSec: 1,
};

/** 1 m per layout unit is the documented Indooro convention – but unconfirmed until verified on site. */
export function defaultScale(): MapScale {
  return {
    metersPerUnit: 1,
    confirmed: false,
    note: "Indooro-Konvention „1 Zelle = 1 m“ (LAYOUT_CONVENTIONS.md) – vor Ort nicht bestätigt.",
  };
}
