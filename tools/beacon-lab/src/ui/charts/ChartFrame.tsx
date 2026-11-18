import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { formatTick } from "./math";
import type { Scale } from "./math";

/** Literal colours (not CSS variables) so that a chart serialised to a standalone SVG renders identically. */
export const CHART_THEME = {
  ink: "#173047",
  muted: "#506779",
  line: "#dce5e9",
  grid: "#e9eff2",
  synthetic: "#b45309",
  font: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
} as const;

export const FALLBACK_WIDTH = 640;

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface Geometry {
  width: number;
  height: number;
  margin: Margin;
  /** inner plot area size */
  iw: number;
  ih: number;
}
export interface LegendItem {
  label: string;
  color: string;
  kind?: "line" | "dot" | "box" | "dashed";
}
export interface HoverRow {
  color?: string;
  label: string;
  value: string;
}
export interface HoverInfo {
  /** x position in inner-plot pixels for the crosshair */
  px: number;
  header?: string;
  rows: HoverRow[];
  dots?: { x: number; y: number; color: string }[];
  /** draw the vertical crosshair (default true) */
  crosshair?: boolean;
}
export interface ChartCommonProps {
  /** accessible name; also used as <title> */
  title: string;
  description?: string;
  height?: number;
  /** fixed width in px; otherwise measured with ResizeObserver (fallback 640 where unavailable) */
  width?: number;
  /** renders a visible "SYNTHETISCH" tag in the chart corner */
  synthetic?: boolean;
  className?: string;
}

/** Measures the container width with ResizeObserver; falls back to a fixed width (jsdom, SSR). */
export function useContainerWidth(fixed?: number, fallback = FALLBACK_WIDTH) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number>(fixed ?? fallback);
  useEffect(() => {
    if (fixed !== undefined) return;
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const measured = el.getBoundingClientRect().width;
      if (measured > 0) setW(Math.floor(measured));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fixed]);
  return { ref, width: fixed ?? w };
}

/** Left margin wide enough for the given tick labels (+ rotated axis label). */
export function leftMargin(labels: string[], hasAxisLabel: boolean): number {
  const longest = labels.reduce((m, l) => Math.max(m, l.length), 1);
  return Math.round(14 + longest * 6.4 + (hasAxisLabel ? 18 : 0));
}

function legendLayout(items: LegendItem[], width: number) {
  const rows: { item: LegendItem; x: number; y: number }[] = [];
  let x = 0;
  let row = 0;
  for (const item of items) {
    const w = 26 + item.label.length * 6.3 + 14;
    if (x + w > width && x > 0) {
      x = 0;
      row++;
    }
    rows.push({ item, x, y: row * 18 });
    x += w;
  }
  return { rows, height: items.length ? (row + 1) * 18 : 0 };
}

function LegendSwatch({ item }: { item: LegendItem }) {
  const c = item.color;
  switch (item.kind) {
    case "dot":
      return <circle cx={8} cy={0} r={3.5} fill={c} fillOpacity={0.8} />;
    case "box":
      return <rect x={1} y={-5} width={14} height={10} rx={2} fill={c} fillOpacity={0.5} stroke={c} />;
    case "dashed":
      return <line x1={0} x2={16} y1={0} y2={0} stroke={c} strokeWidth={2} strokeDasharray="4 3" />;
    default:
      return <line x1={0} x2={16} y1={0} y2={0} stroke={c} strokeWidth={2.5} strokeLinecap="round" />;
  }
}

export interface ChartFrameProps extends ChartCommonProps {
  margin?: Partial<Margin>;
  legend?: LegendItem[];
  children: (g: Geometry) => ReactNode;
  hover?: (px: number, py: number, g: Geometry) => HoverInfo | null;
}

/**
 * Shared chart shell: responsive width, accessible <svg role="img">, legend, synthetic tag and the hover
 * crosshair + tooltip. The result is a self-contained SVG (inline fonts/colours) so it can be exported.
 */
export function ChartFrame({ title, description, height = 280, width: fixedWidth, synthetic, className, margin, legend = [], children, hover }: ChartFrameProps) {
  const { ref, width } = useContainerWidth(fixedWidth);
  const [h, setH] = useState<{ px: number; py: number } | null>(null);
  const lg = legendLayout(legend, Math.max(100, width - 24));
  const m: Margin = {
    top: (margin?.top ?? 14) + (lg.height ? lg.height + 6 : 0) + (synthetic && !lg.height ? 4 : 0),
    right: margin?.right ?? 16,
    bottom: margin?.bottom ?? 44,
    left: margin?.left ?? 52,
  };
  const g: Geometry = { width, height, margin: m, iw: Math.max(10, width - m.left - m.right), ih: Math.max(10, height - m.top - m.bottom) };
  const info = h && hover ? hover(h.px, h.py, g) : null;

  const tooltipLeft = info ? m.left + info.px + 14 : 0;
  const flip = info ? tooltipLeft > width * 0.62 : false;

  return (
    <div ref={ref} className={`bl-chart relative w-full ${className ?? ""}`} style={{ width: fixedWidth }}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={title}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        fontFamily={CHART_THEME.font}
        fontSize={11}
        style={{ display: "block", maxWidth: "100%" }}
      >
        <title>{title}</title>
        {description && <desc>{description}</desc>}
        <rect x={0} y={0} width={width} height={height} fill="#ffffff" />
        {legend.length > 0 && (
          <g transform="translate(12,16)" data-testid="chart-legend">
            {lg.rows.map(({ item, x, y }) => (
              <g key={item.label} transform={`translate(${x},${y})`}>
                <LegendSwatch item={item} />
                <text x={22} y={4} fill={CHART_THEME.ink} fontSize={11}>
                  {item.label}
                </text>
              </g>
            ))}
          </g>
        )}
        {synthetic && (
          <g data-testid="synthetic-tag" transform={`translate(${width - 104},6)`}>
            <rect width={96} height={20} rx={4} fill={CHART_THEME.synthetic} />
            <text x={48} y={14} textAnchor="middle" fill="#ffffff" fontSize={10.5} fontWeight={700} letterSpacing={1}>
              SYNTHETISCH
            </text>
          </g>
        )}
        <g transform={`translate(${m.left},${m.top})`}>
          {children(g)}
          {info && (
            <g pointerEvents="none" data-testid="chart-crosshair">
              {info.crosshair !== false && <line x1={info.px} x2={info.px} y1={0} y2={g.ih} stroke={CHART_THEME.muted} strokeDasharray="3 3" />}
              {info.dots?.map((d, i) => (
                <circle key={i} cx={d.x} cy={d.y} r={4} fill={d.color} stroke="#fff" strokeWidth={1.5} />
              ))}
            </g>
          )}
          {hover && (
            <rect
              data-testid="chart-hit"
              x={0}
              y={0}
              width={g.iw}
              height={g.ih}
              fill="transparent"
              onMouseMove={(e) => {
                const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setH({ px: Math.min(g.iw, Math.max(0, e.clientX - box.left - m.left)), py: Math.min(g.ih, Math.max(0, e.clientY - box.top - m.top)) });
              }}
              onMouseLeave={() => setH(null)}
            />
          )}
        </g>
      </svg>
      {info && (
        <div
          role="status"
          data-testid="chart-tooltip"
          className="pointer-events-none absolute z-20 min-w-32 rounded-lg border border-line bg-white px-2.5 py-2 text-xs shadow-lg"
          style={{ top: m.top + 4, ...(flip ? { right: width - (m.left + info.px) + 14 } : { left: tooltipLeft }) }}
        >
          {info.header && <div className="tabular mb-1 font-semibold text-ink">{info.header}</div>}
          {info.rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted">
                {r.color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />}
                {r.label}
              </span>
              <span className="tabular font-medium text-ink">{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- axes ---------------- */

export interface AxisProps {
  scale: Scale;
  ticks: number[];
  format?: (v: number) => string;
  label?: string;
  grid?: boolean;
}

export function YAxis({ scale, ticks, format, label, g, grid = true }: AxisProps & { g: Geometry }) {
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const fmt = format ?? ((v: number) => formatTick(v, step));
  return (
    <g data-testid="y-axis">
      {ticks.map((t) => {
        const y = scale(t);
        return (
          <g key={t}>
            {grid && <line x1={0} x2={g.iw} y1={y} y2={y} stroke={CHART_THEME.grid} />}
            <line x1={-4} x2={0} y1={y} y2={y} stroke={CHART_THEME.muted} />
            <text x={-8} y={y} dy="0.32em" textAnchor="end" fill={CHART_THEME.muted}>
              {fmt(t)}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={0} y1={0} y2={g.ih} stroke={CHART_THEME.muted} />
      {label && (
        <text transform={`translate(${-g.margin.left + 12},${g.ih / 2}) rotate(-90)`} textAnchor="middle" fill={CHART_THEME.ink} fontSize={11.5}>
          {label}
        </text>
      )}
    </g>
  );
}

export function XAxis({ scale, ticks, format, label, g, grid = false }: AxisProps & { g: Geometry }) {
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const fmt = format ?? ((v: number) => formatTick(v, step));
  return (
    <g data-testid="x-axis" transform={`translate(0,${g.ih})`}>
      {ticks.map((t) => {
        const x = scale(t);
        return (
          <g key={t}>
            {grid && <line x1={x} x2={x} y1={-g.ih} y2={0} stroke={CHART_THEME.grid} />}
            <line x1={x} x2={x} y1={0} y2={4} stroke={CHART_THEME.muted} />
            <text x={x} y={17} textAnchor="middle" fill={CHART_THEME.muted}>
              {fmt(t)}
            </text>
          </g>
        );
      })}
      <line x1={0} x2={g.iw} y1={0} y2={0} stroke={CHART_THEME.muted} />
      {label && (
        <text x={g.iw / 2} y={36} textAnchor="middle" fill={CHART_THEME.ink} fontSize={11.5}>
          {label}
        </text>
      )}
    </g>
  );
}

/** Horizontal (y) or vertical (x) dashed guide with a small label. */
export function ReferenceLine({ orientation, at, scale, length, label, color = CHART_THEME.muted }: { orientation: "h" | "v"; at: number; scale: Scale; length: number; label?: string; color?: string }) {
  const p = scale(at);
  return orientation === "h" ? (
    <g data-testid="reference-line">
      <line x1={0} x2={length} y1={p} y2={p} stroke={color} strokeDasharray="5 4" strokeWidth={1.25} />
      {label && (
        <text x={length - 4} y={p - 4} textAnchor="end" fill={color} fontSize={10.5}>
          {label}
        </text>
      )}
    </g>
  ) : (
    <g data-testid="reference-line">
      <line x1={p} x2={p} y1={0} y2={length} stroke={color} strokeDasharray="5 4" strokeWidth={1.25} />
      {label && (
        <text x={p + 4} y={10} fill={color} fontSize={10.5}>
          {label}
        </text>
      )}
    </g>
  );
}

/** Builds an SVG path "M…L…" with gaps where y is null/NaN. */
export function linePath(points: { x: number; y: number | null }[], sx: Scale, sy: Scale): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (p.y === null || !Number.isFinite(p.y) || !Number.isFinite(p.x)) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`;
    pen = true;
  }
  return d;
}

/** Dots as one path of zero-length round-capped segments (cheap even for 10 000 points). */
export function dotsPath(points: { x: number; y: number | null }[], sx: Scale, sy: Scale): string {
  let d = "";
  for (const p of points) {
    if (p.y === null || !Number.isFinite(p.y) || !Number.isFinite(p.x)) continue;
    d += `M${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}h0`;
  }
  return d;
}
