import { ChartFrame, YAxis, leftMargin, CHART_THEME } from "./ChartFrame";
import type { ChartCommonProps } from "./ChartFrame";
import { boxStats, extent, formatTick, linearScale, niceTicks, seriesColor } from "./math";

export interface BoxGroup {
  id: string;
  label: string;
  values: number[];
  color?: string;
}
export interface BoxPlotProps extends ChartCommonProps {
  groups: BoxGroup[];
  /** value-axis label including unit, e.g. "Positionsfehler (m)" */
  valueLabel: string;
  unit?: string;
  digits?: number;
}

/** Tukey box plot (type-7 quartiles, whiskers to the most extreme point within 1.5 × IQR, outliers as dots). */
export function BoxPlot({ groups, valueLabel, unit, digits = 2, ...frame }: BoxPlotProps) {
  const stats = groups.map((g) => boxStats(g.values));
  const e = extent(stats.flatMap((s) => (s ? [s.min, s.max] : []))) ?? [0, 1];
  const ticks = niceTicks(e[0], e[1], 6);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const left = leftMargin(ticks.map((t) => formatTick(t, ticks[1] - ticks[0])), true);
  const u = unit ? ` ${unit}` : "";

  return (
    <ChartFrame
      {...frame}
      margin={{ left }}
      hover={(px, _py, g) => {
        const n = groups.length;
        if (n === 0) return null;
        const i = Math.min(n - 1, Math.max(0, Math.floor((px / g.iw) * n)));
        const s = stats[i];
        const rows = s
          ? [
              { label: "n", value: String(s.n) },
              { label: "Maximum", value: `${s.max.toFixed(digits)}${u}` },
              { label: "Q3", value: `${s.q3.toFixed(digits)}${u}` },
              { label: "Median", value: `${s.median.toFixed(digits)}${u}` },
              { label: "Q1", value: `${s.q1.toFixed(digits)}${u}` },
              { label: "Minimum", value: `${s.min.toFixed(digits)}${u}` },
              { label: "Ausreißer", value: String(s.outliers.length) },
            ]
          : [{ label: "keine Daten", value: "–" }];
        return { px: ((i + 0.5) / n) * g.iw, header: groups[i].label, rows };
      }}
    >
      {(g) => {
        const sy = linearScale(domain, [g.ih, 0]);
        const n = groups.length;
        const band = g.iw / Math.max(1, n);
        const bw = Math.min(56, band * 0.55);
        return (
          <>
            <YAxis g={g} scale={sy} ticks={ticks} label={valueLabel} />
            <g data-testid="x-axis" transform={`translate(0,${g.ih})`}>
              {groups.map((gr, i) => (
                <text key={gr.id} x={(i + 0.5) * band} y={17} textAnchor="middle" fill={CHART_THEME.muted}>
                  {gr.label}
                </text>
              ))}
              <line x1={0} x2={g.iw} y1={0} y2={0} stroke={CHART_THEME.muted} />
            </g>
            {groups.map((gr, i) => {
              const s = stats[i];
              if (!s) return null;
              const c = gr.color ?? seriesColor(i);
              const cx = (i + 0.5) * band;
              return (
                <g key={gr.id} data-box={gr.id}>
                  <line x1={cx} x2={cx} y1={sy(s.upperWhisker)} y2={sy(s.q3)} stroke={c} strokeWidth={1.5} />
                  <line x1={cx} x2={cx} y1={sy(s.q1)} y2={sy(s.lowerWhisker)} stroke={c} strokeWidth={1.5} />
                  <line x1={cx - bw / 4} x2={cx + bw / 4} y1={sy(s.upperWhisker)} y2={sy(s.upperWhisker)} stroke={c} strokeWidth={1.5} />
                  <line x1={cx - bw / 4} x2={cx + bw / 4} y1={sy(s.lowerWhisker)} y2={sy(s.lowerWhisker)} stroke={c} strokeWidth={1.5} />
                  <rect x={cx - bw / 2} y={sy(s.q3)} width={bw} height={Math.max(1, sy(s.q1) - sy(s.q3))} fill={c} fillOpacity={0.25} stroke={c} strokeWidth={1.5} rx={2} />
                  <line x1={cx - bw / 2} x2={cx + bw / 2} y1={sy(s.median)} y2={sy(s.median)} stroke={c} strokeWidth={2.5} />
                  {s.outliers.map((o, oi) => (
                    <circle key={oi} data-outlier="" cx={cx} cy={sy(o)} r={2.5} fill="none" stroke={c} strokeWidth={1.25} />
                  ))}
                </g>
              );
            })}
          </>
        );
      }}
    </ChartFrame>
  );
}
