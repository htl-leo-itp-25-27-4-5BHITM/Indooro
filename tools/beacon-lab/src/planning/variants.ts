/**
 * Layout-Varianten, Vergleich und heuristischer Vorschlag für die Platzierungssimulation (MODELLPROGNOSE).
 * Nichts hier schreibt in die Kampagne; Varianten sind reine Kopien der Beacon-Liste.
 */
import type { Beacon, Point } from "../core/types";
import { mean } from "../positioning/stats";
import { simulateAsync, type CellResult, type SimInput, type SimResult } from "./simulate";
import { isBlocking, walkableGrid, type WalkableCell } from "./walkable";

/* ------------------------------------------------------------------ */
/* Varianten                                                           */
/* ------------------------------------------------------------------ */

export type BeaconEdit =
  | { kind: "add"; beacon: Beacon }
  | { kind: "remove"; id: string }
  | { kind: "move"; id: string; position: Point }
  | { kind: "toggle"; id: string };

/** Wendet Änderungen der Reihe nach auf eine KOPIE der Beacon-Liste an (Eingabe bleibt unverändert). */
export function applyEdits(base: readonly Beacon[], edits: readonly BeaconEdit[]): Beacon[] {
  let out = base.map((b) => ({ ...b, position: { ...b.position } }));
  for (const e of edits) {
    switch (e.kind) {
      case "add":
        out.push({ ...e.beacon, position: { ...e.beacon.position } });
        break;
      case "remove":
        out = out.filter((b) => b.id !== e.id);
        break;
      case "move":
        out = out.map((b) => (b.id === e.id ? { ...b, position: { ...e.position } } : b));
        break;
      case "toggle":
        out = out.map((b) => (b.id === e.id ? { ...b, enabled: !b.enabled } : b));
        break;
    }
  }
  return out;
}

/** Neue, noch unbenutzte Beacon-ID „PLAN-1“, „PLAN-2“, … */
export function nextPlannedId(beacons: readonly Beacon[], prefix = "PLAN"): string {
  const used = new Set(beacons.map((b) => b.id));
  for (let i = 1; ; i++) if (!used.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}

export function makePlannedBeacon(beacons: readonly Beacon[], position: Point): Beacon {
  const id = nextPlannedId(beacons);
  return { id, label: "geplant", position: { ...position }, enabled: true };
}

/* ------------------------------------------------------------------ */
/* Zusammenfassung                                                     */
/* ------------------------------------------------------------------ */

export interface SimSummary {
  /** simulierte Zellen */
  cells: number;
  /** Anteile (0..1) der simulierten Zellen mit Median-Fehler ≤ Schwelle; Zellen ohne Schätzung zählen als „nicht innerhalb“ */
  within: { threshold: number; share: number }[];
  meanAudible: number | null;
  /** Zellen mit im Mittel < 3 hörbaren Beacons (Trilateration unmöglich) */
  cellsUnder3: number;
  shareUnder3: number | null;
  /** Median der Zell-Mediane (nur Zellen mit Schätzung), in Einheit der Ergebnisse */
  medianOfMedians: number | null;
  /** Anteil Zellen, in denen mehr als die Hälfte der Epochen scheitert */
  shareMostlyFailing: number | null;
  /** schlechteste 10 % der Zellen (nach Median-Fehler, Zellen ohne Schätzung zuerst) */
  worst10: CellResult[];
  /** Mittelwert des Median-Fehlers in den schlechtesten 10 % (ohne Schätzung: failCap) */
  worst10MeanError: number | null;
  unit: "m" | "LE";
}

function toLE(valueDisplay: number, r: Pick<SimResult, "unit" | "metersPerUnit">): number {
  return r.unit === "m" ? valueDisplay / r.metersPerUnit : valueDisplay;
}

/** Worst-first-Sortierschlüssel: Zellen ohne Schätzung gelten als unendlich schlecht. */
function badness(c: CellResult): number {
  return c.medianError === null ? Infinity : c.medianError;
}

export function worstCells(cells: readonly CellResult[], fraction = 0.1): CellResult[] {
  if (cells.length === 0) return [];
  const n = Math.max(1, Math.ceil(cells.length * fraction));
  return [...cells].sort((a, b) => badness(b) - badness(a) || a.iy - b.iy || a.ix - b.ix).slice(0, n);
}

/** Obergrenze, mit der „keine Schätzung“ in Mittelwerten zählt: Plandiagonale in LE. */
export function failCapLE(r: SimResult): number {
  return Math.hypot(r.input.plan.width, r.input.plan.height);
}

/** `thresholds` in der Anzeigeeinheit des Ergebnisses (m bei bestätigtem Maßstab, sonst LE). */
export function summarize(r: SimResult, thresholds: readonly number[] = [2, 3, 5]): SimSummary {
  const n = r.cells.length;
  const within = thresholds.map((t) => {
    const tLE = toLE(t, r);
    const hit = r.cells.filter((c) => c.medianError !== null && c.medianError <= tLE).length;
    return { threshold: t, share: n ? hit / n : 0 };
  });
  const under3 = r.cells.filter((c) => c.meanAudible < 3).length;
  const medians = r.cells.map((c) => c.medianError).filter((v): v is number => v !== null);
  const w = worstCells(r.cells);
  const cap = failCapLE(r);
  const disp = (le: number | null) => (le === null ? null : r.unit === "m" ? le * r.metersPerUnit : le);
  const mm = medians.length ? [...medians].sort((a, b) => a - b)[Math.floor((medians.length - 1) / 2)] : null;
  return {
    cells: n,
    within,
    meanAudible: n ? mean(r.cells.map((c) => c.meanAudible)) : null,
    cellsUnder3: under3,
    shareUnder3: n ? under3 / n : null,
    medianOfMedians: disp(mm),
    shareMostlyFailing: n ? r.cells.filter((c) => c.failureRate > 0.5).length / n : null,
    worst10: w,
    worst10MeanError: w.length ? disp(mean(w.map((c) => c.medianError ?? cap))) : null,
    unit: r.unit,
  };
}

/* ------------------------------------------------------------------ */
/* Vergleich A/B                                                       */
/* ------------------------------------------------------------------ */

export interface DeltaCell {
  ix: number;
  iy: number;
  x: number;
  y: number;
  /** Median-Fehler B − A in LE; negativ = Variante B besser. null, wenn eine Seite keine Schätzung hat. */
  delta: number | null;
  /** both = beide haben Schätzung; gained = nur B; lost = nur A; none = keine */
  status: "both" | "gained" | "lost" | "none";
  a: CellResult;
  b: CellResult;
}

export interface Comparison {
  cells: DeltaCell[];
  summaryA: SimSummary;
  summaryB: SimSummary;
  /** Zellen, in denen B klar besser / schlechter ist (|Δ| > tolerance LE oder gained/lost) */
  improved: number;
  worsened: number;
  meanDelta: number | null;
}

export function compareResults(a: SimResult, b: SimResult, thresholds: readonly number[] = [2, 3, 5], toleranceLE = 0.05): Comparison {
  const bMap = new Map(b.cells.map((c) => [`${c.ix}|${c.iy}`, c]));
  const cells: DeltaCell[] = [];
  for (const ca of a.cells) {
    const cb = bMap.get(`${ca.ix}|${ca.iy}`);
    if (!cb) continue;
    const status: DeltaCell["status"] =
      ca.medianError !== null && cb.medianError !== null ? "both" : cb.medianError !== null ? "gained" : ca.medianError !== null ? "lost" : "none";
    cells.push({
      ix: ca.ix,
      iy: ca.iy,
      x: ca.x,
      y: ca.y,
      delta: status === "both" ? (cb.medianError as number) - (ca.medianError as number) : null,
      status,
      a: ca,
      b: cb,
    });
  }
  let improved = 0;
  let worsened = 0;
  for (const c of cells) {
    if (c.status === "gained" || (c.delta !== null && c.delta < -toleranceLE)) improved++;
    else if (c.status === "lost" || (c.delta !== null && c.delta > toleranceLE)) worsened++;
  }
  const deltas = cells.map((c) => c.delta).filter((v): v is number => v !== null);
  return { cells, summaryA: summarize(a, thresholds), summaryB: summarize(b, thresholds), improved, worsened, meanDelta: mean(deltas) };
}

/* ------------------------------------------------------------------ */
/* Heuristischer Vorschlag                                             */
/* ------------------------------------------------------------------ */

export type Objective =
  /** maximiere den Anteil der Zellen mit Median-Fehler ≤ thresholdLE */
  | { kind: "share-within"; thresholdLE: number }
  /** minimiere den mittleren Median-Fehler der schlechtesten 10 % der Zellen */
  | { kind: "worst10" };

/** Höher = besser. */
export function objectiveScore(r: SimResult, obj: Objective): number {
  if (r.cells.length === 0) return 0;
  if (obj.kind === "share-within") {
    return r.cells.filter((c) => c.medianError !== null && c.medianError <= obj.thresholdLE).length / r.cells.length;
  }
  const cap = failCapLE(r);
  const w = worstCells(r.cells);
  return -(mean(w.map((c) => c.medianError ?? cap)) ?? cap);
}

/**
 * Kandidatenpositionen: begehbare Zellen, die an ein blockierendes Element oder den Planrand grenzen
 * (8er-Nachbarschaft), mind. `minDistance` LE von bestehenden Beacons entfernt; gleichmäßig auf `max` ausgedünnt.
 */
export function candidatePositions(
  input: Pick<SimInput, "plan" | "beacons">,
  opts: { max?: number; minDistance?: number; cellSize?: number } = {},
): WalkableCell[] {
  const { plan, beacons } = input;
  const grid = walkableGrid(plan, opts.cellSize ?? 1);
  const walk = new Set(grid.cells.map((c) => `${c.ix}|${c.iy}`));
  const minD = opts.minDistance ?? 1.5;
  const active = beacons.filter((b) => b.enabled);
  const blockers = plan.elements.filter(isBlocking);
  const near = (c: WalkableCell): boolean => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = c.ix + dx;
        const ny = c.iy + dy;
        if (nx < 0 || ny < 0 || nx >= grid.cols || ny >= grid.rows) return true; // Planrand
        if (!walk.has(`${nx}|${ny}`) && blockers.length > 0) return true; // blockierende Nachbarzelle
      }
    return false;
  };
  const all = grid.cells.filter((c) => near(c) && active.every((b) => Math.hypot(b.position.x - c.x, b.position.y - c.y) >= minD));
  const max = opts.max ?? 24;
  if (all.length <= max) return all;
  const out: WalkableCell[] = [];
  for (let i = 0; i < max; i++) out.push(all[Math.floor((i * all.length) / max)]);
  return out;
}

export interface Suggestion {
  position: Point;
  /** Zielfunktion vor / nach dem Hinzufügen (gleiche Reduktion der Simulation für beide) */
  baseScore: number;
  score: number;
  /** score − baseScore; > 0 = besser */
  improvement: number;
  /** Zellen, deren Median-Fehler sich verbessert hat */
  improvedCells: number;
}

export interface SuggestOptions {
  objective: Objective;
  topN?: number;
  maxCandidates?: number;
  /** reduzierte Simulation für die Suche (Standard: K = 12, Stride = 2) */
  samplesPerCell?: number;
  stride?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

/**
 * Heuristik: je Kandidat EIN zusätzlicher Beacon, Bewertung nach Zielfunktion, Rangliste. Gieriger Einzelschritt,
 * kein globales Optimum, nur Hinweis. Wird nie automatisch übernommen.
 */
export async function suggestBeacon(base: SimInput, opts: SuggestOptions): Promise<Suggestion[] | null> {
  const reduced = (beacons: Beacon[]): SimInput => ({
    ...base,
    beacons,
    settings: {
      ...base.settings,
      samplesPerCell: opts.samplesPerCell ?? Math.min(base.settings.samplesPerCell, 12),
      stride: Math.max(base.settings.stride, opts.stride ?? 2),
    },
  });
  const baseRes = await simulateAsync(reduced(base.beacons), { chunkCells: 400, signal: opts.signal });
  if (!baseRes) return null;
  const baseScore = objectiveScore(baseRes, opts.objective);
  const candidates = candidatePositions(base, { max: opts.maxCandidates ?? 24 });
  const baseMap = new Map(baseRes.cells.map((c) => [`${c.ix}|${c.iy}`, c]));
  const out: Suggestion[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (opts.signal?.cancelled) return null;
    const c = candidates[i];
    const res = await simulateAsync(reduced([...base.beacons, makePlannedBeacon(base.beacons, c)]), { chunkCells: 400, signal: opts.signal });
    if (!res) return null;
    const score = objectiveScore(res, opts.objective);
    let improvedCells = 0;
    for (const cell of res.cells) {
      const b = baseMap.get(`${cell.ix}|${cell.iy}`);
      if (!b) continue;
      if ((b.medianError === null && cell.medianError !== null) || (b.medianError !== null && cell.medianError !== null && cell.medianError < b.medianError - 0.05)) improvedCells++;
    }
    out.push({ position: { x: c.x, y: c.y }, baseScore, score, improvement: score - baseScore, improvedCells });
    opts.onProgress?.(i + 1, candidates.length);
  }
  out.sort((a, b) => b.improvement - a.improvement || a.position.y - b.position.y || a.position.x - b.position.x);
  return out.slice(0, opts.topN ?? 5);
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/**
 * CSV im Stil von scripts/beacon-planner (minor, x, y, mount, notes), aber Koordinaten in LAYOUT-EINHEITEN
 * (Spalten x_le/y_le, nicht Meter). Nur aktive Beacons.
 */
export function beaconsToCsv(beacons: readonly Beacon[]): string {
  const rows = beacons
    .filter((b) => b.enabled)
    .map((b, i) => `${i + 1},${round(b.position.x)},${round(b.position.y)},,${csvCell(b.label === "geplant" ? `geplant (${b.id})` : `Bestand ${b.id}`)}`);
  return ["minor,x_le,y_le,mount,notes", ...rows].join("\n") + "\n";
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function round(v: number): string {
  return String(Math.round(v * 100) / 100);
}
