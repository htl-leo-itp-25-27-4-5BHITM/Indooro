import { ChartFrame, XAxis, YAxis, leftMargin } from "./ChartFrame";
import type { ChartCommonProps } from "./ChartFrame";
import { extent, formatTick, histogram, linearScale, niceTicks, seriesColor } from "./math";
import type { HistogramResult } from "./math";

export interface HistogramSeries {
  id: string;
  label: string;
  values: number[];
  color?: string;
}
export type HistogramChartProps = ChartCommonProps & {
  series: HistogramSeries[];
  /** x-axis label including unit, e.g. "RSSI (dBm)" */
  xLabel: string;
  yLabel?: string;
  unit?: string;
  /** show relative frequency (%) instead of counts */
  normalize?: boolean;
} & ({ binWidth: number; bins?: undefined } | { bins: number; binWidth?: undefined });

export function HistogramChart({ series, xLabel, yLabel, unit, normalize, binWidth, bins, ...frame }: HistogramChartProps) {
  const all = series.flatMap((s) => s.values);
  const e = extent(all) ?? [0, 1];
  const opts = binWidth !== undefined ? ({ binWidth } as const) : ({ bins: bins ?? 10 } as const);
  // shared bins for all series: derive the grid from the pooled data
  const pooled = histogram(all, opts);
  const range: [number, number] = pooled.bins.length ? [pooled.bins[0].x0, pooled.bins[pooled.bins.length - 1].x1] : [e[0], e[1] + 1];
  const results: HistogramResult[] = series.map((s) => histogram(s.values, { binWidth: pooled.binWidth, range }));
  const denom = (r: HistogramResult) => (normalize ? Math.max(1, r.total) / 100 : 1);
  const maxY = Math.max(1, ...results.flatMap((r) => r.bins.map((b) => b.count / denom(r))));
  const yTicks = niceTicks(0, maxY, 5);
  const xTicks = niceTicks(range[0], range[1], 7);
  const yMax = yTicks[yTicks.length - 1];
  const left = leftMargin(yTicks.map((t) => formatTick(t, yTicks[1] - yTicks[0])), true);
  const yl = yLabel ?? (normalize ? "Anteil (%)" : "Anzahl");

  return (
    <ChartFrame
      {...frame}
      margin={{ left }}
      legend={series.map((s, i) => ({ label: s.label, color: s.color ?? seriesColor(i), kind: "box" as const }))}
      hover={(px, _py, g) => {
        const x = linearScale(range, [0, g.iw]).invert(px);
        const idx = pooled.bins.findIndex((b, i) => x >= b.x0 && (x < b.x1 || i === pooled.bins.length - 1));
        if (idx < 0) return null;
        const b = pooled.bins[idx];
        const sx = linearScale(range, [0, g.iw]);
        return {
          px: sx((b.x0 + b.x1) / 2),
          header: `${formatTick(b.x0, pooled.binWidth)} – ${formatTick(b.x1, pooled.binWidth)}${unit ? ` ${unit}` : ""}`,
          rows: series.map((s, i) => {
            const c = results[i].bins[idx].count;
            return { color: s.color ?? seriesColor(i), label: s.label, value: normalize ? `${(c / denom(results[i])).toFixed(1)} % (n=${c})` : String(c) };
          }),
        };
      }}
    >
      {(g) => {
        const sx = linearScale(range, [0, g.iw]);
        const sy = linearScale([0, yMax], [g.ih, 0]);
        return (
          <>
            <YAxis g={g} scale={sy} ticks={yTicks} label={yl} />
            <XAxis g={g} scale={sx} ticks={xTicks} label={xLabel} format={(v) => formatTick(v, xTicks[1] - xTicks[0])} />
            {results.map((r, si) => {
              const color = series[si].color ?? seriesColor(si);
              return (
                <g key={series[si].id} data-series={series[si].id}>
                  {r.bins.map((b, bi) =>
                    b.count === 0 ? null : (
                      <rect
                        key={bi}
                        x={sx(b.x0) + 0.5}
                        y={sy(b.count / denom(r))}
                        width={Math.max(1, sx(b.x1) - sx(b.x0) - 1)}
                        height={g.ih - sy(b.count / denom(r))}
                        fill={color}
                        fillOpacity={series.length > 1 ? 0.45 : 0.75}
                        stroke={color}
                        strokeWidth={1}
                        data-bin=""
                      />
                    ),
                  )}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
