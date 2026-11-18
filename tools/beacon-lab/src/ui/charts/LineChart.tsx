import { ChartFrame, ReferenceLine, XAxis, YAxis, dotsPath, leftMargin, linePath } from "./ChartFrame";
import type { ChartCommonProps, LegendItem } from "./ChartFrame";
import { extent, formatTick, linearScale, nearestIndex, niceTicks, seriesColor } from "./math";

export interface LinePoint {
  x: number;
  /** null = gap in the line (e.g. beacon not heard) */
  y: number | null;
}
export interface LineSeries {
  id: string;
  label: string;
  points: LinePoint[];
  color?: string;
  /** line = solid 2 px; thin = faint hairline; dots = faint markers (raw samples) */
  style?: "line" | "thin" | "dots";
}
export interface HorizontalRef {
  y: number;
  label?: string;
  color?: string;
}
export interface LineChartProps extends ChartCommonProps {
  series: LineSeries[];
  /** y-axis label including unit, e.g. "RSSI (dBm)" */
  yLabel: string;
  /** unit appended to tooltip values, e.g. "dBm" */
  unit?: string;
  xLabel?: string;
  xFormat?: (x: number) => string;
  yDomain?: [number, number];
  xDomain?: [number, number];
  referenceLines?: HorizontalRef[];
  yDigits?: number;
}

const defaultXFormat = (x: number) => `${formatTick(x)} s`;

export function LineChart({ series, yLabel, unit, xLabel = "Zeit (s)", xFormat = defaultXFormat, yDomain, xDomain, referenceLines = [], yDigits = 1, ...frame }: LineChartProps) {
  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  const allY = series.flatMap((s) => s.points.map((p) => p.y).filter((y): y is number => y !== null));
  const refY = referenceLines.map((r) => r.y);
  const xe = xDomain ?? extent(allX) ?? [0, 1];
  const ye = yDomain ?? extent([...allY, ...refY]) ?? [0, 1];
  const yTicks = niceTicks(ye[0], ye[1], 5);
  const xTicks = niceTicks(xe[0], xe[1], 7);
  const yd: [number, number] = yDomain ?? [yTicks[0], yTicks[yTicks.length - 1]];
  const xd: [number, number] = xDomain ?? [xe[0] === xe[1] ? xe[0] - 0.5 : xe[0], xe[0] === xe[1] ? xe[1] + 0.5 : xe[1]];

  const legend: LegendItem[] = series.map((s, i) => ({ label: s.label, color: s.color ?? seriesColor(i), kind: s.style === "dots" ? "dot" : "line" }));
  const left = leftMargin(yTicks.map((t) => formatTick(t, yTicks[1] - yTicks[0])), true);

  return (
    <ChartFrame
      {...frame}
      margin={{ left }}
      legend={legend}
      hover={(px, _py, g) => {
        const sx = linearScale(xd, [0, g.iw]);
        const sy = linearScale(yd, [g.ih, 0]);
        const x = sx.invert(px);
        const rows: { color: string; label: string; value: string }[] = [];
        const dots: { x: number; y: number; color: string }[] = [];
        let snapX: number | null = null;
        series.forEach((s, i) => {
          const pts = s.points;
          const idx = nearestIndex(pts.map((p) => p.x), x);
          const p = idx >= 0 ? pts[idx] : undefined;
          if (!p) return;
          const color = s.color ?? seriesColor(i);
          if (snapX === null) snapX = p.x;
          rows.push({ color, label: s.label, value: p.y === null ? "keine Daten" : `${p.y.toFixed(yDigits)}${unit ? ` ${unit}` : ""}` });
          if (p.y !== null) dots.push({ x: sx(p.x), y: sy(p.y), color });
        });
        if (snapX === null) return null;
        return { px: sx(snapX), header: xFormat(snapX), rows, dots };
      }}
    >
      {(g) => {
        const sx = linearScale(xd, [0, g.iw]);
        const sy = linearScale(yd, [g.ih, 0]);
        return (
          <>
            <YAxis g={g} scale={sy} ticks={yTicks} label={yLabel} />
            <XAxis g={g} scale={sx} ticks={xTicks} label={xLabel} format={(v) => formatTick(v, xTicks[1] - xTicks[0])} />
            {referenceLines.map((r, i) => (
              <ReferenceLine key={i} orientation="h" at={r.y} scale={sy} length={g.iw} label={r.label} color={r.color} />
            ))}
            <g clipPath={undefined}>
              {series.map((s, i) => {
                const color = s.color ?? seriesColor(i);
                if (s.style === "dots") {
                  return <path key={s.id} data-series={s.id} d={dotsPath(s.points, sx, sy)} stroke={color} strokeOpacity={0.45} strokeWidth={3} strokeLinecap="round" fill="none" />;
                }
                const thin = s.style === "thin";
                return (
                  <path
                    key={s.id}
                    data-series={s.id}
                    d={linePath(s.points, sx, sy)}
                    stroke={color}
                    strokeOpacity={thin ? 0.4 : 1}
                    strokeWidth={thin ? 1 : 2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    fill="none"
                  />
                );
              })}
            </g>
          </>
        );
      }}
    </ChartFrame>
  );
}
