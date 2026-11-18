import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_PATH_LOSS, DEFAULT_POSITIONING_CONFIG, defaultScale } from "../core/defaults";
import type { Campaign, DataOrigin, ErrorMetrics, EvaluationResult, MeasurementRun } from "../core/types";
import type { ReportInput } from "./reportModel";

/** Small deterministic fixtures for report tests (also usable in stories / manual checks). */
export function makeCampaign(over: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    name: "Testmarkt Pilot",
    description: "Pilotmessung",
    date: "2026-11-20",
    market: "Fiktiver Markt",
    device: "iPhone 15",
    conditions: "leer, vormittags",
    notes: "",
    floorPlan: { id: "fp", name: "EG", width: 40, height: 25, elements: [], scale: defaultScale(), origin: "real", source: "layout.json" },
    beacons: [
      { id: "B1", label: "Eingang", position: { x: 2, y: 3 }, txPowerDbm: -59, enabled: true },
      { id: "B2", position: { x: 20, y: 3 }, enabled: true },
    ],
    pathLoss: { ...DEFAULT_PATH_LOSS },
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...over,
  };
}

export function makeRun(id: string, origin: DataOrigin = "real", over: Partial<MeasurementRun> = {}): MeasurementRun {
  return {
    id,
    campaignId: "c1",
    name: `Lauf ${id}`,
    kind: "stationary",
    role: "evaluation",
    origin,
    deviceId: "dev-1",
    createdAt: "2026-11-20T10:00:00Z",
    samples: [],
    references: [{ t: 0, position: { x: 1, y: 1 } }],
    provenance: {
      fileName: `${id}.csv`,
      format: origin === "synthetic" ? "synthetic" : "csv",
      importedAt: "2026-11-20T10:05:00Z",
      sha256: "ab".repeat(32),
      totalRows: 100,
      acceptedRows: 98,
      rejectedRows: 2,
      transformations: ["Zeitstempel relativ zum Laufbeginn"],
      issues: [{ severity: "warning", code: "duplicate-row", message: "Doppelte Zeilen verworfen", rows: [5, 9], count: 2 }],
      ...(origin === "synthetic"
        ? { synthetic: { scenario: "good-coverage" as const, seed: 4242, trueRssiAt1m: -60, truePathLossExponent: 2.2, shadowingStdDb: 3, sampleRateHz: 2, packetLossProb: 0.05, extra: {} } }
        : {}),
    },
    ...over,
  };
}

export function makeMetrics(over: Partial<ErrorMetrics> = {}): ErrorMetrics {
  return {
    unit: "LE",
    epochsWithTruth: 120,
    validEstimates: 114,
    failedEstimates: 6,
    failureRate: 0.05,
    mean: 2.3456,
    median: 2.1,
    rmse: 2.7777,
    p90: 3.9,
    p95: 4.6,
    max: 7.1234,
    within2: 0.4,
    within3: 0.7,
    within5: 0.9,
    ...over,
  };
}

export function makeResult(runId: string, origin: DataOrigin = "real", over: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    runId,
    runName: `Lauf ${runId}`,
    origin,
    config: structuredClone(DEFAULT_POSITIONING_CONFIG),
    options: { ...DEFAULT_EVALUATION_OPTIONS },
    configHash: "deadbeef".repeat(8),
    estimates: [],
    metrics: makeMetrics(),
    dynamic: { unit: "LE", pairs: 100, jumps: 7, jumpRate: 0.07, jumpSpeedThreshold: 2, meanStepDistance: 0.88, lagSec: 1.5, stationaryPrecision: 0.61, stationaryBias: 1.23 },
    warnings: [],
    computedAt: "2026-11-21T09:00:00Z",
    ...over,
  };
}

export function makeInput(over: Partial<ReportInput> = {}): ReportInput {
  return {
    campaign: makeCampaign(),
    runs: [makeRun("r1")],
    results: [makeResult("r1")],
    toolVersion: "0.1.0",
    generatedAt: "2026-11-21T09:30:00Z",
    ...over,
  };
}
