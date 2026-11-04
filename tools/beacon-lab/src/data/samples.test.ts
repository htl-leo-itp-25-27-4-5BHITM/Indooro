import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runImport } from "./import";
import { demoFloorPlan, floorPlanFromIndooroLayout } from "./layout";

const sample = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");
const demoIds = demoFloorPlan().beacons.map((b) => b.id);

describe("shipped sample files import cleanly", () => {
  it("synthetic-example-long-format.csv (semicolon, German headers) with the demo market", async () => {
    const o = await runImport({ fileName: "synthetic-example-long-format.csv", text: sample("synthetic-example-long-format.csv"), knownBeaconIds: demoIds });
    expect(o.ok).toBe(true);
    expect(o.provenance.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(o.unknownBeaconIds).toEqual([]);
    expect(o.provenance.columnMapping).toMatchObject({ t: "Zeit", beaconId: "Beacon", rssi: "Signal", deviceId: "Gerät", refX: "x_ref", refY: "y_ref", refLabel: "Marker" });
    expect(o.references.length).toBe(4);
    expect(o.provenance.transformations.join("\n")).toContain("Dezimalkomma");
    expect(o.samples.length).toBeGreaterThan(80);
  });

  it("synthetic-example.json (Lab JSON) with the demo market", async () => {
    const o = await runImport({ fileName: "synthetic-example.json", text: sample("synthetic-example.json"), knownBeaconIds: demoIds });
    expect(o.ok).toBe(true);
    expect(o.provenance.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(o.references).toHaveLength(4);
    expect(o.suggested?.origin).toBe("synthetic");
  });

  it("synthetic-indooro-recording.jsonl with the synthetic test room", async () => {
    const layout = floorPlanFromIndooroLayout(JSON.parse(sample("layout-synthetic-testraum.json")), "layout-synthetic-testraum.json");
    expect(layout.plan.origin).toBe("synthetic");
    const o = await runImport({
      fileName: "synthetic-indooro-recording.jsonl",
      text: sample("synthetic-indooro-recording.jsonl"),
      knownBeaconIds: layout.beacons.map((b) => b.id),
    });
    expect(o.ok).toBe(true);
    expect(o.provenance.issues.filter((i) => i.severity !== "info")).toEqual([]);
    expect(o.unknownBeaconIds).toEqual([]);
    expect(o.references.length).toBeGreaterThanOrEqual(5);
    expect(o.provenance.issues.map((i) => i.code)).toContain("unmatched-ibeacon");
  });
});
