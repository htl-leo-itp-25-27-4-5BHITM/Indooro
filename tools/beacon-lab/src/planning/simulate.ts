/**
 * Platzierungssimulation – deterministische Monte-Carlo-MODELLPROGNOSE (keine Messung).
 *
 * Für jede begehbare Zelle werden K Epochen gezogen: je aktivem Beacon
 *   RSSI = A − 10·n·log10(d_m) + N(0, σ) − Penalty·(Anzahl durchquerter blockierender Elemente)
 * Beacons unter Empfindlichkeit (bzw. unter der RSSI-Schwelle des Verfahrens) werden verworfen, dann läuft das
 * gewählte Verfahren (ALGORITHMS[...]) auf dieser EINEN Epoche (kein RSSI- und kein Zeitfilter).
 * Vereinfachungen siehe docs/PLACEMENT_SIMULATION.md (kein Mehrwege-Modell, keine Körperabschattung,
 * Wände/Regale nur als optionale konstante Dämpfung entlang der Sichtlinie).
 *
 * Determinismus: Das Rauschen jedes (Zelle, Epoche, Beacon)-Tripels wird aus einem Hash von
 * (Seed, Zelle, Epoche, Beacon-ID) gezogen (mulberry32). Dadurch ist das Ergebnis unabhängig von Reihenfolge,
 * Chunking und Stride, und Layout-Varianten verwenden dieselben Zufallszahlen („common random numbers“) –
 * Differenzen zwischen Varianten sind dann kein Rauschen.
 */
import type { AlgorithmId, AlgorithmParams, Beacon, FloorPlan, PathLossModel } from "../core/types";
import { DEFAULT_POSITIONING_CONFIG } from "../core/defaults";
import { gaussian, mulberry32 } from "../core/random";
import { ALGORITHMS, type AlgorithmContext } from "../positioning/algorithms";
import { median, percentile } from "../positioning/stats";
import { isBlocking, pointInElement, segmentIntersectsElement, walkableGrid, type WalkableCell } from "./walkable";

export interface SimModelParams {
  /** RSSI bei 1 m (dBm) */
  rssiAt1m: number;
  pathLossExponent: number;
  /** Schattierungs-Standardabweichung σ (dB), unabhängig je Epoche und Beacon */
  shadowingStdDb: number;
  /** Empfängerempfindlichkeit (dBm): schwächere Signale werden nicht empfangen */
  sensitivityDbm: number;
  /** Zusatzdämpfung (dB) je durchquertem blockierenden Element auf der Sichtlinie; 0 = aus */
  obstaclePenaltyDb: number;
}

export interface SimSettings {
  /** Epochen je Zelle */
  samplesPerCell: number;
  /** nur jede stride-te Zelle in x und y simulieren (1 = alle) */
  stride: number;
  seed: number;
  /** Rasterweite in LE */
  cellSize: number;
}

export interface SimInput {
  plan: FloorPlan;
  beacons: Beacon[];
  algorithm: AlgorithmId;
  algorithmParams: AlgorithmParams;
  model: SimModelParams;
  settings: SimSettings;
}

export const DEFAULT_SIM_MODEL: SimModelParams = {
  rssiAt1m: -72,
  pathLossExponent: 2.8,
  shadowingStdDb: 3,
  sensitivityDbm: -100,
  obstaclePenaltyDb: 0,
};

export const DEFAULT_SIM_SETTINGS: SimSettings = { samplesPerCell: 30, stride: 1, seed: 1, cellSize: 1 };

export function defaultSimInput(plan: FloorPlan, beacons: Beacon[], pathLoss?: PathLossModel): SimInput {
  return {
    plan,
    beacons,
    algorithm: DEFAULT_POSITIONING_CONFIG.algorithm,
    algorithmParams: { ...DEFAULT_POSITIONING_CONFIG.params },
    model: {
      ...DEFAULT_SIM_MODEL,
      ...(pathLoss ? { rssiAt1m: pathLoss.rssiAt1m, pathLossExponent: pathLoss.pathLossExponent } : {}),
    },
    settings: { ...DEFAULT_SIM_SETTINGS },
  };
}

/** Ergebnis je Zelle. Alle Fehlerwerte in Layout-Einheiten (LE). */
export interface CellResult {
  ix: number;
  iy: number;
  x: number;
  y: number;
  /** Median der Fehler über erfolgreiche Epochen; null, wenn alle Epochen scheiterten */
  medianError: number | null;
  p90Error: number | null;
  /** Anteil der Epochen ohne Positionsschätzung (0..1) */
  failureRate: number;
  /** mittlere Anzahl hörbarer Beacons */
  meanAudible: number;
  /** Median der 2D-HDOP über Epochen mit ≥ 3 hörbaren Beacons; null, wenn nie ≥ 3 */
  hdop: number | null;
}

export interface SimResult {
  cells: CellResult[];
  /** Kantenlänge einer dargestellten Zelle in LE (= cellSize · stride) */
  displayCellSize: number;
  /** Anzahl begehbarer Zellen im vollen Raster (vor Stride) */
  walkableCellCount: number;
  unit: "m" | "LE";
  metersPerUnit: number;
  warnings: string[];
  input: SimInput;
  elapsedMs: number;
}

export const HDOP_CAP = 99;

/** 2D-HDOP aus Einheitsvektoren Zelle→Beacon; null bei < 3 Beacons, HDOP_CAP bei kollinearer Geometrie. */
export function hdop2d(from: { x: number; y: number }, beacons: readonly { x: number; y: number }[]): number | null {
  if (beacons.length < 3) return null;
  let a = 0;
  let b = 0;
  let d = 0;
  for (const p of beacons) {
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const ux = dx / len;
    const uy = dy / len;
    a += ux * ux;
    b += ux * uy;
    d += uy * uy;
  }
  const det = a * d - b * b;
  if (!(det > 1e-9)) return HDOP_CAP;
  return Math.min(HDOP_CAP, Math.sqrt((a + d) / det));
}

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mix(a: number, b: number): number {
  let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ b;
  h = Math.imul(h ^ (h >>> 16), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Schattierungs-Zufallswert N(0,1) für ein (Zelle, Epoche, Beacon)-Tripel. */
function noise(seed: number, cellKey: number, k: number, beaconHash: number): number {
  return gaussian(mulberry32(mix(mix(mix(seed >>> 0, cellKey), k), beaconHash)));
}

interface Prepared {
  input: SimInput;
  beacons: Beacon[];
  hashes: number[];
  ctx: AlgorithmContext;
  mPerUnit: number;
  threshold: number;
  blockers: FloorPlan["elements"];
  warnings: string[];
  cells: WalkableCell[];
  walkableCount: number;
  displayCellSize: number;
}

function prepare(input: SimInput): Prepared {
  const { plan, model, settings } = input;
  const grid = walkableGrid(plan, settings.cellSize);
  const stride = Math.max(1, Math.floor(settings.stride) || 1);
  const cells = grid.cells.filter((c) => c.ix % stride === 0 && c.iy % stride === 0);
  // Eigene Pfadverlustmodelle einzelner Beacons werden ignoriert: die Prognose nutzt EIN Modell.
  const beacons = input.beacons.filter((b) => b.enabled).map((b) => ({ ...b, pathLoss: undefined }));
  const pathLoss: PathLossModel = { rssiAt1m: model.rssiAt1m, pathLossExponent: model.pathLossExponent, source: "manual" };
  const warnings: string[] = [];
  if (!plan.scale.confirmed) warnings.push("Maßstab nicht bestätigt: Ergebnisse in Layout-Einheiten (LE), nicht in Metern.");
  if (beacons.length === 0) warnings.push("Keine aktiven Beacons: es gibt keine Positionsschätzung.");
  if (model.obstaclePenaltyDb > 0) warnings.push("Hindernisdämpfung aktiv: vereinfachtes Modell (konstante dB je durchquertem Element).");
  const rt = input.algorithmParams.rssiThreshold;
  return {
    input,
    beacons,
    hashes: beacons.map((b) => fnv(b.id)),
    ctx: { beacons, plan, pathLoss, params: input.algorithmParams },
    mPerUnit: plan.scale.metersPerUnit > 0 ? plan.scale.metersPerUnit : 1,
    threshold: Math.max(model.sensitivityDbm, Number.isFinite(rt) ? rt : -Infinity),
    blockers: model.obstaclePenaltyDb > 0 ? plan.elements.filter(isBlocking) : [],
    warnings,
    cells,
    walkableCount: grid.cells.length,
    displayCellSize: grid.cellSize * stride,
  };
}

function simulateCell(p: Prepared, cell: WalkableCell): CellResult {
  const { model, settings } = p.input;
  const K = Math.max(1, Math.floor(settings.samplesPerCell) || 1);
  const alg = ALGORITHMS[p.input.algorithm];
  const cellKey = mix(cell.ix, cell.iy);
  const nb = p.beacons.length;
  const mean = new Array<number>(nb);
  for (let j = 0; j < nb; j++) {
    const bp = p.beacons[j].position;
    const dm = Math.max(Math.hypot(bp.x - cell.x, bp.y - cell.y) * p.mPerUnit, 0.1);
    let pen = 0;
    if (p.blockers.length > 0) {
      let crossed = 0;
      for (const el of p.blockers) {
        if (pointInElement(bp, el)) continue; // Beacon sitzt auf/in diesem Element: nicht mitzählen
        if (segmentIntersectsElement(cell, bp, el)) crossed++;
      }
      pen = crossed * model.obstaclePenaltyDb;
    }
    mean[j] = model.rssiAt1m - 10 * model.pathLossExponent * Math.log10(dm) - pen;
  }

  const errors: number[] = [];
  const hdops: number[] = [];
  let failures = 0;
  let audibleSum = 0;
  for (let k = 0; k < K; k++) {
    const obs: { beaconId: string; rssi: number }[] = [];
    const pos: { x: number; y: number }[] = [];
    for (let j = 0; j < nb; j++) {
      const rssi = mean[j] + (model.shadowingStdDb > 0 ? model.shadowingStdDb * noise(settings.seed, cellKey, k, p.hashes[j]) : 0);
      if (rssi < p.threshold) continue;
      obs.push({ beaconId: p.beacons[j].id, rssi });
      pos.push(p.beacons[j].position);
    }
    audibleSum += obs.length;
    const h = hdop2d(cell, pos);
    if (h !== null) hdops.push(h);
    const out = obs.length > 0 ? alg.estimate({ t: k, observations: obs }, p.ctx) : { position: null };
    if (out.position === null) failures++;
    else errors.push(Math.hypot(out.position.x - cell.x, out.position.y - cell.y));
  }
  return {
    ix: cell.ix,
    iy: cell.iy,
    x: cell.x,
    y: cell.y,
    medianError: errors.length ? median(errors) : null,
    p90Error: errors.length ? percentile(errors, 90) : null,
    failureRate: failures / K,
    meanAudible: audibleSum / K,
    hdop: hdops.length ? median(hdops) : null,
  };
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

function finish(p: Prepared, cells: CellResult[], t0: number): SimResult {
  return {
    cells,
    displayCellSize: p.displayCellSize,
    walkableCellCount: p.walkableCount,
    unit: p.input.plan.scale.confirmed ? "m" : "LE",
    metersPerUnit: p.mPerUnit,
    warnings: p.warnings,
    input: p.input,
    elapsedMs: now() - t0,
  };
}

/** Synchrone Simulation (Tests, kleine Pläne). */
export function simulate(input: SimInput): SimResult {
  const t0 = now();
  const p = prepare(input);
  return finish(
    p,
    p.cells.map((c) => simulateCell(p, c)),
    t0,
  );
}

export interface AsyncOptions {
  /** Zellen je Chunk (Standard 60) */
  chunkCells?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: { cancelled: boolean };
}

/**
 * Chunked-Variante: gibt zwischen den Chunks per setTimeout an die Event-Loop zurück, damit die UI reagiert.
 * (Bewusst kein Web Worker: die Rechenzeit liegt bei Standardeinstellungen deutlich unter 2 s; der Main-Thread-Ansatz
 * bleibt ohne Bundler-Sonderfälle testbar.) Liefert exakt dasselbe Ergebnis wie simulate(); bei Abbruch null.
 */
export async function simulateAsync(input: SimInput, opts: AsyncOptions = {}): Promise<SimResult | null> {
  const t0 = now();
  const p = prepare(input);
  const chunk = Math.max(1, opts.chunkCells ?? 60);
  const out: CellResult[] = [];
  for (let i = 0; i < p.cells.length; i += chunk) {
    if (opts.signal?.cancelled) return null;
    for (const c of p.cells.slice(i, i + chunk)) out.push(simulateCell(p, c));
    opts.onProgress?.(Math.min(i + chunk, p.cells.length), p.cells.length);
    await new Promise<void>((r) => setTimeout(r, 0));
  }
  if (opts.signal?.cancelled) return null;
  return finish(p, out, t0);
}
