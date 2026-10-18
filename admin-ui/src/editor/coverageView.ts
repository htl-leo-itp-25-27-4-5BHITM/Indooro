/**
 * Pure presentation helpers for the beacon coverage overlay (text, cell classes, SVG path data).
 * No React and no DOM access, so the node:test suite can cover them.
 */
import type { CoverageCounts, CoverageRule, CoverageSummary } from "./coverage";

/** Layouts with more walkable cells than this are computed in the coverage Web Worker. */
export const COVERAGE_WORKER_THRESHOLD = 5000;

export const COVERAGE_COLORS = { low: "#c23b42", exact: "#e0a800", high: "#2e9d5b" } as const;

export type CellClass = "blocked" | "low" | "exact" | "high";

/** Formats a share in [0, 1] as a percentage with one decimal and a German decimal comma, e.g. "87,5". */
export function formatPercent(share: number): string {
  const tenths = Math.round(share * 1000) / 10;
  return tenths.toFixed(1).replace(".", ",");
}

/** "87,5 % der Fläche mit ≥ 3 Beacons" */
export function formatCoverageSummary(summary: Pick<CoverageSummary, "coveredShare">, minBeacons: number): string {
  return `${formatPercent(summary.coveredShare)} % der Fläche mit ≥ ${minBeacons} Beacons`;
}

/** "Lücken: 4,2 % unter der Schwelle (erlaubt: 5,0 %)" */
export function formatGapLine(summary: Pick<CoverageSummary, "lowCoverageShare">, rule: Pick<CoverageRule, "maxLowCoverageShare">): string {
  return `Lücken: ${formatPercent(summary.lowCoverageShare)} % unter der Schwelle (erlaubt: ${formatPercent(rule.maxLowCoverageShare)} %)`;
}

/** ok while the gap share stays at or below the allowed share; the boundary itself counts as ok. */
export function gapStatus(lowCoverageShare: number, maxLowCoverageShare: number): "ok" | "warn" {
  return lowCoverageShare <= maxLowCoverageShare + 1e-9 ? "ok" : "warn";
}

/** Class of one cell: blocked (null), gap (below k), exactly k, or more than k beacons. */
export function cellClass(count: number | null, minBeacons: number): CellClass {
  if (count === null) return "blocked";
  if (count < minBeacons) return "low";
  if (count === minBeacons) return "exact";
  return "high";
}

export interface CoverageLegendEntry {
  cls: Exclude<CellClass, "blocked">;
  label: string;
  color: string;
  hatched: boolean;
}

/** Legend entries: colour plus text, so the classes never depend on colour alone. */
export function coverageLegend(minBeacons: number): CoverageLegendEntry[] {
  return [
    { cls: "low", label: `unter ${minBeacons} Beacons (Lücke, schraffiert)`, color: COVERAGE_COLORS.low, hatched: true },
    { cls: "exact", label: `genau ${minBeacons}`, color: COVERAGE_COLORS.exact, hatched: false },
    { cls: "high", label: `mehr als ${minBeacons}`, color: COVERAGE_COLORS.high, hatched: false },
  ];
}

export interface CoveragePathData {
  low: string;
  exact: string;
  high: string;
}

/**
 * SVG path data per cell class, one run of equal cells per row merged into one rectangle.
 * Cell (i, j) covers the unit square from (i, j) to (i + 1, j + 1).
 */
export function coveragePathData(grid: Pick<CoverageCounts, "counts">, minBeacons: number): CoveragePathData {
  const paths: CoveragePathData = { low: "", exact: "", high: "" };
  grid.counts.forEach((row, j) => {
    let i = 0;
    while (i < row.length) {
      const cls = cellClass(row[i], minBeacons);
      let end = i + 1;
      while (end < row.length && cellClass(row[end], minBeacons) === cls) end++;
      if (cls !== "blocked") paths[cls] += `M${i} ${j}h${end - i}v1h${i - end}Z`;
      i = end;
    }
  });
  return paths;
}
