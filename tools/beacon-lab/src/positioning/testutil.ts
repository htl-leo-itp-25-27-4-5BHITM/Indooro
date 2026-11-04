/**
 * Tiny self-contained fixtures for the positioning tests. Deliberately independent from src/data.
 * Not used by production code.
 */
import { gaussian, mulberry32 } from "../core/random";
import type {
  Beacon,
  Campaign,
  FloorPlan,
  MeasurementRun,
  PathLossModel,
  Point,
  ReferencePoint,
  RssiSample,
  RunKind,
  RunRole,
} from "../core/types";
import { distanceToRssi } from "./pathloss";

export const TRUE_MODEL: PathLossModel = { rssiAt1m: -60, pathLossExponent: 2.2, source: "manual" };

export function makeBeacon(id: string, x: number, y: number, extra: Partial<Beacon> = {}): Beacon {
  return { id, position: { x, y }, enabled: true, ...extra };
}

export function makePlan(opts: { width?: number; height?: number; metersPerUnit?: number; confirmed?: boolean } = {}): FloorPlan {
  return {
    id: "plan",
    name: "Testplan",
    width: opts.width ?? 20,
    height: opts.height ?? 20,
    elements: [],
    scale: { metersPerUnit: opts.metersPerUnit ?? 1, confirmed: opts.confirmed ?? true, note: "test" },
    origin: "synthetic",
    source: "testutil",
  };
}

/** Four beacons at the corners of a square (0,0)-(10,10). */
export function squareBeacons(size = 10): Beacon[] {
  return [makeBeacon("B1", 0, 0), makeBeacon("B2", size, 0), makeBeacon("B3", size, size), makeBeacon("B4", 0, size)];
}

export function makeCampaign(
  opts: {
    beacons?: Beacon[];
    metersPerUnit?: number;
    confirmed?: boolean;
    pathLoss?: PathLossModel;
    width?: number;
    height?: number;
  } = {},
): Campaign {
  return {
    id: "camp",
    name: "Testkampagne",
    description: "",
    date: "2026-01-01",
    market: "Test",
    device: "Test",
    conditions: "",
    notes: "",
    floorPlan: makePlan(opts),
    beacons: opts.beacons ?? squareBeacons(),
    pathLoss: opts.pathLoss ?? TRUE_MODEL,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function makeRun(opts: {
  id?: string;
  role?: RunRole;
  kind?: RunKind;
  samples?: RssiSample[];
  references?: ReferencePoint[];
  origin?: "real" | "synthetic";
  sha256?: string;
}): MeasurementRun {
  const id = opts.id ?? "run";
  return {
    id,
    campaignId: "camp",
    name: id,
    kind: opts.kind ?? "stationary",
    role: opts.role ?? "evaluation",
    origin: opts.origin ?? "real",
    createdAt: "2026-01-01T00:00:00.000Z",
    samples: opts.samples ?? [],
    references: opts.references ?? [],
    provenance: {
      fileName: `${id}.csv`,
      format: "csv",
      importedAt: "2026-01-01T00:00:00.000Z",
      sha256: opts.sha256 ?? `sha-${id}`,
      totalRows: opts.samples?.length ?? 0,
      acceptedRows: opts.samples?.length ?? 0,
      rejectedRows: 0,
      transformations: [],
      issues: [],
    },
  };
}

/** Noise-free RSSI of `beacon` at layout position `pos` (distance converted with metersPerUnit). */
export function rssiFor(beacon: Beacon, pos: Point, model: PathLossModel, metersPerUnit: number): number {
  const dM = Math.max(0.05, Math.hypot(beacon.position.x - pos.x, beacon.position.y - pos.y) * metersPerUnit);
  return distanceToRssi(dM, model);
}

export interface SimOpts {
  rateHz?: number;
  noiseStdDb?: number;
  seed?: number;
  model?: PathLossModel;
}

/** Samples of a device standing at `pos` from t0 for durationSec. */
export function simulateHold(campaign: Campaign, pos: Point, t0: number, durationSec: number, o: SimOpts = {}): RssiSample[] {
  return simulatePath(campaign, () => pos, t0, t0 + durationSec, o);
}

/** Samples for a device following `posAt(t)`; one sample per beacon per 1/rateHz seconds. */
export function simulatePath(campaign: Campaign, posAt: (t: number) => Point, t0: number, t1: number, o: SimOpts = {}): RssiSample[] {
  const rate = o.rateHz ?? 2;
  const rng = mulberry32(o.seed ?? 1);
  const model = o.model ?? TRUE_MODEL;
  const mpu = campaign.floorPlan.scale.metersPerUnit;
  const out: RssiSample[] = [];
  const n = Math.floor((t1 - t0) * rate + 1e-9);
  for (let k = 0; k <= n; k++) {
    const t = t0 + k / rate;
    const pos = posAt(t);
    for (const b of campaign.beacons) {
      const noise = o.noiseStdDb ? gaussian(rng) * o.noiseStdDb : 0;
      out.push({ t, beaconId: b.id, rssi: rssiFor(b, pos, model, mpu) + noise });
    }
  }
  return out;
}
