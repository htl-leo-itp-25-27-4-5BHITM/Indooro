import { describe, expect, it } from "vitest";
import { DEFAULT_PATH_LOSS, defaultScale } from "../core/defaults";
import type { Campaign, FloorPlan, MeasurementRun, ReferencePoint, RssiSample } from "../core/types";
import { assessRunQuality, validateReferences, validateSamples } from "./validate";

const plan: FloorPlan = {
  id: "p",
  name: "P",
  width: 10,
  height: 8,
  elements: [],
  scale: defaultScale(),
  origin: "synthetic",
  source: "test",
};

function samples(n: number, beacon = "A", dt = 1, rssi = -70): RssiSample[] {
  return Array.from({ length: n }, (_, i) => ({ t: i * dt, beaconId: beacon, rssi }));
}
const codes = (i: { code: string }[]) => i.map((x) => x.code);

describe("validateSamples", () => {
  it("accepts clean data without errors", () => {
    const issues = validateSamples(samples(60), ["A"]);
    expect(issues.filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("flags NaN timestamps, non-finite and out-of-range RSSI as errors (German, with rows)", () => {
    const s: RssiSample[] = [
      ...samples(40),
      { t: NaN, beaconId: "A", rssi: -70, sourceRow: 41 },
      { t: 50, beaconId: "A", rssi: NaN, sourceRow: 42 },
      { t: 51, beaconId: "A", rssi: 0, sourceRow: 43 },
      { t: 52, beaconId: "A", rssi: 12, sourceRow: 44 },
      { t: 53, beaconId: "A", rssi: -120, sourceRow: 45 },
    ];
    const issues = validateSamples(s, ["A"]);
    expect(issues.find((i) => i.code === "invalid-timestamp")?.rows).toEqual([41]);
    expect(issues.find((i) => i.code === "rssi-not-finite")?.rows).toEqual([42]);
    const range = issues.find((i) => i.code === "rssi-out-of-range")!;
    expect(range.severity).toBe("error");
    expect(range.rows).toEqual([43, 44, 45]);
    expect(range.message).toContain("außerhalb");
  });

  it("limits example rows to 5", () => {
    const s: RssiSample[] = [...samples(40), ...Array.from({ length: 12 }, (_, i) => ({ t: 100 + i, beaconId: "A", rssi: 0 }))];
    const range = validateSamples(s, ["A"]).find((i) => i.code === "rssi-out-of-range")!;
    expect(range.rows).toHaveLength(5);
    expect(range.count).toBe(12);
  });

  it("warns about unknown beacons, duplicates and unsorted timestamps", () => {
    const s: RssiSample[] = [...samples(40), { t: 5, beaconId: "ZZ", rssi: -70 }, { t: 3, beaconId: "A", rssi: -70 }];
    const issues = validateSamples(s, ["A"]);
    expect(codes(issues)).toEqual(expect.arrayContaining(["unknown-beacon", "unsorted-timestamps", "duplicate-rows"]));
    expect(issues.find((i) => i.code === "unknown-beacon")?.message).toContain("ZZ");
    expect(issues.every((i) => i.severity !== "error")).toBe(true);
  });

  it("detects large gaps per beacon", () => {
    const s = [...samples(20), ...samples(20).map((x) => ({ ...x, t: x.t + 100 }))];
    const gap = validateSamples(s, ["A"]).find((i) => i.code === "large-gap");
    expect(gap?.message).toContain("A:");
  });

  it("warns on very few samples and errors on none", () => {
    expect(codes(validateSamples(samples(5), ["A"]))).toContain("few-samples");
    expect(validateSamples([], ["A"]).find((i) => i.code === "no-samples")?.severity).toBe("error");
  });
});

describe("validateReferences", () => {
  it("warns when there is no ground truth", () => {
    const i = validateReferences([], plan);
    expect(i[0].code).toBe("no-references");
    expect(i[0].message).toContain("keine Ground Truth");
    expect(i[0].severity).toBe("warning");
  });

  it("flags references outside the floor plan as error", () => {
    const refs: ReferencePoint[] = [
      { t: 0, position: { x: 5, y: 4 } },
      { t: 1, position: { x: 11, y: 4 }, sourceRow: 7 },
      { t: 2, position: { x: 5, y: -0.5 } },
    ];
    const i = validateReferences(refs, plan).find((x) => x.code === "reference-out-of-bounds")!;
    expect(i.severity).toBe("error");
    expect(i.count).toBe(2);
    expect(i.rows).toContain(7);
  });

  it("accepts references on the boundary and flags a single point", () => {
    const i = validateReferences([{ t: 0, position: { x: 10, y: 8 } }], plan);
    expect(codes(i)).toEqual(["few-references"]);
  });
});

describe("assessRunQuality", () => {
  const campaign = {
    id: "c",
    name: "C",
    floorPlan: plan,
    beacons: [
      { id: "A", position: { x: 1, y: 1 }, enabled: true },
      { id: "B", position: { x: 9, y: 1 }, enabled: true },
    ],
    pathLoss: DEFAULT_PATH_LOSS,
  } as unknown as Campaign;

  const run = (over: Partial<MeasurementRun>): MeasurementRun =>
    ({
      id: "r",
      campaignId: "c",
      name: "R",
      kind: "stationary",
      role: "evaluation",
      origin: "synthetic",
      createdAt: "",
      samples: samples(60, "A", 0.5),
      references: [
        { t: 0, position: { x: 2, y: 2 } },
        { t: 29, position: { x: 2, y: 2 } },
      ],
      provenance: {} as MeasurementRun["provenance"],
      ...over,
    }) as MeasurementRun;

  it("computes per-beacon statistics and flags a silent beacon", () => {
    const q = assessRunQuality(run({}), campaign);
    expect(q.durationSec).toBeCloseTo(29.5);
    expect(q.perBeacon).toHaveLength(1);
    expect(q.perBeacon[0]).toMatchObject({ beaconId: "A", count: 60, known: true });
    expect(q.perBeacon[0].rateHz).toBeCloseTo(60 / 29.5);
    expect(codes(q.issues)).toContain("beacon-never-heard");
    expect(q.evaluable).toBe(true);
    expect(q.reasons).toEqual([]);
  });

  it("is not evaluable without references, for calibration runs or without samples", () => {
    expect(assessRunQuality(run({ references: [] }), campaign).reasons.join(" ")).toContain("Ground Truth");
    expect(assessRunQuality(run({ role: "calibration" }), campaign).evaluable).toBe(false);
    const empty = assessRunQuality(run({ samples: [] }), campaign);
    expect(empty.evaluable).toBe(false);
    expect(empty.durationSec).toBe(0);
  });

  it("is not evaluable if references leave the floor plan", () => {
    const q = assessRunQuality(run({ references: [{ t: 0, position: { x: 50, y: 4 } }] }), campaign);
    expect(q.evaluable).toBe(false);
  });
});
