import type { Beacon, FloorElementType, FloorPlan, Point, PositionEstimate } from "../../core/types";
import { binValues, colorRamp, errorPointsFromEstimates, normalize } from "../../map/heatmap";
import { niceScaleBarLength } from "../../map/geometry";

/**
 * Pure, string-based SVG renderers for the report's floor-plan figures. No React, no DOM, no ResizeObserver:
 * the output depends only on the arguments, so identical inputs give byte-identical figures.
 *
 * Geometry: the plan is drawn in a nested <svg viewBox="0 0 W H"> (layout units) whose pixel size keeps the
 * aspect ratio W:H – never distorted. Legend and scale bar live outside the plan viewport in the outer canvas.
 */

export const MAX_FIGURE_POINTS = 3000;
export const DEFAULT_CELL_SIZE = 2;

const ELEMENT_STYLES: Record<FloorElementType, { fill: string; stroke: string; dash?: boolean }> = {
  shelf: { fill: "#d3dee5", stroke: "#8ba2b1" },
  checkout: { fill: "#ecdcb9", stroke: "#b9924a" },
  entrance: { fill: "#c3ece0", stroke: "#167768" },
  wall: { fill: "#4b6174", stroke: "#2f4556" },
  cooler: { fill: "#d2eaf3", stroke: "#5f9fba" },
  freezer: { fill: "#dde3f7", stroke: "#6f83c2" },
  counter: { fill: "#e6d8ca", stroke: "#a38465" },
  anchor: { fill: "none", stroke: "#27b9ab", dash: true },
  other: { fill: "#e5eaed", stroke: "#9aa9b3" },
};

const FONT = `font-family="Inter,ui-sans-serif,system-ui,sans-serif"`;
const INK = "#173047";
const MUTED = "#506779";

function esc(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const f = (v: number, d = 2): string => {
  const s = v.toFixed(d);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
const fmt = (v: number): string => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
/** heatmap cell labels: fixed one decimal so neighbouring cells are comparable at a glance */
const fmtCell = (v: number): string => v.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
const safeId = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, "-");

/** Deterministic thinning: keeps every k-th item (k = ceil(n / max)), always starting with the first. */
export function decimate<T>(items: T[], max = MAX_FIGURE_POINTS): { items: T[]; step: number; total: number } {
  if (items.length <= max) return { items, step: 1, total: items.length };
  const step = Math.ceil(items.length / max);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += step) out.push(items[i]);
  return { items: out, step, total: items.length };
}

export interface FigureCounts {
  /** valid estimates with truth (error defined) */
  valid: number;
  /** epochs with truth but without a position – never drawn */
  failed: number;
  /** valid estimates drawn after decimation */
  drawn: number;
  decimationStep: number;
  /** estimates with position but without truth (drawn grey, no error vector) */
  withoutTruth: number;
  /** valid estimates lying outside the plan (clipped by the viewport) */
  outsidePlan: number;
}

export function countEstimates(estimates: PositionEstimate[], plan?: Pick<FloorPlan, "width" | "height">): FigureCounts {
  let valid = 0;
  let failed = 0;
  let withoutTruth = 0;
  let outsidePlan = 0;
  for (const e of estimates) {
    if (e.position && e.truth && e.errorUnits !== null && Number.isFinite(e.errorUnits)) {
      valid++;
      if (plan && (e.position.x < 0 || e.position.y < 0 || e.position.x > plan.width || e.position.y > plan.height)) outsidePlan++;
    } else if (e.truth && !e.position) failed++;
    else if (e.position && !e.truth) withoutTruth++;
  }
  return { valid, failed, drawn: valid, decimationStep: 1, withoutTruth, outsidePlan };
}

export interface BaseFigureInput {
  plan: FloorPlan;
  beacons: Beacon[];
  estimates: PositionEstimate[];
  /** display unit: "m" only for a confirmed scale */
  unit: "m" | "LE";
  metersPerUnit: number;
  synthetic: boolean;
  title: string;
  /** makes pattern / gradient ids unique when several figures share one HTML document */
  idPrefix: string;
  /** outer canvas width in px (default 720) */
  pixelWidth?: number;
}

export interface FloorPlanFigureInput extends BaseFigureInput {
  /** distinct ground-truth positions (layout units) */
  references: Point[];
  maxPoints?: number;
}

export interface FigureResult {
  svg: string;
  counts: FigureCounts;
}

const toDisplay = (units: number, unit: "m" | "LE", mpu: number): number => (unit === "m" ? units * mpu : units);

interface Frame {
  s: number; // px per layout unit
  margin: number;
  planW: number;
  planH: number;
  canvasW: number;
}

function frame(plan: { width: number; height: number }, pixelWidth: number): Frame {
  const margin = 16;
  const s = (pixelWidth - 2 * margin) / Math.max(1e-9, plan.width);
  return { s, margin, planW: plan.width * s, planH: plan.height * s, canvasW: pixelWidth };
}

function elementsSvg(plan: FloorPlan, k: number): string {
  return plan.elements
    .map((el) => {
      const st = ELEMENT_STYLES[el.type] ?? ELEMENT_STYLES.other;
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const tf = el.rotationDeg ? ` transform="rotate(${f(el.rotationDeg)} ${f(cx)} ${f(cy)})"` : "";
      return `<rect class="el el-${el.type}" x="${f(el.x)}" y="${f(el.y)}" width="${f(el.width)}" height="${f(el.height)}" fill="${st.fill}" fill-opacity="0.92" stroke="${st.stroke}" stroke-width="${f(k)}"${st.dash ? ` stroke-dasharray="${f(4 * k)} ${f(3 * k)}"` : ""}${tf}/>`;
    })
    .join("");
}

function gridSvg(plan: FloorPlan, k: number): string {
  let d = "";
  for (let x = 0; x <= plan.width; x++) d += `M${x} 0V${plan.height}`;
  for (let y = 0; y <= plan.height; y++) d += `M0 ${y}H${plan.width}`;
  return `<path d="${d}" stroke="#e6edf0" stroke-width="${f(0.75 * k)}" fill="none"/>`;
}

function beaconsSvg(beacons: Beacon[], k: number, planWidth: number): string {
  // labels of beacons in the right fifth are anchored to the left so they stay inside the plan
  const rightHalf = (b: Beacon): boolean => b.position.x > planWidth * 0.8;
  return beacons
    .map(
      (b) =>
        `<g class="beacon"><circle cx="${f(b.position.x)}" cy="${f(b.position.y)}" r="${f(4.5 * k)}" fill="${b.enabled ? "#102a3b" : "#ffffff"}" stroke="${b.enabled ? "#7edcc6" : "#7f95a4"}" stroke-width="${f(1.5 * k)}"/><text x="${f(b.position.x + (rightHalf(b) ? -6 : 6) * k)}" y="${f(b.position.y - 6 * k)}" font-size="${f(9 * k)}"${rightHalf(b) ? ' text-anchor="end"' : ""} ${FONT} fill="${INK}">${esc(b.label ?? b.id)}</text></g>`,
    )
    .join("");
}

function scaleBarSvg(fr: Frame, plan: FloorPlan, unit: "m" | "LE", mpu: number): string {
  const lenUnits = niceScaleBarLength(plan.width / 5);
  const label = unit === "m" ? `${fmt(lenUnits * mpu)} m` : `${fmt(lenUnits)} LE`;
  const x0 = fr.margin;
  const y = fr.margin + fr.planH + 14;
  return `<g class="scalebar"><path d="M${f(x0)} ${f(y)}h${f(lenUnits * fr.s)}M${f(x0)} ${f(y - 3)}v6M${f(x0 + lenUnits * fr.s)} ${f(y - 3)}v6" stroke="${INK}" stroke-width="1.2" fill="none"/><text x="${f(x0 + lenUnits * fr.s + 6)}" y="${f(y + 3.5)}" font-size="10" ${FONT} fill="${INK}">${label}</text></g>`;
}

function syntheticTag(width: number): string {
  return `<g class="synthetic-tag"><rect x="${width - 112}" y="4" width="104" height="18" rx="3" fill="#fff4e8" stroke="#b45309" stroke-width="1.5"/><text x="${width - 60}" y="17" font-size="10.5" font-weight="800" text-anchor="middle" ${FONT} fill="#b45309">SYNTHETISCH</text></g>`;
}

function gradientBar(id: string, x: number, y: number, w: number, h: number): string {
  const stops = Array.from({ length: 7 }, (_, i) => `<stop offset="${f((i / 6) * 100, 1)}%" stop-color="${colorRamp(i / 6, "error")}"/>`).join("");
  return `<defs><linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#${id})" stroke="#7f95a4" stroke-width="0.8"/>`;
}

function legendRowY(fr: Frame): number {
  return fr.margin + fr.planH + 34;
}

function wrapSvg(fr: Frame, canvasH: number, title: string, desc: string, inner: string, synthetic: boolean): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(fr.canvasW)} ${f(canvasH)}" width="${f(fr.canvasW)}" height="${f(canvasH)}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title><desc>${esc(desc)}</desc><rect width="${f(fr.canvasW)}" height="${f(canvasH)}" fill="#ffffff"/>${inner}${synthetic ? syntheticTag(fr.canvasW) : ""}</svg>`;
}

/** Plan viewport: nested svg with viewBox = plan size (layout units); the aspect ratio of width/height equals W:H. */
function planViewport(fr: Frame, plan: FloorPlan, body: string): string {
  return `<svg class="plan" x="${fr.margin}" y="${fr.margin}" width="${f(fr.planW)}" height="${f(fr.planH)}" viewBox="0 0 ${f(plan.width)} ${f(plan.height)}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><rect width="${f(plan.width)}" height="${f(plan.height)}" fill="#ffffff"/>${body}</svg><rect x="${fr.margin}" y="${fr.margin}" width="${f(fr.planW)}" height="${f(fr.planH)}" fill="none" stroke="#7f95a4" stroke-width="1.2"/>`;
}

/* ------------------------------------------------------------------ */
/* Per result: floor plan with estimates and error vectors             */
/* ------------------------------------------------------------------ */

export function renderFloorPlanSvg(input: FloorPlanFigureInput): FigureResult {
  const { plan, beacons, estimates, unit, metersPerUnit, synthetic, title, idPrefix } = input;
  const fr = frame(plan, input.pixelWidth ?? 720);
  const k = 1 / fr.s; // 1 px in layout units
  const counts = countEstimates(estimates, plan);

  const validEst = estimates.filter((e) => e.position && e.truth && e.errorUnits !== null && Number.isFinite(e.errorUnits));
  const dec = decimate(validEst, input.maxPoints ?? MAX_FIGURE_POINTS);
  counts.drawn = dec.items.length;
  counts.decimationStep = dec.step;
  const errs = validEst.map((e) => toDisplay(e.errorUnits as number, unit, metersPerUnit));
  const maxErr = errs.length ? Math.max(...errs) : 0;
  // large errors are drawn last so they stay visible
  const drawItems = [...dec.items].sort((a, b) => (a.errorUnits as number) - (b.errorUnits as number));
  const noTruthDec = decimate(
    estimates.filter((e) => e.position && !e.truth),
    input.maxPoints ?? MAX_FIGURE_POINTS,
  ).items;

  const vectors = drawItems
    .map((e) => {
      const p = e.position as Point;
      const t = e.truth as Point;
      return `<line x1="${f(t.x)}" y1="${f(t.y)}" x2="${f(p.x)}" y2="${f(p.y)}"/>`;
    })
    .join("");
  const points = drawItems
    .map((e) => {
      const p = e.position as Point;
      const col = colorRamp(normalize(toDisplay(e.errorUnits as number, unit, metersPerUnit), 0, maxErr), "error");
      return `<circle class="est" cx="${f(p.x)}" cy="${f(p.y)}" r="${f(2.6 * k)}" fill="${col}" stroke="#ffffff" stroke-width="${f(0.5 * k)}"/>`;
    })
    .join("");
  const grey = noTruthDec
    .map((e) => `<circle class="est-notruth" cx="${f((e.position as Point).x)}" cy="${f((e.position as Point).y)}" r="${f(2.4 * k)}" fill="#9aa9b3" stroke="#ffffff" stroke-width="${f(0.5 * k)}"/>`)
    .join("");
  const refs = input.references
    .map((r) => {
      const a = 3.2 * k;
      return `<path class="ref" d="M${f(r.x - a)} ${f(r.y)}L${f(r.x)} ${f(r.y - a)}L${f(r.x + a)} ${f(r.y)}L${f(r.x)} ${f(r.y + a)}Z" fill="#ffffff" stroke="${INK}" stroke-width="${f(1.1 * k)}"/>`;
    })
    .join("");

  const body = `${gridSvg(plan, k)}${elementsSvg(plan, k)}<g class="vectors" stroke="#506779" stroke-opacity="0.55" stroke-width="${f(0.8 * k)}">${vectors}</g>${grey}${beaconsSvg(beacons, k, plan.width)}${refs}${points}`;

  const ly = legendRowY(fr);
  const barX = fr.margin + 260;
  const legend = `<g class="legend"><circle cx="${fr.margin + 6}" cy="${ly + 6}" r="4.5" fill="#102a3b" stroke="#7edcc6" stroke-width="1.5"/><text x="${fr.margin + 16}" y="${ly + 9.5}" font-size="10" ${FONT} fill="${INK}">Beacon</text><path d="M${fr.margin + 76} ${ly + 6}l5 -5l5 5l-5 5z" fill="#fff" stroke="${INK}" stroke-width="1.1"/><text x="${fr.margin + 92}" y="${ly + 9.5}" font-size="10" ${FONT} fill="${INK}">Referenzpunkt</text><line x1="${fr.margin + 172}" y1="${ly + 6}" x2="${fr.margin + 192}" y2="${ly + 6}" stroke="#506779" stroke-opacity="0.7" stroke-width="1"/><text x="${fr.margin + 198}" y="${ly + 9.5}" font-size="10" ${FONT} fill="${INK}">Fehlervektor</text><text x="${barX + 20}" y="${ly + 9.5}" font-size="10" ${FONT} fill="${INK}">Schätzung, Fehler:</text>${gradientBar(`${safeId(idPrefix)}-grad`, barX + 120, ly, 120, 11)}<text x="${barX + 120}" y="${ly + 23}" font-size="9.5" ${FONT} fill="${MUTED}">0 ${unit}</text><text x="${barX + 240}" y="${ly + 23}" font-size="9.5" text-anchor="end" ${FONT} fill="${MUTED}">${fmt(maxErr)} ${unit}</text></g>`;
  const inner = `${planViewport(fr, plan, body)}${scaleBarSvg(fr, plan, unit, metersPerUnit)}${legend}`;
  const desc = `Grundriss ${plan.width} × ${plan.height} LE; ${counts.valid} gültige Schätzungen, ${counts.failed} Fehlschläge`;
  return { svg: wrapSvg(fr, ly + 36, title, desc, inner, synthetic), counts };
}

/* ------------------------------------------------------------------ */
/* Per result: binned mean-error heatmap                               */
/* ------------------------------------------------------------------ */

export interface HeatmapFigureInput extends BaseFigureInput {
  cellSize?: number;
}

export interface HeatmapFigureResult extends FigureResult {
  cellSize: number;
  cellsWithData: number;
  cellsWithoutData: number;
}

/**
 * Mean error per cell, only in cells that contain ground-truth positions (error attributed to the truth position,
 * mean over all valid estimates there). No interpolation: cells without data are hatched, never coloured.
 */
export function renderErrorHeatmapSvg(input: HeatmapFigureInput): HeatmapFigureResult {
  const { plan, beacons, estimates, unit, metersPerUnit, synthetic, title, idPrefix } = input;
  const cellSize = input.cellSize ?? DEFAULT_CELL_SIZE;
  const fr = frame(plan, input.pixelWidth ?? 720);
  const k = 1 / fr.s;
  const counts = countEstimates(estimates, plan);
  const cells = binValues(errorPointsFromEstimates(estimates), cellSize);
  const display = cells.map((c) => toDisplay(c.value, unit, metersPerUnit));
  const maxV = display.length ? Math.max(...display) : 0;
  const byKey = new Map(cells.map((c, i) => [`${c.ix}|${c.iy}`, { cell: c, v: display[i] }]));
  const nx = Math.ceil(plan.width / cellSize - 1e-9);
  const ny = Math.ceil(plan.height / cellSize - 1e-9);
  const hatchId = `${safeId(idPrefix)}-hatch`;

  let rects = "";
  let withData = 0;
  let without = 0;
  const showText = cellSize * fr.s >= 26;
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = ix * cellSize;
      const y = iy * cellSize;
      const w = Math.min(cellSize, plan.width - x);
      const h = Math.min(cellSize, plan.height - y);
      const hit = byKey.get(`${ix}|${iy}`);
      if (hit) {
        withData++;
        const t = normalize(hit.v, 0, maxV);
        rects += `<rect class="cell data" data-n="${hit.cell.n}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${colorRamp(t, "error")}" stroke="#ffffff" stroke-width="${f(0.8 * k)}"/>`;
        if (showText) rects += `<text x="${f(x + w / 2)}" y="${f(y + h / 2)}" font-size="${f(9 * k)}" text-anchor="middle" dominant-baseline="central" ${FONT} fill="${t > 0.7 ? "#ffffff" : INK}">${fmtCell(hit.v)}</text>`;
      } else {
        without++;
        rects += `<rect class="cell nodata" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="url(#${hatchId})" stroke="#e6edf0" stroke-width="${f(0.8 * k)}"/>`;
      }
    }
  }
  const u6 = f(6 * k);
  const pat = `<defs><pattern id="${hatchId}" patternUnits="userSpaceOnUse" width="${u6}" height="${u6}" patternTransform="rotate(45)"><rect width="${u6}" height="${u6}" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="${u6}" stroke="#b8c6cf" stroke-width="${f(1.2 * k)}"/></pattern></defs>`;
  const outline = plan.elements
    .map((el) => {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      return `<rect x="${f(el.x)}" y="${f(el.y)}" width="${f(el.width)}" height="${f(el.height)}"${el.rotationDeg ? ` transform="rotate(${f(el.rotationDeg)} ${f(cx)} ${f(cy)})"` : ""}/>`;
    })
    .join("");
  const body = `${pat}${rects}<g class="el-outline" fill="none" stroke="#4b6174" stroke-opacity="0.45" stroke-width="${f(0.8 * k)}">${outline}</g>${beaconsSvg(beacons, k, plan.width)}`;

  const ly = legendRowY(fr);
  const barX = fr.margin + 250;
  const legend = `<g class="legend"><rect x="${fr.margin}" y="${ly}" width="14" height="11" fill="url(#${hatchId})" stroke="#b8c6cf" stroke-width="0.8"/><text x="${fr.margin + 20}" y="${ly + 9.5}" font-size="10" ${FONT} fill="${INK}">keine Daten</text><circle cx="${fr.margin + 100}" cy="${ly + 6}" r="4.5" fill="#102a3b" stroke="#7edcc6" stroke-width="1.5"/><text x="${fr.margin + 110}" y="${ly + 9.5}" font-size="10" ${FONT} fill="${INK}">Beacon</text><text x="${barX}" y="${ly + 9.5}" font-size="10" ${FONT} fill="${INK}">Mittlerer Fehler je Zelle:</text>${gradientBar(`${safeId(idPrefix)}-grad`, barX + 130, ly, 120, 11)}<text x="${barX + 130}" y="${ly + 23}" font-size="9.5" ${FONT} fill="${MUTED}">0 ${unit}</text><text x="${barX + 250}" y="${ly + 23}" font-size="9.5" text-anchor="end" ${FONT} fill="${MUTED}">${fmt(maxV)} ${unit}</text></g>`;
  const inner = `${planViewport(fr, plan, body)}${scaleBarSvg(fr, plan, unit, metersPerUnit)}${legend}`;
  const desc = `Fehler-Heatmap, Zellgröße ${cellSize} LE, ${withData} Zellen mit Daten, ${without} ohne`;
  return { svg: wrapSvg(fr, ly + 36, title, desc, inner, synthetic), counts, cellSize, cellsWithData: withData, cellsWithoutData: without };
}
