import { useId, useMemo } from "react";
import type { MapScale } from "../core/types";
import { distanceUnit, toDisplayDistance } from "../core/units";
import {
  binValues,
  colorRamp,
  idwGrid,
  normalize,
  rampGradientCss,
  valueRange,
  type ColorScaleKind,
  type HeatPoint,
  type HeatmapMode,
} from "./heatmap";
import { formatPosition } from "./layers";
import { useMap } from "./MapContext";

export interface HeatmapOptions {
  mode?: HeatmapMode;
  /** cell size (layout units) for "binned" and "idw" */
  cellSize?: number;
  /** IDW exponent p (default 2) */
  idwPower?: number;
  /** IDW: maximum distance (layout units) to a real measurement (default 3) */
  maxDistance?: number;
  /** colour scale: "sequential" (RSSI, counts) or "error" */
  colorScale?: ColorScaleKind;
  /** fixed colour domain [min,max]; default = data range */
  domain?: [number, number];
  /** reverse the ramp (e.g. so that small values are bright) */
  reversed?: boolean;
}

export interface HeatmapLayerProps extends HeatmapOptions {
  points: HeatPoint[];
  /** unit of the values for tooltips, e.g. "dBm" (distances in LE are handled by the caller) */
  unit?: string;
  /** what the value is, e.g. "Mittlerer RSSI" */
  quantity?: string;
  valueDigits?: number;
}

export function resolveDomain(points: HeatPoint[], domain?: [number, number]): [number, number] {
  if (domain) return domain;
  const r = valueRange(points.map((p) => p.value));
  return r ? [r.min, r.max] : [0, 1];
}

/**
 * Measurement heatmap. Default "points" mode draws coloured circles only at real measurement positions.
 * "binned" shows only cells containing data; "idw" interpolates only within maxDistance of a real
 * measurement. Everything else is hatched ("keine Daten"). Real measurement points are always on top.
 */
export function HeatmapLayer({
  points,
  mode = "points",
  cellSize = 1,
  idwPower = 2,
  maxDistance = 3,
  colorScale = "sequential",
  domain,
  reversed = false,
  unit = "",
  quantity = "Wert",
  valueDigits = 1,
}: HeatmapLayerProps) {
  const { layers, plan, pxPerUnit, scale, interactive } = useMap();
  const patternId = useId().replace(/:/g, "");
  const [lo, hi] = useMemo(() => resolveDomain(points, domain), [points, domain]);
  const color = (v: number) => {
    const t = normalize(v, lo, hi);
    return colorRamp(reversed ? 1 - t : t, colorScale);
  };

  const binned = useMemo(() => (mode === "binned" ? binValues(points, cellSize) : []), [mode, points, cellSize]);
  const idw = useMemo(
    () =>
      mode === "idw"
        ? idwGrid(points, { cellSize, width: plan.width, height: plan.height, power: idwPower, maxDistance })
        : [],
    [mode, points, cellSize, plan.width, plan.height, idwPower, maxDistance],
  );

  if (!layers.heatmap) return null;
  const fmt = (v: number) => `${v.toFixed(valueDigits)}${unit ? ` ${unit}` : ""}`;
  const hatchSize = 7 / pxPerUnit;

  const dots = points.map((p, i) => {
    const n = p.n && p.n > 0 ? p.n : 1;
    const rPx = mode === "points" ? Math.min(14, Math.max(4.5, 3.2 * Math.sqrt(n))) : 3;
    const detail = {
      kind: "cell" as const,
      id: `heat-${i}`,
      title: quantity,
      lines: [
        `${fmt(p.value)}${p.n ? ` · n = ${p.n}` : ""}`,
        `Position: ${formatPosition(p.position, scale)}`,
        "Echte Messposition",
      ],
      position: p.position,
    };
    return (
      <circle
        key={`pt${i}`}
        cx={p.position.x}
        cy={p.position.y}
        r={rPx / pxPerUnit}
        fill={color(p.value)}
        fillOpacity={mode === "points" ? 0.88 : 1}
        stroke={mode === "points" ? "#ffffff" : "#102a3b"}
        strokeWidth={mode === "points" ? 1 : 1.2}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: "pointer" }}
        {...interactive(detail)}
      >
        <title>{`${quantity}: ${fmt(p.value)}`}</title>
      </circle>
    );
  });

  return (
    <g data-testid="layer-heatmap" data-mode={mode}>
      {mode !== "points" && (
        <>
          <defs>
            <pattern id={`hatch-${patternId}`} patternUnits="userSpaceOnUse" width={hatchSize} height={hatchSize} patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={hatchSize} stroke="#9fb1bd" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.55} />
            </pattern>
          </defs>
          <rect x={0} y={0} width={plan.width} height={plan.height} fill={`url(#hatch-${patternId})`} pointerEvents="none">
            <title>keine Daten</title>
          </rect>
        </>
      )}
      {mode === "binned" &&
        binned.map((c) => {
          const detail = {
            kind: "cell" as const,
            id: `bin-${c.ix}-${c.iy}`,
            title: `${quantity} (Zelle)`,
            lines: [
              `Mittelwert: ${fmt(c.value)}`,
              `${c.points} Messposition${c.points === 1 ? "" : "en"} · n = ${c.n}`,
              `Zelle: ${formatPosition({ x: c.x, y: c.y }, scale)} · ${c.size} LE`,
            ],
            position: { x: c.x + c.size / 2, y: c.y + c.size / 2 },
          };
          return (
            <rect
              key={`b${c.ix}-${c.iy}`}
              x={c.x}
              y={c.y}
              width={c.size}
              height={c.size}
              fill={color(c.value)}
              fillOpacity={0.85}
              stroke="#ffffff"
              strokeWidth={0.75}
              vectorEffect="non-scaling-stroke"
              {...interactive(detail)}
            />
          );
        })}
      {mode === "idw" &&
        idw.map((c) => {
          if (c.value === null) return null;
          const w = Math.min(c.size, plan.width - c.x);
          const h = Math.min(c.size, plan.height - c.y);
          return (
            <rect
              key={`i${c.ix}-${c.iy}`}
              x={c.x}
              y={c.y}
              width={w}
              height={h}
              fill={color(c.value)}
              fillOpacity={0.72}
              pointerEvents="none"
              shapeRendering="crispEdges"
            />
          );
        })}
      {dots}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* legend                                                               */
/* ------------------------------------------------------------------ */

export interface HeatmapLegendProps extends HeatmapOptions {
  points: HeatPoint[];
  unit: string;
  /** e.g. "Mittlerer RSSI von Beacon A" */
  title: string;
  scale?: MapScale;
  valueDigits?: number;
  className?: string;
}

/** Legend with min/max/unit, the method text and the "keine Daten" swatch. */
export function HeatmapLegend({
  points,
  unit,
  title,
  scale,
  mode = "points",
  cellSize = 1,
  idwPower = 2,
  maxDistance = 3,
  colorScale = "sequential",
  domain,
  reversed = false,
  valueDigits = 1,
  className = "",
}: HeatmapLegendProps) {
  const [lo, hi] = resolveDomain(points, domain);
  const gradient = rampGradientCss(colorScale);
  const distText = (u: number) =>
    scale?.confirmed ? `${u} LE (≈ ${toDisplayDistance(u, scale).toFixed(1)} ${distanceUnit(scale)})` : `${u} LE`;
  const method =
    mode === "idw"
      ? `INTERPOLIERT (IDW, p=${idwPower}, max ${distText(maxDistance)})`
      : mode === "binned"
        ? `Zellen ${distText(cellSize)} – nur Zellen mit Messungen`
        : "Gemessene Positionen – keine Interpolation";
  return (
    <div className={`rounded-lg border border-line bg-white px-3 py-2 text-xs ${className}`} data-testid="heatmap-legend">
      <div className="mb-1 font-medium text-brand">
        {title} <span className="font-normal text-muted">({unit})</span>
      </div>
      <div className="h-2 w-full max-w-[240px] rounded-sm" style={{ background: gradient, transform: reversed ? "scaleX(-1)" : undefined }} />
      <div className="tabular flex max-w-[240px] justify-between text-muted">
        <span>{lo.toFixed(valueDigits)}</span>
        <span>{hi.toFixed(valueDigits)}</span>
      </div>
      <div className={`mt-1 ${mode === "idw" ? "font-semibold text-synthetic" : "text-muted"}`}>{method}</div>
      {mode !== "points" && (
        <div className="mt-1 flex items-center gap-1.5 text-muted">
          <svg width="16" height="12" aria-hidden="true">
            <defs>
              <pattern id="legend-hatch" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="5" stroke="#9fb1bd" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="16" height="12" fill="url(#legend-hatch)" stroke="#cfdbe1" />
          </svg>
          keine Daten
        </div>
      )}
      <div className="mt-0.5 text-muted">
        <span className="tabular">{points.length}</span> Messpositionen
        {mode === "points" ? " · Kreisgröße ∝ √n" : " · echte Messpunkte als Punkte dargestellt"}
      </div>
    </div>
  );
}
