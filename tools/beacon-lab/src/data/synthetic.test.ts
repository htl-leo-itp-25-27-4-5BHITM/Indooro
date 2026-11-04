import { describe, expect, it } from "vitest";
import { sha256Hex, stableStringify } from "../core/hash";
import type { FloorElement, MeasurementRun, SyntheticScenarioId } from "../core/types";
import { demoFloorPlan } from "./layout";
import { sha256HexSync } from "./sha256sync";
import { assessRunQuality } from "./validate";
import {
  CAL_POINTS,
  EVAL_POINTS,
  SCENARIOS,
  WALK_ROUTE,
  createDemoCampaign,
  defaultScenarioConfig,
  generateSyntheticRun,
} from "./synthetic";

const { campaign } = createDemoCampaign();
const IDS = SCENARIOS.map((s) => s.id);

function gen(id: SyntheticScenarioId, seed?: number, role: "calibration" | "evaluation" = "evaluation"): MeasurementRun {
  return generateSyntheticRun(campaign, defaultScenarioConfig(id, seed), role);
}

describe("sha256HexSync", () => {
  it("matches WebCrypto", async () => {
    for (const s of ["", "abc", "Ünïcödé ✓", "x".repeat(1000), stableStringify({ a: 1, b: [1, 2] })]) {
      expect(sha256HexSync(s)).toBe(await sha256Hex(s));
    }
  });
});

describe("synthetic generator", () => {
  it("lists eight scenarios with German title/description and kind", () => {
    expect(IDS).toEqual([
      "good-coverage",
      "poor-coverage",
      "high-noise",
      "beacon-dropout",
      "aisle-walk",
      "jumping-between-beacons",
      "miscalibrated",
      "multipath",
    ]);
    for (const s of SCENARIOS) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.description.length).toBeGreaterThan(30);
      expect(["stationary", "walk"]).toContain(s.kind);
      expect(defaultScenarioConfig(s.id).scenario).toBe(s.id);
    }
  });

  it("is deterministic: same seed => deep-equal, byte-identical", () => {
    for (const id of IDS) {
      const a = gen(id, 42);
      const b = gen(id, 42);
      expect(a).toEqual(b);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it("different seeds give different data", () => {
    const a = gen("good-coverage", 1);
    const b = gen("good-coverage", 2);
    expect(a.samples.map((s) => s.rssi)).not.toEqual(b.samples.map((s) => s.rssi));
    expect(a.provenance.sha256).not.toBe(b.provenance.sha256);
    expect(a.id).not.toBe(b.id);
  });

  it("marks runs as synthetic everywhere and records the config", async () => {
    for (const id of IDS) {
      const r = gen(id);
      expect(r.origin).toBe("synthetic");
      expect(r.name).toContain("SYNTHETISCH");
      expect(r.provenance.format).toBe("synthetic");
      expect(r.provenance.synthetic).toEqual(defaultScenarioConfig(id));
      expect(r.provenance.sha256).toBe(await sha256Hex(stableStringify(defaultScenarioConfig(id))));
      expect(r.samples.every((s) => s.source === "synthetic")).toBe(true);
      expect(r.createdAt).toBe("2026-01-01T00:00:00.000Z");
    }
  });

  it("produces valid, sorted, integer-quantised, clipped samples", () => {
    for (const id of IDS) {
      const r = gen(id);
      expect(r.samples.length).toBeGreaterThan(50);
      for (let i = 0; i < r.samples.length; i++) {
        const s = r.samples[i];
        expect(Number.isInteger(s.rssi)).toBe(true);
        expect(s.rssi).toBeLessThanOrEqual(-30);
        expect(s.rssi).toBeGreaterThanOrEqual(-105);
        if (i > 0) expect(s.t).toBeGreaterThanOrEqual(r.samples[i - 1].t);
      }
      for (let i = 1; i < r.references.length; i++) expect(r.references[i].t).toBeGreaterThanOrEqual(r.references[i - 1].t);
      const q = assessRunQuality(r, campaign);
      expect(q.issues.filter((i) => i.severity === "error")).toEqual([]);
    }
  });

  it("stationary runs use start/end truth pairs at aisle centres", () => {
    const r = gen("good-coverage");
    expect(r.kind).toBe("stationary");
    expect(r.references).toHaveLength(10);
    for (let i = 0; i < r.references.length; i += 2) {
      expect(r.references[i].position).toEqual(r.references[i + 1].position);
      expect(r.references[i + 1].t - r.references[i].t).toBeCloseTo(40);
      expect(EVAL_POINTS).toContainEqual(r.references[i].position);
    }
    // every sample lies inside a hold window
    const holds: number[][] = [];
    for (let i = 0; i < r.references.length; i += 2) holds.push([r.references[i].t, r.references[i + 1].t]);
    expect(r.samples.every((s) => holds.some(([a, b]) => s.t >= a && s.t <= b))).toBe(true);
  });

  it("stationary points and the walk route keep clear of solid elements", () => {
    const { plan } = demoFloorPlan();
    const solid = plan.elements.filter((e) => ["shelf", "checkout", "cooler", "wall"].includes(e.type));
    const inside = (e: FloorElement, x: number, y: number) =>
      x >= e.x && x <= e.x + e.width && y >= e.y && y <= e.y + e.height;
    for (const p of [...EVAL_POINTS, ...CAL_POINTS]) {
      expect(solid.filter((e) => inside(e, p.x, p.y))).toEqual([]);
    }
    const walk = gen("aisle-walk");
    for (const r of walk.references) {
      expect(solid.filter((e) => inside(e, r.position.x, r.position.y)).map((e) => e.id)).toEqual([]);
    }
    expect(WALK_ROUTE.length).toBeGreaterThan(3);
  });

  it("aisle-walk: ~1.1 m/s, reference every second along the path", () => {
    const r = gen("aisle-walk");
    expect(r.kind).toBe("walk");
    expect(r.references[1].t - r.references[0].t).toBe(1);
    const steps = r.references.slice(1).map((p, i) => Math.hypot(p.position.x - r.references[i].position.x, p.position.y - r.references[i].position.y));
    const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
    expect(mean).toBeGreaterThan(1.0);
    expect(mean).toBeLessThanOrEqual(1.11);
    expect(r.references.length).toBeGreaterThan(40);
  });

  it("good-coverage hears several beacons; poor-coverage hears only the 3 enabled far-apart beacons with less data", () => {
    const good = gen("good-coverage");
    const poor = gen("poor-coverage");
    const ids = (r: MeasurementRun) => new Set(r.samples.map((s) => s.beaconId));
    expect(ids(good).size).toBeGreaterThanOrEqual(8);
    expect([...ids(poor)].every((id) => ["LAB-B01", "LAB-B07", "LAB-B09"].includes(id))).toBe(true);
    expect(poor.samples.length).toBeLessThan(good.samples.length / 4);
    const q = assessRunQuality(poor, campaign);
    expect(q.perBeacon.length).toBeLessThanOrEqual(3);
  });

  it("high-noise has larger RSSI spread than good-coverage at the same positions", () => {
    const spread = (r: MeasurementRun) => {
      const groups = new Map<string, number[]>();
      for (const s of r.samples) {
        const ref = r.references.find((p, i) => i % 2 === 0 && s.t >= p.t && s.t <= r.references[i + 1].t)!;
        const k = `${s.beaconId}|${ref.label}`;
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(s.rssi);
      }
      let acc = 0;
      let n = 0;
      for (const v of groups.values()) {
        if (v.length < 10) continue;
        const m = v.reduce((a, b) => a + b, 0) / v.length;
        if (m < -82) continue; // weak links are truncated by the receiver sensitivity
        acc += v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);
        n++;
      }
      return Math.sqrt(acc / n);
    };
    const g = spread(gen("good-coverage"));
    const h = spread(gen("high-noise"));
    expect(g).toBeGreaterThan(2);
    expect(g).toBeLessThan(4.5);
    expect(h).toBeGreaterThan(6);
    expect(h).toBeGreaterThan(g * 1.6);
  });

  it("beacon-dropout: dropout beacon is silent in the interval but heard outside", () => {
    const r = gen("beacon-dropout");
    const cfg = r.provenance.synthetic!;
    const id = cfg.extra.dropoutBeaconId as string;
    const a = cfg.extra.dropoutStart as number;
    const b = cfg.extra.dropoutEnd as number;
    const own = r.samples.filter((s) => s.beaconId === id);
    expect(own.filter((s) => s.t >= a && s.t < b)).toHaveLength(0);
    expect(own.filter((s) => s.t < a).length).toBeGreaterThan(10);
    expect(own.filter((s) => s.t >= b).length).toBeGreaterThan(10);
    // other beacons keep reporting during the interval
    expect(r.samples.filter((s) => s.beaconId !== id && s.t >= a && s.t < b).length).toBeGreaterThan(50);
  });

  it("miscalibrated: stronger signals than the lab default model predicts", () => {
    const m = gen("miscalibrated");
    const g = gen("good-coverage");
    const mean = (r: MeasurementRun) => r.samples.reduce((a, s) => a + s.rssi, 0) / r.samples.length;
    expect(m.provenance.synthetic!.trueRssiAt1m).toBe(-62);
    expect(m.provenance.synthetic!.truePathLossExponent).toBe(2.0);
    expect(mean(m)).toBeGreaterThan(mean(g) + 5);
    expect(new Set(m.samples.map((s) => s.beaconId)).size).toBe(10);
  });

  it("jumping-between-beacons: two beacons whose bias toggles periodically", () => {
    const r = gen("jumping-between-beacons");
    expect(r.kind).toBe("walk");
    const ids = new Set(r.samples.map((s) => s.beaconId));
    expect([...ids].sort()).toEqual(["LAB-B03", "LAB-B04"]);
    const diffAt = (t0: number, t1: number) => {
      const m = (id: string) => {
        const v = r.samples.filter((s) => s.beaconId === id && s.t >= t0 && s.t < t1).map((s) => s.rssi);
        return v.reduce((a, b) => a + b, 0) / v.length;
      };
      return m("LAB-B03") - m("LAB-B04");
    };
    // period 4 s: first half-period vs second differ by ~ 4 * 9 = 36 dB in the difference (positions nearly equal)
    expect(Math.abs(diffAt(0, 4) - diffAt(4, 8))).toBeGreaterThan(20);
  });

  it("multipath: outlier spikes and position-dependent bias are present", () => {
    const r = gen("multipath");
    const cfg = r.provenance.synthetic!;
    expect(cfg.extra.spikeProb).toBeGreaterThan(0);
    const plain = generateSyntheticRun(campaign, { ...defaultScenarioConfig("multipath"), extra: { ...cfg.extra, spikeProb: 0, multipathAmplitudeDb: 0 } }, "evaluation");
    expect(plain.samples.map((s) => s.rssi)).not.toEqual(r.samples.map((s) => s.rssi));
  });

  it("generated runs import-validate: unknown beacons none, role is kept", () => {
    const cal = gen("good-coverage", 5, "calibration");
    expect(cal.role).toBe("calibration");
    expect(cal.campaignId).toBe(campaign.id);
    expect(assessRunQuality(cal, campaign).issues.some((i) => i.code === "unknown-beacon")).toBe(false);
  });

  it("rejects unknown scenarios", () => {
    expect(() => generateSyntheticRun(campaign, { ...defaultScenarioConfig("good-coverage"), scenario: "nope" as SyntheticScenarioId }, "evaluation")).toThrow();
  });
});

describe("createDemoCampaign", () => {
  it("builds a synthetic campaign with calibration and evaluation runs, quickly and deterministically", () => {
    const t0 = performance.now();
    const demo = createDemoCampaign();
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(300);
    expect(demo.campaign.name).toBe("Demo-Kampagne (SYNTHETISCH)");
    expect(demo.campaign.floorPlan.name).toBe("Fiktiver Demo-Markt (synthetisch)");
    expect(demo.campaign.floorPlan.origin).toBe("synthetic");
    expect(demo.runs.length).toBeGreaterThanOrEqual(5);
    expect(demo.runs.length).toBeLessThanOrEqual(7);
    expect(demo.runs.filter((r) => r.role === "calibration").length).toBeGreaterThanOrEqual(1);
    expect(demo.runs.filter((r) => r.role === "evaluation").length).toBeGreaterThanOrEqual(3);
    expect(demo.runs.every((r) => r.origin === "synthetic" && r.name.includes("SYNTHETISCH") && r.campaignId === demo.campaign.id)).toBe(true);
    expect(new Set(demo.runs.map((r) => r.id)).size).toBe(demo.runs.length);
    expect(JSON.stringify(createDemoCampaign())).toBe(JSON.stringify(demo));
    const total = demo.runs.reduce((a, r) => a + r.samples.length, 0);
    expect(total).toBeLessThan(60_000);
  });
});
