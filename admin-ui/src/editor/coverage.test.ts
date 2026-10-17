import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { beaconPoints, clampRadius, coverageCounts, coverageRule, coverageSummary, parseCoverageRule, walkableGrid, type CoverageInput, type CoverageRule } from "./coverage";

interface SharedVector {
  name: string;
  layout: CoverageInput;
  radius: number;
  minBeacons: number;
  expected: { walkableCells: number; counts: (number | null)[][]; coveredShare: number; lowCoverageShare: number };
}

const readJson = (url: URL): unknown => JSON.parse(readFileSync(url, "utf8")) as unknown;
const vectors = readJson(new URL("../../../scripts/beacon-planner/fixtures/vectors.json", import.meta.url)) as SharedVector[];
const sharedRuleUrl = new URL("../../../backend/indooro_server/src/main/resources/readiness/coverage-rule.json", import.meta.url);
const EPSILON = 1e-6;

test("shared test vectors: counts, walkable cells and shares match the Python planner", () => {
  assert.ok(vectors.length >= 6, "mindestens sechs Vektoren");
  for (const vector of vectors) {
    const grid = coverageCounts(vector.layout, undefined, vector.radius);
    const summary = coverageSummary(grid, vector.minBeacons);
    assert.deepEqual(grid.counts, vector.expected.counts, `counts: ${vector.name}`);
    assert.equal(grid.walkableCells, vector.expected.walkableCells, `walkableCells: ${vector.name}`);
    assert.ok(Math.abs(summary.coveredShare - vector.expected.coveredShare) <= EPSILON, `coveredShare: ${vector.name}`);
    assert.ok(Math.abs(summary.lowCoverageShare - vector.expected.lowCoverageShare) <= EPSILON, `lowCoverageShare: ${vector.name}`);
  }
});

test("coverage rule is the shared JSON file, without its comment field", () => {
  const shared = readJson(sharedRuleUrl) as Record<string, unknown>;
  const { _comment: _ignored, ...values } = shared;
  void _ignored;
  assert.deepEqual({ ...coverageRule }, values);
  assert.equal(coverageRule.radiusMeters, 8);
  assert.equal(coverageRule.minBeaconsPerCell, 3);
});

test("parseCoverageRule rejects values the Java CoverageRule rejects", () => {
  const valid = { ...coverageRule };
  const invalid: Array<Partial<CoverageRule>> = [
    { radiusMeters: 40 },
    { minRadiusMeters: 0 },
    { minRadiusMeters: 31 },
    { minBeaconsPerCell: 0 },
    { minBeaconsPerCell: 2.5 },
    { maxLowCoverageShare: 1.5 },
  ];
  for (const change of invalid) {
    assert.throws(() => parseCoverageRule({ ...valid, ...change }), Error, JSON.stringify(change));
  }
  assert.throws(() => parseCoverageRule(null), Error);
});

test("clampRadius keeps the radius within the rule's minimum and maximum", () => {
  assert.equal(clampRadius(0.1), coverageRule.minRadiusMeters);
  assert.equal(clampRadius(100), coverageRule.maxRadiusMeters);
  assert.equal(clampRadius(12), 12);
  assert.equal(clampRadius(Number.NaN), coverageRule.radiusMeters);
  assert.equal(clampRadius(5, { ...coverageRule, minRadiusMeters: 6, maxRadiusMeters: 9 }), 6);
});

test("without beacons every walkable cell has zero beacons", () => {
  const layout: CoverageInput = { gridSize: { width: 5, height: 4 }, elements: [{ id: 1, type: "shelf", x: 0, y: 0, width: 2, height: 1 }] };
  assert.deepEqual(beaconPoints(layout), []);
  const grid = coverageCounts(layout, undefined, coverageRule.radiusMeters);
  assert.equal(grid.walkableCells, 18);
  for (const row of grid.counts) {
    for (const count of row) assert.ok(count === null || count === 0);
  }
  const summary = coverageSummary(grid, coverageRule.minBeaconsPerCell);
  assert.equal(summary.coveredShare, 0);
  assert.equal(summary.lowCoverageShare, 1);
});

test("readiness blocking: anchors and rotated elements block, beacons and entrances do not", () => {
  const anchor = walkableGrid({ gridSize: { width: 3, height: 3 }, elements: [{ id: 1, type: "anchor", x: 1, y: 1 }] });
  assert.equal(anchor.walkable[1][1], false);
  assert.equal(anchor.walkable[0][0], true);

  const open = walkableGrid({ gridSize: { width: 3, height: 3 }, elements: [{ id: 1, type: "entrance", x: 0, y: 0 }, { id: 2, type: "beacon", x: 2, y: 2 }] });
  assert.equal(open.walkable.flat().filter(Boolean).length, 9);

  // 4 m long, 1 m wide, rotated by 90 degrees around its centre (4, 2.5): bounding box x in [3.5, 4.5], y in [0.5, 4.5].
  const rotated = walkableGrid({ gridSize: { width: 8, height: 8 }, elements: [{ id: 1, type: "shelf", x: 2, y: 2, width: 4, height: 1, rotation: 90 }] });
  const blocked = rotated.walkable.flatMap((row, j) => row.flatMap((free, i) => (free ? [] : [`${i},${j}`])));
  assert.deepEqual(blocked.sort(), [0, 1, 2, 3, 4].flatMap((j) => [3, 4].map((i) => `${i},${j}`)).sort());
});

test("a beacon just outside the grid still counts for the border cells", () => {
  const layout: CoverageInput = { gridSize: { width: 4, height: 4 }, elements: [{ id: 1, type: "beacon", x: -1, y: 0 }] };
  const grid = coverageCounts(layout, undefined, 2);
  assert.equal(grid.counts[0][0], 1);
  assert.equal(grid.counts[0][3], 0);
});

test("coverage for a 60 x 80 layout with 30 beacons runs in under 500 ms", () => {
  const elements: CoverageInput["elements"] = [];
  for (let index = 0; index < 4; index++) {
    elements.push({ id: index + 1, type: "shelf", x: 6, y: 6 + index * 16, width: 40, height: 2, category: "310/1" });
  }
  for (let index = 0; index < 30; index++) {
    elements.push({ id: 100 + index, type: "beacon", x: 5 + (index % 6) * 10, y: 5 + Math.floor(index / 6) * 14 });
  }
  const layout: CoverageInput = { gridSize: { width: 60, height: 80 }, elements };
  const started = performance.now();
  const grid = coverageCounts(layout, undefined, coverageRule.radiusMeters);
  const elapsed = performance.now() - started;
  assert.equal(beaconPoints(layout).length, 30);
  assert.equal(grid.counts.length, 80);
  assert.ok(elapsed < 500, `Berechnung dauerte ${elapsed.toFixed(1)} ms`);
});
