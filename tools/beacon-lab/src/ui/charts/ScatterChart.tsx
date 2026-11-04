import { ChartFrame, XAxis, YAxis, dotsPath, leftMargin, linePath } from "./ChartFrame";
import type { ChartCommonProps } from "./ChartFrame";
import { extent, formatTick, linearScale, logScale, logTicks, niceTicks, seriesColor } from "./math";

export interface ScatterSeries {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  color?: string;
}
export interface CurveOverlay {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  color?: string;
  dashed?: boolean;
}
export interface ScatterChartProps extends ChartCommonProps {
  series: ScatterSeries[];
  /** fitted curves drawn over the points, e.g. the path-loss model */
  curves?: CurveOverlay[];
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  xLog?: boolean;
}

export function ScatterChart({ series, curves = [], xLabel, yLabel, xUnit, yUnit, xLog = false, ...frame }: ScatterChartProps) {
  const pts = [...series.flatMap((s) => s.points), ...curves.flatMap((c) => c.points)].filter((p) => !xLog || p.x > 0);
  const xe = extent(pts.map((p) => p.x)) ?? [1, 10];
  const ye = extent(pts.map((p) => p.y)) ?? [0, 1];
  const yTicks = niceTicks(ye[0], ye[1], 5);
  const xTicks = xLog ? logTicks(xe[0], xe[1]) : niceTicks(xe[0], xe[1], 7);
  const xd: [number, number] = xLog ? [Math.min(xe[0], xTicks[0] ?? xe[0]), Math.max(xe[1], xTicks[xTicks.length - 1] ?? xe[1])] : [xTicks[0], xTicks[xTicks.length - 1]];
  const yd: [number, number] = [yTicks[0], yTicks[yTicks.length - 1]];
  const left = leftMargin(yTicks.map((t) => formatTick(t, yTicks[1] - yTicks[0])), true);
  const mkX = (w: number) => (xLog ? logScale(xd, [0, w]) : linearScale(xd, [0, w]));

  return (
    <ChartFrame
      {...frame}
      margin={{ left }}
      legend={[
        ...series.map((s, i) => ({ label: s.label, color: s.color ?? seriesColor(i), kind: "dot" as const })),
        ...curves.map((c, i) => ({ label: c.label, color: c.color ?? seriesColor(series.length + i), kind: c.dashed ? ("dashed" as const) : ("line" as const) })),
      ]}
      hover={(px, py, g) => {
        const sx = mkX(g.iw);
        const sy = linearScale(yd, [g.ih, 0]);
        let best: { d: number; x: number; y: number; color: string; label: string } | null = null;
        series.forEach((s, si) => {
          for (const p of s.points) {
            if (xLog && p.x <= 0) continue;
            const dx = sx(p.x) - px;
            const dy = sy(p.y) - py;
            const d = dx * dx + dy * dy;
            if (!best || d < best.d) best = { d, x: p.x, y: p.y, color: s.color ?? seriesColor(si), label: s.label };
          }
        });
        const b = best as { d: number; x: number; y: number; color: string; label: string } | null;
        if (!b || b.d > 28 * 28) return null;
        return {
          px: sx(b.x),
          crosshair: false,
          header: b.label,
          rows: [
            { label: xLabel, value: `${b.x.toFixed(2)}${xUnit ? ` ${xUnit}` : ""}` },
            { label: yLabel, value: `${b.y.toFixed(2)}${yUnit ? ` ${yUnit}` : ""}` },
          ],
          dots: [{ x: sx(b.x), y: sy(b.y), color: b.color }],
        };
      }}
    >
      {(g) => {
        const sx = mkX(g.iw);
        const sy = linearScale(yd, [g.ih, 0]);
        return (
          <>
            <YAxis g={g} scale={sy} ticks={yTicks} label={yLabel} />
            <XAxis g={g} scale={sx} ticks={xTicks} label={xLabel} grid={xLog} format={(v) => (xLog ? String(v) : formatTick(v, xTicks[1] - xTicks[0]))} />
            {series.map((s, i) => (
              <path
                key={s.id}
                data-series={s.id}
                d={dotsPath(s.points.filter((p) => !xLog || p.x > 0), sx, sy)}
                stroke={s.color ?? seriesColor(i)}
                strokeOpacity={0.5}
                strokeWidth={4}
                strokeLinecap="round"
                fill="none"
              />
            ))}
            {curves.map((c, i) => (
              <path
                key={c.id}
                data-curve={c.id}
                d={linePath(c.points.filter((p) => !xLog || p.x > 0), sx, sy)}
                stroke={c.color ?? seriesColor(series.length + i)}
                strokeWidth={2.25}
                strokeDasharray={c.dashed ? "6 4" : undefined}
                fill="none"
              />
            ))}
          </>
        );
      }}
    </ChartFrame>
  );
}
