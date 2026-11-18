import { describe, expect, it } from "vitest";
import { defaultScale } from "../core/defaults";
import type { EvaluationResult } from "../core/types";
import { parseCsv } from "./csv";
import {
  BUNDLE_SCHEMA,
  campaignBundle,
  downloadText,
  estimatesToCsv,
  parseCampaignBundle,
  referencesToCsv,
  samplesToCsv,
} from "./export";
import { runImport } from "./import";
import { createDemoCampaign } from "./synthetic";

const demo = createDemoCampaign();

describe("campaign bundle", () => {
  it("round-trips a campaign with runs", () => {
    const b = campaignBundle(demo.campaign, demo.runs);
    expect(b.schema).toBe(BUNDLE_SCHEMA);
    expect(b.schemaVersion).toBe(1);
    expect(b.tool.version).toBeTruthy();
    const parsed = parseCampaignBundle(JSON.stringify(b));
    expect(parsed.issues).toEqual([]);
    expect(parsed.bundle?.campaign).toEqual(demo.campaign);
    expect(parsed.bundle?.runs).toEqual(demo.runs);
    expect(parsed.bundle?.exportedAt).toBe(b.exportedAt);
  });

  it("rejects wrong schema, broken JSON and newer versions with clear issues", () => {
    expect(parseCampaignBundle("{ nope").issues[0].code).toBe("bundle-json");
    expect(parseCampaignBundle("[]").bundle).toBeUndefined();
    const wrong = parseCampaignBundle(JSON.stringify({ schema: "x" }));
    expect(wrong.bundle).toBeUndefined();
    expect(wrong.issues[0].code).toBe("bundle-schema");
    const newer = parseCampaignBundle(JSON.stringify({ ...campaignBundle(demo.campaign, []), schemaVersion: 2 }));
    expect(newer.bundle).toBeUndefined();
    expect(newer.issues[0].message).toContain("aktualisieren");
  });

  it("validates content: foreign campaign id, bad samples, bad references", () => {
    const run = structuredClone(demo.runs[0]);
    run.campaignId = "other";
    run.samples[0] = { t: NaN as unknown as number, beaconId: "", rssi: -70 };
    run.samples[1] = { ...run.samples[1], rssi: 0 };
    run.references[0] = { t: 1, position: { x: "a" as unknown as number, y: 1 } };
    const { bundle, issues } = parseCampaignBundle(JSON.stringify(campaignBundle(demo.campaign, [run])));
    expect(bundle).toBeUndefined();
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["bundle-run", "bundle-sample", "bundle-sample-range", "bundle-reference"]));
    expect(issues.every((i) => i.severity === "error")).toBe(true);
  });

  it("detects incomplete campaigns", () => {
    const b = JSON.parse(JSON.stringify(campaignBundle(demo.campaign, [])));
    delete b.campaign.floorPlan;
    expect(parseCampaignBundle(JSON.stringify(b)).issues[0].code).toBe("bundle-floorplan");
  });
});

describe("samplesToCsv / referencesToCsv", () => {
  it("writes a re-importable long-format CSV", async () => {
    const run = demo.runs[2];
    const csv = samplesToCsv(run);
    const parsed = parseCsv(csv);
    expect(parsed.header).toEqual(["t", "beaconId", "rssi", "deviceId", "source", "origin"]);
    expect(parsed.rows).toHaveLength(run.samples.length);
    const out = await runImport({ fileName: "e.csv", text: csv, knownBeaconIds: demo.campaign.beacons.map((b) => b.id) });
    expect(out.ok).toBe(true);
    expect(out.samples).toHaveLength(run.samples.length);
    expect(out.samples.map((s) => [s.t, s.beaconId, s.rssi])).toEqual(run.samples.map((s) => [s.t, s.beaconId, s.rssi]));
    expect(out.provenance.transformations.filter((t) => /Duplikat|sortiert/.test(t))).toEqual([]);
  });

  it("writes references with labels", () => {
    const csv = referencesToCsv(demo.runs[2]);
    expect(csv.split("\n")[0]).toBe("t,x,y,label,origin");
    expect(csv).toContain("P1");
  });

  it("escapes special characters", () => {
    const run = { ...demo.runs[0], samples: [{ t: 0, beaconId: 'a,"b"', rssi: -70 }], references: [] };
    expect(samplesToCsv(run).split("\n")[1]).toContain('"a,""b"""');
  });
});

describe("estimatesToCsv", () => {
  const result = {
    runId: "r",
    estimates: [
      {
        t: 1,
        position: { x: 2.123456, y: 3 },
        rawPosition: { x: 2, y: 3.5 },
        truth: { x: 1, y: 3 },
        errorUnits: 1.123456,
        inputs: [{ beaconId: "A", rssi: -70 }, { beaconId: "B", rssi: -71 }],
      },
      { t: 2, position: null, rawPosition: null, truth: { x: 1, y: 3 }, errorUnits: null, failureReason: "zu wenige Beacons, Schwelle", inputs: [] },
    ],
  } as unknown as EvaluationResult;

  it("uses LE while the scale is unconfirmed", () => {
    const lines = estimatesToCsv(result, defaultScale()).trim().split("\n");
    expect(lines[0]).toBe("t,x_est,y_est,x_raw,y_raw,x_truth,y_truth,error,error_unit,failure_reason,n_beacons");
    expect(lines[1]).toBe("1,2.1235,3,2,3.5,1,3,1.1235,LE,,2");
    expect(lines[2]).toBe('2,,,,,1,3,,LE,"zu wenige Beacons, Schwelle",0');
  });

  it("converts to metres only when the scale is confirmed", () => {
    const scale = { metersPerUnit: 0.5, confirmed: true, note: "gemessen" };
    const lines = estimatesToCsv(result, scale).trim().split("\n");
    expect(lines[1].split(",").slice(7, 9)).toEqual(["0.5617", "m"]);
  });
});

describe("downloadText", () => {
  it("is a no-op outside the DOM", () => {
    expect(() => downloadText("x.txt", "hi", "text/plain")).not.toThrow();
  });
});
