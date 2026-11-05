import { ChartFrame, ReferenceLine, XAxis, YAxis } from "./ChartFrame";
import type { ChartCommonProps } from "./ChartFrame";
import { ecdf, ecdfAt, extent, formatTick, linearScale, niceTicks, seriesColor } from "./math";

export interface CdfSeries {
  id: string;
  label: string;
  /** sorted or unsorted error values of VALID estimates */
  values: number[];
  /** denominator incl. failed epochs; the curve then plateaus below 100 % (end-to-end view) */
  total?: number;
  color?: string;
}
export interface CdfChartProps extends ChartCommonProps {
  series: CdfSeries[];
  /** display unit of the errors: "m" or "LE" */
  unit: "m" | "LE";
  /** vertical guide lines (in display unit); default 2, 3, 5 */
  guides?: number[];
}

const pct = (p: number) => `${(p * 100).toFixed(1)} %`;

/** Empirical cumulative distribution of the positioning error as step lines. */
export function CdfChart({ series, unit, guides = [2, 3, 5], ...frame }: CdfChartProps) {
  const curves = series.map((s) => ecdf(s.values, s.total));
  const e = extent(curves.flatMap((c) => c.map((p) => p.x))) ?? [0, 1];
  const xMax = Math.max(e[1], ...guides);
  const xTicks = niceTicks(0, xMax, 7);
  const xd: [number, number] = [0, xTicks[xTicks.length - 1]];
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <ChartFrame
      {...frame}
      margin={{ left: 56 }}
      legend={series.map((s, i) => ({ label: s.label, color: s.color ?? seriesColor(i), kind: "line" as const }))}
      hover={(px, _py, g) => {
        const sx = linearScale(xd, [0, g.iw]);
        const x = sx.invert(px);
        return {
          px,
          header: `Fehler ≤ ${formatTick(x, 0.01)} ${unit}`,
          rows: series.map((s, i) => ({ color: s.color ?? seriesColor(i), label: s.label, value: pct(ecdfAt(curves[i], x)) })),
          dots: series.map((s, i) => ({ x: px, y: linearScale([0, 1], [g.ih, 0])(ecdfAt(curves[i], x)), color: s.color ?? seriesColor(i) })),
        };
      }}
    >
      {(g) => {
        const sx = linearScale(xd, [0, g.iw]);
        const sy = linearScale([0, 1], [g.ih, 0]);
        return (
          <>
            <YAxis g={g} scale={sy} ticks={yTicks} label="Anteil der Epochen (kumulativ)" format={(v) => `${Math.round(v * 100)} %`} />
            <XAxis g={g} scale={sx} ticks={xTicks} label={`Positionsfehler (${unit})`} format={(v) => formatTick(v, xTicks[1] - xTicks[0])} />
            {guides.map((x) => (
              <ReferenceLine key={x} orientation="v" at={x} scale={sx} length={g.ih} label={`${x} ${unit}`} />
            ))}
            {curves.map((pts, i) => {
              if (pts.length === 0) return null;
              let d = `M${sx(0)},${sy(0)}`;
              for (const p of pts) d += `H${sx(p.x).toFixed(2)}V${sy(p.p).toFixed(2)}`;
              d += `H${sx(xd[1]).toFixed(2)}`;
              return <path key={series[i].id} data-series={series[i].id} d={d} fill="none" stroke={series[i].color ?? seriesColor(i)} strokeWidth={2} strokeLinejoin="round" />;
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
