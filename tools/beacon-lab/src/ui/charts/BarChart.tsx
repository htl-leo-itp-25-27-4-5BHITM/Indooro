import { ChartFrame, XAxis, YAxis, leftMargin, CHART_THEME } from "./ChartFrame";
import type { ChartCommonProps } from "./ChartFrame";
import { extent, formatTick, linearScale, niceTicks, seriesColor } from "./math";

export interface BarSeries {
  id: string;
  label: string;
  values: (number | null)[];
  /** symmetric error bars (e.g. ±std), same length as values */
  errors?: (number | null)[];
  color?: string;
}
export interface BarChartProps extends ChartCommonProps {
  categories: string[];
  series: BarSeries[];
  /** value-axis label including unit, e.g. "Mittlerer RSSI (dBm)" */
  valueLabel: string;
  unit?: string;
  orientation?: "vertical" | "horizontal";
  digits?: number;
  /** include zero in the value axis (default true) */
  zeroBased?: boolean;
}

export function BarChart({ categories, series, valueLabel, unit, orientation = "vertical", digits = 2, zeroBased = true, ...frame }: BarChartProps) {
  const horizontal = orientation === "horizontal";
  const vals: number[] = [];
  series.forEach((s) =>
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      const err = s.errors?.[i] ?? 0;
      vals.push(v + (err ?? 0), v - (err ?? 0));
    }),
  );
  if (zeroBased) vals.push(0);
  const e = extent(vals) ?? [0, 1];
  const ticks = niceTicks(e[0], e[1], 5);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const step = ticks[1] - ticks[0];
  const left = horizontal ? leftMargin(categories, false) : leftMargin(ticks.map((t) => formatTick(t, step)), true);
  const nS = Math.max(1, series.length);

  return (
    <ChartFrame
      {...frame}
      margin={{ left, bottom: horizontal ? 44 : 52 }}
      legend={series.length > 1 ? series.map((s, i) => ({ label: s.label, color: s.color ?? seriesColor(i), kind: "box" as const })) : []}
      hover={(px, py, g) => {
        const n = categories.length;
        if (n === 0) return null;
        const along = horizontal ? py / g.ih : px / g.iw;
        const ci = Math.min(n - 1, Math.max(0, Math.floor(along * n)));
        const center = ((ci + 0.5) / n) * (horizontal ? g.ih : g.iw);
        return {
          px: horizontal ? px : center,
          crosshair: !horizontal,
          header: categories[ci],
          rows: series.map((s, i) => {
            const v = s.values[ci];
            const err = s.errors?.[ci];
            return {
              color: s.color ?? seriesColor(i),
              label: s.label,
              value: v === null || v === undefined ? "–" : `${v.toFixed(digits)}${err != null ? ` ± ${err.toFixed(digits)}` : ""}${unit ? ` ${unit}` : ""}`,
            };
          }),
        };
      }}
    >
      {(g) => {
        const n = categories.length;
        const vs = linearScale(domain, horizontal ? [0, g.iw] : [g.ih, 0]);
        const bandLen = (horizontal ? g.ih : g.iw) / Math.max(1, n);
        const inner = bandLen * 0.78;
        const barLen = inner / nS;
        const zero = vs(Math.max(domain[0], Math.min(0, domain[1])));
        return (
          <>
            {horizontal ? (
              <>
                <XAxis g={g} scale={vs} ticks={ticks} label={valueLabel} grid format={(v) => formatTick(v, step)} />
                <g data-testid="y-axis">
                  {categories.map((c, i) => (
                    <text key={c + i} x={-8} y={(i + 0.5) * bandLen} dy="0.32em" textAnchor="end" fill={CHART_THEME.muted}>
                      {c}
                    </text>
                  ))}
                  <line x1={0} x2={0} y1={0} y2={g.ih} stroke={CHART_THEME.muted} />
                </g>
              </>
            ) : (
              <>
                <YAxis g={g} scale={vs} ticks={ticks} label={valueLabel} />
                <g data-testid="x-axis" transform={`translate(0,${g.ih})`}>
                  {categories.map((c, i) => (
                    <text key={c + i} x={(i + 0.5) * bandLen} y={17} textAnchor="middle" fill={CHART_THEME.muted}>
                      {c}
                    </text>
                  ))}
                  <line x1={0} x2={g.iw} y1={0} y2={0} stroke={CHART_THEME.muted} />
                </g>
              </>
            )}
            {series.map((s, si) => {
              const color = s.color ?? seriesColor(si);
              return (
                <g key={s.id} data-series={s.id}>
                  {s.values.map((v, ci) => {
                    if (v === null || !Number.isFinite(v)) return null;
                    const offset = ci * bandLen + (bandLen - inner) / 2 + si * barLen;
                    const p = vs(v);
                    const err = s.errors?.[ci];
                    const mid = offset + barLen / 2;
                    return (
                      <g key={ci}>
                        {horizontal ? (
                          <rect data-bar="" x={Math.min(zero, p)} y={offset + 1} width={Math.abs(p - zero)} height={Math.max(1, barLen - 2)} fill={color} fillOpacity={0.85} rx={2} />
                        ) : (
                          <rect data-bar="" x={offset + 1} y={Math.min(zero, p)} width={Math.max(1, barLen - 2)} height={Math.abs(p - zero)} fill={color} fillOpacity={0.85} rx={2} />
                        )}
                        {err != null && err > 0 && (
                          <path
                            data-errorbar=""
                            stroke={CHART_THEME.ink}
                            strokeWidth={1.25}
                            fill="none"
                            d={
                              horizontal
                                ? `M${vs(v - err)},${mid}H${vs(v + err)}M${vs(v - err)},${mid - 4}V${mid + 4}M${vs(v + err)},${mid - 4}V${mid + 4}`
                                : `M${mid},${vs(v - err)}V${vs(v + err)}M${mid - 4},${vs(v - err)}H${mid + 4}M${mid - 4},${vs(v + err)}H${mid + 4}`
                            }
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
