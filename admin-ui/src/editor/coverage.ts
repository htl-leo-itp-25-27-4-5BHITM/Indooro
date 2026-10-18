/**
 * Beacon coverage for the layout editor overlay: TypeScript port of the planner's readiness mirror
 * (scripts/beacon-planner/layout.py readiness_walkable_cells, coverage.py readiness_report and
 * backend StoreReadinessEvaluator). Pure module without DOM access, so it also runs in a Web Worker.
 *
 * Conventions (shared with the Python planner and checked by fixtures/vectors.json):
 * - 1 unit = 1 m. Cell (i, j) has its centre at (i + 0.5, j + 0.5).
 * - Grids are indexed [y][x]: walkable[j][i] and counts[j][i] belong to cell x = i, y = j.
 * - A beacon counts for a cell when the squared centre distance is <= radius squared.
 * - Blocking follows the readiness rule: every element except beacon and entrance blocks, anchors included.
 *   Rotated elements (rotation != 0) block the bounding box of the rotated rectangle.
 */
import ruleJson from "../../../backend/indooro_server/src/main/resources/readiness/coverage-rule.json" with { type: "json" };
import type { LayoutDocument } from "./model";

export interface CoverageRule {
  radiusMeters: number;
  minRadiusMeters: number;
  maxRadiusMeters: number;
  minBeaconsPerCell: number;
  maxLowCoverageShare: number;
}

export interface Point { x: number; y: number }

/** The layout parts the coverage needs; a parsed layout JSON satisfies it. */
export type CoverageInput = Pick<LayoutDocument, "gridSize" | "elements">;

export interface WalkableGrid {
  width: number;
  height: number;
  /** walkable[y][x] */
  walkable: boolean[][];
}

export interface CoverageCounts {
  width: number;
  height: number;
  /** counts[y][x]: beacons within the radius, or null for a blocked cell. */
  counts: (number | null)[][];
  walkableCells: number;
}

export interface CoverageSummary {
  coveredShare: number;
  lowCoverageShare: number;
  walkableCells: number;
  coveredCells: number;
}

const NON_BLOCKING_TYPES = new Set(["beacon", "entrance"]);
const JAVA_EPS = 1e-9;
const JAVA_CLAMP = 1e9;

/** Validates a rule document the same way the Java CoverageRule does. */
export function parseCoverageRule(value: unknown): CoverageRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Abdeckungsregel muss ein JSON-Objekt sein.");
  const root = value as Record<string, unknown>;
  const number = (field: string): number => {
    const candidate = root[field];
    if (typeof candidate !== "number" || !Number.isFinite(candidate)) throw new Error(`Abdeckungsregel: Feld '${field}' fehlt oder ist keine Zahl.`);
    return candidate;
  };
  const rule: CoverageRule = {
    radiusMeters: number("radiusMeters"),
    minRadiusMeters: number("minRadiusMeters"),
    maxRadiusMeters: number("maxRadiusMeters"),
    minBeaconsPerCell: number("minBeaconsPerCell"),
    maxLowCoverageShare: number("maxLowCoverageShare"),
  };
  if (!Number.isInteger(rule.minBeaconsPerCell)) throw new Error("Abdeckungsregel: Feld 'minBeaconsPerCell' fehlt oder ist keine ganze Zahl.");
  if (!(rule.minRadiusMeters > 0) || rule.minRadiusMeters > rule.maxRadiusMeters) {
    throw new Error("Abdeckungsregel: minRadiusMeters muss groesser als 0 und kleiner oder gleich maxRadiusMeters sein.");
  }
  if (!(rule.radiusMeters >= rule.minRadiusMeters && rule.radiusMeters <= rule.maxRadiusMeters)) {
    throw new Error("Abdeckungsregel: radiusMeters muss zwischen minRadiusMeters und maxRadiusMeters liegen.");
  }
  if (rule.minBeaconsPerCell < 1) throw new Error("Abdeckungsregel: minBeaconsPerCell muss mindestens 1 sein.");
  if (!(rule.maxLowCoverageShare >= 0 && rule.maxLowCoverageShare <= 1)) throw new Error("Abdeckungsregel: maxLowCoverageShare muss zwischen 0 und 1 liegen.");
  return Object.freeze(rule);
}

/** The one coverage rule of the project: the same JSON that StoreReadinessEvaluator and the planner read. */
export const coverageRule: CoverageRule = parseCoverageRule(ruleJson);

/** Clamps a radius to the [min, max] of the rule; a non-finite value falls back to the rule default. */
export function clampRadius(radius: number, rule: CoverageRule = coverageRule): number {
  if (!Number.isFinite(radius)) return rule.radiusMeters;
  return Math.min(rule.maxRadiusMeters, Math.max(rule.minRadiusMeters, radius));
}

const finiteNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

function gridDimensions(document: CoverageInput): { width: number; height: number } {
  const width = finiteNumber(document.gridSize?.width);
  const height = finiteNumber(document.gridSize?.height);
  if (width === undefined || height === undefined || width < 1 || height < 1) {
    throw new Error("gridSize.width und gridSize.height muessen Zahlen >= 1 sein.");
  }
  return { width: Math.trunc(width), height: Math.trunc(height) };
}

/** Bounding box {minX, maxX, minY, maxY} of the rectangle rotated around its centre (mirror of the Java helper). */
function rotatedBoundingBox(x: number, y: number, w: number, h: number, rotationDegrees: number): [number, number, number, number] {
  const centreX = x + w / 2;
  const centreY = y + h / 2;
  const radians = rotationDegrees * (Math.PI / 180);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const corners: Array<[number, number]> = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [cx, cy] of corners) {
    const dx = cx - centreX;
    const dy = cy - centreY;
    xs.push(centreX + dx * cosine - dy * sine);
    ys.push(centreY + dx * sine + dy * cosine);
  }
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
}

const clampCoordinate = (value: number) => Math.max(-JAVA_CLAMP, Math.min(JAVA_CLAMP, value));

/** Walkable cells under the readiness rule (see module comment). */
export function walkableGrid(document: CoverageInput): WalkableGrid {
  const { width, height } = gridDimensions(document);
  const walkable: boolean[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => true));
  for (const element of document.elements ?? []) {
    if (!element || typeof element !== "object") continue;
    const type = typeof element.type === "string" ? element.type : "";
    if (NON_BLOCKING_TYPES.has(type)) continue;
    const x = finiteNumber(element.x);
    const y = finiteNumber(element.y);
    if (x === undefined || y === undefined) continue;
    const w = finiteNumber(element.width) ?? 1;
    const h = finiteNumber(element.height) ?? 1;
    const rotation = finiteNumber(element.rotation);

    let x0: number;
    let x1: number;
    let y0: number;
    let y1: number;
    if (rotation !== undefined && rotation !== 0) {
      const [minX, maxX, minY, maxY] = rotatedBoundingBox(x, y, w, h, rotation);
      x0 = Math.floor(minX + JAVA_EPS);
      x1 = Math.ceil(maxX - JAVA_EPS);
      y0 = Math.floor(minY + JAVA_EPS);
      y1 = Math.ceil(maxY - JAVA_EPS);
      if (x1 <= x0) x1 = x0 + 1;
      if (y1 <= y0) y1 = y0 + 1;
    } else {
      x0 = Math.floor(clampCoordinate(x));
      x1 = x0 + Math.max(1, Math.ceil(clampCoordinate(w)));
      y0 = Math.floor(clampCoordinate(y));
      y1 = y0 + Math.max(1, Math.ceil(clampCoordinate(h)));
    }
    for (let j = Math.max(0, y0); j < Math.min(height, y1); j++) {
      for (let i = Math.max(0, x0); i < Math.min(width, x1); i++) walkable[j][i] = false;
    }
  }
  return { width, height, walkable };
}

/** Positions of all placed beacons (elements of type beacon with finite x and y). */
export function beaconPoints(document: CoverageInput): Point[] {
  const points: Point[] = [];
  for (const element of document.elements ?? []) {
    if (!element || typeof element !== "object" || element.type !== "beacon") continue;
    const x = finiteNumber(element.x);
    const y = finiteNumber(element.y);
    if (x !== undefined && y !== undefined) points.push({ x, y });
  }
  return points;
}

/**
 * Beacons within `radius` of each walkable cell centre. `beacons` defaults to the placed beacons of the document.
 * Blocked cells are null. Throws RangeError when the radius is not positive.
 */
export function coverageCounts(document: CoverageInput, beacons: readonly Point[] = beaconPoints(document), radius: number): CoverageCounts {
  if (!(radius > 0) || !Number.isFinite(radius)) throw new RangeError("radius muss groesser als 0 sein.");
  const grid = walkableGrid(document);
  const { width, height, walkable } = grid;
  const tally: number[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));
  const radiusSquared = radius * radius;
  let walkableCells = 0;
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) if (walkable[j][i]) walkableCells++;

  for (const beacon of beacons) {
    const i0 = Math.max(0, Math.floor(beacon.x - radius - 0.5));
    const i1 = Math.min(width - 1, Math.ceil(beacon.x + radius - 0.5));
    const j0 = Math.max(0, Math.floor(beacon.y - radius - 0.5));
    const j1 = Math.min(height - 1, Math.ceil(beacon.y + radius - 0.5));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (!walkable[j][i]) continue;
        const dx = (i + 0.5) - beacon.x;
        const dy = (j + 0.5) - beacon.y;
        if (dx * dx + dy * dy <= radiusSquared) tally[j][i]++;
      }
    }
  }

  const counts = walkable.map((row, j) => row.map((isWalkable, i) => (isWalkable ? tally[j][i] : null)));
  return { width, height, counts, walkableCells };
}

/** Share of walkable cells with at least `minBeacons` beacons. Without walkable cells coveredShare is 1 and lowCoverageShare 0. */
export function coverageSummary(grid: Pick<CoverageCounts, "counts">, minBeacons: number): CoverageSummary {
  let walkableCells = 0;
  let coveredCells = 0;
  for (const row of grid.counts) {
    for (const count of row) {
      if (count === null) continue;
      walkableCells++;
      if (count >= minBeacons) coveredCells++;
    }
  }
  if (walkableCells === 0) return { coveredShare: 1, lowCoverageShare: 0, walkableCells, coveredCells };
  return {
    coveredShare: coveredCells / walkableCells,
    lowCoverageShare: (walkableCells - coveredCells) / walkableCells,
    walkableCells,
    coveredCells,
  };
}

/** Number of walkable cells under the readiness rule; used to choose between inline and Web Worker computation. */
export function walkableCellCount(document: CoverageInput): number {
  let count = 0;
  for (const row of walkableGrid(document).walkable) for (const free of row) if (free) count++;
  return count;
}

export interface CoverageResult {
  grid: CoverageCounts;
  summary: CoverageSummary;
  beaconCount: number;
}

/** Counts and summary for one radius. Shared by the inline path and the coverage Web Worker. */
export function computeCoverage(document: CoverageInput, radius: number, minBeacons: number): CoverageResult {
  const beacons = beaconPoints(document);
  const grid = coverageCounts(document, beacons, radius);
  return { grid, summary: coverageSummary(grid, minBeacons), beaconCount: beacons.length };
}
