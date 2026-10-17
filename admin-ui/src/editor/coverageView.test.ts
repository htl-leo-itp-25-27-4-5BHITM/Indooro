import assert from "node:assert/strict";
import test from "node:test";
import { computeCoverage, coverageCounts, coverageRule, coverageSummary, walkableCellCount, type CoverageInput } from "./coverage";
import { cellClass, coveragePathData, coverageLegend, formatCoverageSummary, formatGapLine, formatPercent, gapStatus } from "./coverageView";

test("formatPercent uses one decimal and a German decimal comma", () => {
  assert.equal(formatPercent(0.875), "87,5");
  assert.equal(formatPercent(1), "100,0");
  assert.equal(formatPercent(0), "0,0");
  assert.equal(formatPercent(0.05), "5,0");
  assert.equal(formatPercent(1 / 3), "33,3");
});

test("summary line names the percentage, the rule's beacon count and the German wording", () => {
  assert.equal(formatCoverageSummary({ coveredShare: 0.875 }, 3), "87,5 % der Fläche mit ≥ 3 Beacons");
  assert.equal(formatGapLine({ lowCoverageShare: 0.125 }, { maxLowCoverageShare: 0.05 }), "Lücken: 12,5 % unter der Schwelle (erlaubt: 5,0 %)");
});

test("gap status is ok up to and including the allowed share, warn above it", () => {
  assert.equal(gapStatus(0.05, 0.05), "ok");
  assert.equal(gapStatus(0.04, 0.05), "ok");
  assert.equal(gapStatus(0.051, 0.05), "warn");
  assert.equal(gapStatus(0, 0.05), "ok");
});

test("cell classes for k = 3: below k is a gap, exactly k is yellow, above k is green, blocked is null", () => {
  assert.equal(cellClass(null, 3), "blocked");
  assert.equal(cellClass(0, 3), "low");
  assert.equal(cellClass(2, 3), "low");
  assert.equal(cellClass(3, 3), "exact");
  assert.equal(cellClass(4, 3), "high");
  assert.equal(cellClass(9, 3), "high");
});

test("legend names the classes in text as well as colour", () => {
  const legend = coverageLegend(3);
  assert.deepEqual(legend.map((entry) => entry.label), ["unter 3 Beacons (Lücke, schraffiert)", "genau 3", "mehr als 3"]);
  assert.deepEqual(legend.map((entry) => entry.hatched), [true, false, false]);
});

test("path data merges equal runs per row and skips blocked cells", () => {
  const paths = coveragePathData({ counts: [[0, 3, null], [4, 2, 5]] }, 3);
  assert.equal(paths.low, "M0 0h1v1h-1Z" + "M1 1h1v1h-1Z");
  assert.equal(paths.exact, "M1 0h1v1h-1Z");
  assert.equal(paths.high, "M0 1h1v1h-1Z" + "M2 1h1v1h-1Z");
});

test("path data for a long run is one rectangle per row", () => {
  const paths = coveragePathData({ counts: [[3, 3, 3, null, 3]] }, 3);
  assert.equal(paths.exact, "M0 0h3v1h-3Z" + "M4 0h1v1h-1Z");
  assert.equal(paths.low, "");
});

test("computeCoverage equals the separate counts and summary calls and reports the beacon count", () => {
  const layout: CoverageInput = {
    gridSize: { width: 12, height: 9 },
    elements: [
      { id: 1, type: "shelf", x: 2, y: 2, width: 3, height: 2 },
      { id: 2, type: "beacon", x: 5, y: 5 },
      { id: 3, type: "beacon", x: 9, y: 3 },
    ],
  };
  const radius = coverageRule.radiusMeters;
  const combined = computeCoverage(layout, radius, coverageRule.minBeaconsPerCell);
  const grid = coverageCounts(layout, undefined, radius);
  assert.deepEqual(combined.grid.counts, grid.counts);
  assert.deepEqual(combined.summary, coverageSummary(grid, coverageRule.minBeaconsPerCell));
  assert.equal(combined.beaconCount, 2);
  assert.equal(walkableCellCount(layout), grid.walkableCells);
});
