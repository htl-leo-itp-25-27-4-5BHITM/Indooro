import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DataIssue } from "../core/types";
import { detectFormat, prepareImport, runImport, suggestColumnMapping } from "./import";

const KNOWN = ["A", "B", "C"];
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const codes = (o: { provenance: { issues: DataIssue[] } }) => o.provenance.issues.map((i) => i.code);
const issue = (o: { provenance: { issues: DataIssue[] } }, code: string) =>
  o.provenance.issues.find((i) => i.code === code);

function goodCsv(n = 40, sep = ","): string {
  const lines = [["t", "beacon", "rssi"].join(sep)];
  for (let i = 0; i < n; i++) lines.push([i, ["A", "B", "C"][i % 3], -60 - (i % 20)].join(sep));
  return lines.join("\n") + "\n";
}

describe("detectFormat / suggestColumnMapping", () => {
  it("detects formats by extension and content", () => {
    expect(detectFormat("a.csv", "t,b,r\n")).toBe("csv");
    expect(detectFormat("a.txt", "t;b;r\n")).toBe("csv");
    expect(detectFormat("a.json", "[]")).toBe("json");
    expect(detectFormat("a.json", '{"samples":[]}')).toBe("json");
    expect(detectFormat("rec.jsonl", "")).toBe("indooro-jsonl");
    expect(detectFormat("rec.txt", '{"type":"measurement","t":1}\n{"type":"truth"}')).toBe("indooro-jsonl");
    expect(detectFormat("x.json", '{\n  "samples": []\n}')).toBe("json");
  });

  it("maps German and English synonyms case-insensitively", () => {
    expect(suggestColumnMapping(["Zeit", "Beacon", "Signal", "Gerät", "x_ref", "Y_REF", "Marker", "Lauf", "Kind"])).toEqual({
      t: "Zeit",
      beaconId: "Beacon",
      rssi: "Signal",
      deviceId: "Gerät",
      refX: "x_ref",
      refY: "Y_REF",
      refLabel: "Marker",
      runName: "Lauf",
      kind: "Kind",
    });
    expect(suggestColumnMapping(["timestamp", "beacon_id", "dBm"])).toMatchObject({ t: "timestamp", beaconId: "beacon_id", rssi: "dBm" });
    expect(suggestColumnMapping(["foo", "bar"])).toEqual({});
  });
});

describe("CSV import", () => {
  it("imports a valid comma CSV", async () => {
    const o = await runImport({ fileName: "a.csv", text: goodCsv(), knownBeaconIds: KNOWN });
    expect(o.ok).toBe(true);
    expect(o.samples).toHaveLength(40);
    expect(o.samples[0]).toMatchObject({ t: 0, beaconId: "A", rssi: -60, source: "csv", sourceRow: 2 });
    expect(o.provenance.format).toBe("csv");
    expect(o.provenance.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(o.provenance.totalRows).toBe(40);
    expect(o.provenance.rejectedRows).toBe(0);
    expect(o.provenance.columnMapping).toEqual({ t: "t", beaconId: "beacon", rssi: "rssi" });
    expect(o.unknownBeaconIds).toEqual([]);
    expect(codes(o)).toContain("no-references");
  });

  it("imports semicolon CSV with German headers and explicit decimal-comma conversion", async () => {
    const text = "Zeit;Beacon;Signal;Gerät\n0,5;A;-70;Pixel\n1,5;B;−72,5;Pixel\n";
    const o = await runImport({ fileName: "de.csv", text, knownBeaconIds: KNOWN });
    expect(o.ok).toBe(true);
    expect(o.samples.map((s) => [s.t, s.rssi])).toEqual([
      [0.5, -70],
      [1.5, -72.5],
    ]);
    expect(o.samples[0].deviceId).toBe("Pixel");
    expect(issue(o, "decimal-comma-converted")).toBeDefined();
    expect(o.provenance.transformations.join("\n")).toMatch(/Dezimalkomma/);
    expect(o.provenance.transformations.join("\n")).toMatch(/Unicode-Minus/);
  });

  it("never converts decimal commas when the delimiter is not ';' (blocking error)", async () => {
    const text = 't,beacon,rssi\n1,A,"-72,5"\n2,A,-70\n';
    const o = await runImport({ fileName: "x.csv", text, knownBeaconIds: KNOWN });
    expect(o.ok).toBe(false);
    expect(issue(o, "decimal-comma-unconverted")?.severity).toBe("error");
    expect(o.samples.every((s) => s.rssi !== -72.5)).toBe(true);
  });

  it("handles wrong column names via suggestion and explicit mapping", async () => {
    const text = "foo,bar,baz\n1,A,-70\n2,B,-71\n";
    const draft = prepareImport("w.csv", text);
    expect(draft.requiredMissing.sort()).toEqual(["beaconId", "rssi", "t"]);
    const blocked = await runImport({ fileName: "w.csv", text, knownBeaconIds: KNOWN });
    expect(blocked.ok).toBe(false);
    expect(codes(blocked)).toContain("missing-column");
    const ok = await runImport({
      fileName: "w.csv",
      text,
      mapping: { t: "foo", beaconId: "bar", rssi: "baz" },
      knownBeaconIds: KNOWN,
    });
    expect(ok.samples).toHaveLength(2);
    const bad = await runImport({ fileName: "w.csv", text, mapping: { t: "foo", beaconId: "nope", rssi: "baz" }, knownBeaconIds: KNOWN });
    expect(codes(bad)).toContain("unknown-column");
    expect(bad.ok).toBe(false);
  });

  it("rejects rows with missing values and reports them with row numbers", async () => {
    const text = "t,beacon,rssi\n1,A,-70\n2,,-71\n,B,-72\n4,C,\n5,A,-73\n";
    const o = await runImport({ fileName: "m.csv", text, knownBeaconIds: KNOWN });
    expect(o.samples).toHaveLength(2);
    const i = issue(o, "missing-value")!;
    expect(i.count).toBe(3);
    expect(i.rows).toEqual([3, 4, 5]);
    expect(i.message).toContain("Zeile 3, 4, 5");
    expect(o.provenance.rejectedRows).toBe(3);
  });

  it("rejects malformed timestamps", async () => {
    const text = "t,beacon,rssi\n1,A,-70\nabc,A,-71\n2024-13-45T99:00:00,A,-72\n3,A,-73\n";
    const o = await runImport({ fileName: "t.csv", text, knownBeaconIds: KNOWN });
    expect(o.samples).toHaveLength(2);
    expect(issue(o, "invalid-timestamp")?.rows).toEqual([3, 4]);
  });

  it("blocks mixed time formats", async () => {
    const text = "t,beacon,rssi\n1792000000.5,A,-70\n1792000001500,A,-71\n";
    const o = await runImport({ fileName: "mix.csv", text, knownBeaconIds: KNOWN });
    expect(o.ok).toBe(false);
    expect(issue(o, "mixed-time-formats")?.severity).toBe("error");
    const iso = "t,beacon,rssi\n2026-10-19T10:00:00Z,A,-70\n5,A,-71\n";
    expect((await runImport({ fileName: "mix.csv", text: iso, knownBeaconIds: KNOWN })).ok).toBe(false);
  });

  it("converts epoch milliseconds and ISO times and records the transformation", async () => {
    const ms = await runImport({
      fileName: "ms.csv",
      text: "t,beacon,rssi\n1792000000500,A,-70\n1792000001500,A,-71\n",
      knownBeaconIds: KNOWN,
    });
    expect(ms.samples.map((s) => s.t)).toEqual([1792000000.5, 1792000001.5]);
    expect(ms.provenance.transformations.join("\n")).toContain("Millisekunden → Sekunden");

    const iso = await runImport({
      fileName: "iso.csv",
      text: "t,beacon,rssi\n2026-10-19T10:00:00Z,A,-70\n2026-10-19 10:00:01,A,-71\n",
      knownBeaconIds: KNOWN,
    });
    expect(iso.samples[1].t - iso.samples[0].t).toBe(1);
    expect(iso.provenance.transformations.join("\n")).toContain("ISO-8601");
    expect(iso.provenance.transformations.join("\n")).toContain("UTC angenommen");
  });

  it("honours the timeFormat override", async () => {
    const text = "t,beacon,rssi\n5000,A,-70\n6000,A,-71\n";
    const auto = await runImport({ fileName: "r.csv", text, knownBeaconIds: KNOWN });
    expect(auto.samples[0].t).toBe(5000);
    expect(codes(auto)).toContain("relative-time");
    const ms = await runImport({ fileName: "r.csv", text, knownBeaconIds: KNOWN, timeFormat: "epoch-ms" });
    expect(ms.samples[0].t).toBe(5);
    const iso = await runImport({ fileName: "r.csv", text, knownBeaconIds: KNOWN, timeFormat: "iso" });
    expect(iso.ok).toBe(false);
  });

  it("rejects invalid RSSI (0, positive, text) and never keeps them", async () => {
    const text = "t,beacon,rssi\n1,A,0\n2,A,5\n3,A,abc\n4,A,-150\n5,A,-70\n";
    const o = await runImport({ fileName: "r.csv", text, knownBeaconIds: KNOWN });
    expect(o.samples).toHaveLength(1);
    expect(issue(o, "rssi-out-of-range")?.count).toBe(3);
    expect(issue(o, "rssi-not-numeric")?.count).toBe(1);
    expect(o.samples.some((s) => s.rssi >= 0)).toBe(false);
  });

  it("reports unknown beacon IDs but keeps the rows", async () => {
    const text = "t,beacon,rssi\n1,A,-70\n2,ZZ,-71\n3,ZZ,-72\n4,YY,-72\n";
    const o = await runImport({ fileName: "u.csv", text, knownBeaconIds: KNOWN });
    expect(o.samples).toHaveLength(4);
    expect(o.unknownBeaconIds).toEqual(["YY", "ZZ"]);
    expect(issue(o, "unknown-beacon")?.severity).toBe("warning");
  });

  it("removes exact duplicates only with a transformation entry", async () => {
    const text = "t,beacon,rssi\n1,A,-70\n1,A,-70\n1,A,-71\n2,A,-70\n";
    const o = await runImport({ fileName: "d.csv", text, knownBeaconIds: KNOWN });
    expect(o.samples).toHaveLength(3);
    expect(issue(o, "duplicate-rows")?.count).toBe(1);
    expect(o.provenance.transformations.join("\n")).toMatch(/1 exakte Duplikate/);
  });

  it("sorts unsorted timestamps with a warning and a transformation", async () => {
    const text = "t,beacon,rssi\n3,A,-70\n1,A,-71\n2,A,-72\n";
    const o = await runImport({ fileName: "s.csv", text, knownBeaconIds: KNOWN });
    expect(o.samples.map((s) => s.t)).toEqual([1, 2, 3]);
    expect(codes(o)).toContain("unsorted-timestamps");
    expect(o.provenance.transformations.join("\n")).toMatch(/sortiert/);
    // traceability survives sorting
    expect(o.samples[0].sourceRow).toBe(3);
  });

  it("extracts reference positions from refX/refY columns and collapses repeats", async () => {
    const text = "t;beacon;rssi;refX;refY;marker\n0;A;-70;3;4;P1\n0;B;-71;3;4;P1\n5;A;-70;3;4;P1\n6;A;-72;;;\n";
    const o = await runImport({ fileName: "ref.csv", text, knownBeaconIds: KNOWN });
    expect(o.references).toEqual([
      { t: 0, position: { x: 3, y: 4 }, label: "P1", sourceRow: 2 },
      { t: 5, position: { x: 3, y: 4 }, label: "P1", sourceRow: 4 },
    ]);
    expect(codes(o)).not.toContain("no-references");
    expect(o.provenance.transformations.join("\n")).toMatch(/Referenz-Wiederholungen/);
  });

  it("reports ragged rows and multiple runs", async () => {
    const text = "t,beacon,rssi,run,kind\n1,A,-70,r1,walk\n2,A,-71\n3,A,-72,r2,walk\n";
    const o = await runImport({ fileName: "g.csv", text, knownBeaconIds: KNOWN });
    expect(codes(o)).toContain("ragged-row");
    expect(codes(o)).toContain("multiple-runs-in-file");
    expect(o.suggested).toEqual({ runName: "r1", kind: "walk" });
  });

  it("fails cleanly on an empty file", async () => {
    const o = await runImport({ fileName: "e.csv", text: "", knownBeaconIds: KNOWN });
    expect(o.ok).toBe(false);
  });

  it("parses a large file (200k rows) in reasonable time", async () => {
    const n = 200_000;
    const parts: string[] = ["t,beacon,rssi,deviceId"];
    for (let i = 0; i < n; i++) parts.push(`${(i * 0.01).toFixed(2)},${["A", "B", "C"][i % 3]},${-50 - (i % 40)},dev`);
    const text = parts.join("\n");
    const t0 = performance.now();
    const o = await runImport({ fileName: "big.csv", text, knownBeaconIds: KNOWN });
    const dt = performance.now() - t0;
    expect(o.ok).toBe(true);
    expect(o.samples).toHaveLength(n);
    expect(dt).toBeLessThan(3000);
  }, 15000);
});

describe("JSON import", () => {
  it("imports an array of row objects", async () => {
    const rows = [
      { timestamp: 1, beacon: "A", rssi: -70, refX: 1, refY: 2 },
      { timestamp: 2, beacon: "B", rssi: -71, refX: 1, refY: 2 },
    ];
    const o = await runImport({ fileName: "rows.json", text: JSON.stringify(rows), knownBeaconIds: KNOWN });
    expect(o.ok).toBe(true);
    expect(o.provenance.format).toBe("json");
    expect(o.samples).toHaveLength(2);
    expect(o.samples[0]).toMatchObject({ source: "json", sourceRow: 1 });
    expect(o.references).toHaveLength(2);
  });

  it("imports Indooro Lab JSON with separate references", async () => {
    const doc = {
      format: "indooro-lab-json",
      origin: "synthetic",
      runName: "Test",
      kind: "stationary",
      deviceId: "dev1",
      samples: [
        { t: 0, beaconId: "A", rssi: -70 },
        { t: 1, beaconId: "B", rssi: -71, source: "ranging" },
      ],
      references: [
        { t: 0, x: 3, y: 4, label: "P1" },
        { t: 1, position: { x: 3, y: 4 } },
      ],
    };
    const o = await runImport({ fileName: "lab.json", text: JSON.stringify(doc), knownBeaconIds: KNOWN });
    expect(o.ok).toBe(true);
    expect(o.samples[0].deviceId).toBe("dev1");
    expect(o.samples[1].source).toBe("ranging");
    expect(o.references.map((r) => r.position)).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 4 },
    ]);
    expect(o.suggested).toEqual({ runName: "Test", kind: "stationary", origin: "synthetic" });
  });

  it("gives clear errors for broken or wrong JSON", async () => {
    const broken = await runImport({ fileName: "b.json", text: "{ nope", knownBeaconIds: KNOWN });
    expect(broken.ok).toBe(false);
    expect(codes(broken)).toContain("json-parse-error");
    const shape = await runImport({ fileName: "s.json", text: '{"foo":1}', knownBeaconIds: KNOWN });
    expect(codes(shape)).toContain("json-shape");
    const bundle = await runImport({
      fileName: "bundle.json",
      text: JSON.stringify({ schema: "indooro-positioning-lab/campaign-bundle", samples: [] }),
      knownBeaconIds: KNOWN,
    });
    expect(codes(bundle)).toContain("wrong-file-kind");
  });

  it("handles mixed time formats inside JSON", async () => {
    const rows = [
      { t: 1792000000, beaconId: "A", rssi: -70 },
      { t: "2026-10-19T10:00:00Z", beaconId: "A", rssi: -70 },
    ];
    const o = await runImport({ fileName: "m.json", text: JSON.stringify(rows), knownBeaconIds: KNOWN });
    expect(o.ok).toBe(false);
    expect(codes(o)).toContain("mixed-time-formats");
  });
});

describe("Indooro recording (JSON Lines)", () => {
  const text = fixture("synthetic-indooro-recording-excerpt.jsonl");
  const beacons = ["Indooro1", "Indooro2", "Indooro3", "Indooro4"];

  it("imports measurements and truth and reports scan / layout lines", async () => {
    const o = await runImport({ fileName: "synthetic-indooro-recording-excerpt.jsonl", text, knownBeaconIds: beacons });
    expect(o.ok).toBe(true);
    expect(o.provenance.format).toBe("indooro-jsonl");
    const measurementLines = text.split("\n").filter((l) => l.includes('"measurement"')).length;
    expect(o.samples).toHaveLength(measurementLines);
    expect(o.samples[0]).toMatchObject({ t: 1792000000, beaconId: "Indooro1", rssi: -77, source: "ranging", sourceRow: 3 });
    expect(o.references).toEqual([
      { t: 1792000000, position: { x: 1, y: 5 }, sourceRow: 2 },
      { t: 1792000004.9, position: { x: 1, y: 5 }, sourceRow: 28 },
    ]);
    expect(o.layoutInfo).toEqual({ revision: 1 });
    const scan = issue(o, "unmatched-ibeacon")!;
    expect(scan.severity).toBe("info");
    expect(scan.message).toContain("7-99");
    expect(scan.count).toBe(text.split("\n").filter((l) => l.includes('"scan"')).length);
    expect(o.samples.some((s) => s.beaconId === "7-99")).toBe(false);
    expect(o.unknownBeaconIds).toEqual([]);
    expect(o.provenance.issues.filter((i) => i.severity !== "info")).toEqual([]);
  });

  it("treats rssi 0 as invalid, counts events/steps and tolerates garbage lines", async () => {
    const lines = [
      '{"type":"layout","t":10,"revision":3,"layoutId":"L1","shopName":"X"}',
      '{"type":"measurement","t":10,"beacon":"Indooro1","rssi":0,"source":"ranging"}',
      '{"type":"measurement","t":11,"beacon":"Indooro1","rssi":-70,"source":"rssi"}',
      '{"type":"event","t":11,"name":"startTour"}',
      '{"type":"step","t":11.5}',
      '{"type":"heading","t":11.6,"deg":90}',
      "not json",
      '{"type":"truth","t":12,"x":2,"y":3}',
      '{"type":"weird","t":1}',
      "",
    ];
    const o = await runImport({ fileName: "r.jsonl", text: lines.join("\n"), knownBeaconIds: ["Indooro1"] });
    expect(o.samples).toHaveLength(1);
    expect(o.samples[0].source).toBe("rssi");
    expect(issue(o, "rssi-out-of-range")?.rows).toEqual([2]);
    expect(issue(o, "jsonl-parse-error")?.rows).toEqual([7]);
    expect(issue(o, "ignored-lines")?.message).toMatch(/1× step.*1× heading.*1× event|1× step/);
    expect(issue(o, "unknown-line-type")).toBeDefined();
    expect(o.layoutInfo).toEqual({ layoutId: "L1", revision: 3, shopName: "X" });
    expect(o.references).toHaveLength(1);
    expect(o.provenance.rejectedRows).toBe(2);
  });

  it("fails if the recording holds no usable measurement", async () => {
    const o = await runImport({ fileName: "x.jsonl", text: '{"type":"truth","t":1,"x":1,"y":1}\n', knownBeaconIds: [] });
    expect(o.ok).toBe(false);
    expect(codes(o)).toContain("no-valid-samples");
  });
});
