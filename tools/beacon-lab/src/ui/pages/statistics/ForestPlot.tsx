import { CHART_THEME } from "../../charts";
import { fmt } from "../analysis/format";

export interface ForestRow {
  label: string;
  estimate: number | null;
  lo: number | null;
  hi: number | null;
  emphasized?: boolean;
  color?: string;
}

/**
 * Horizontal point-and-interval plot (median per run with its interval, last row = pooled). Intervals can be
 * asymmetric, therefore a small dedicated SVG instead of the symmetric error bars of BarChart.
 */
export function ForestPlot({ rows, unit, title }: { rows: ForestRow[]; unit: string; title: string }) {
  const W = 640;
  const rowH = 30;
  const left = 200;
  const right = 24;
  const top = 12;
  const bottom = 40;
  const H = top + bottom + rows.length * rowH;
  const vals = rows.flatMap((r) => [r.estimate, r.lo, r.hi]).filter((v): v is number => v !== null && Number.isFinite(v));
  const max = Math.max(1e-9, ...vals, 0) * 1.08;
  const x = (v: number) => left + (v / max) * (W - left - right);
  const ticks = Array.from({ length: 5 }, (_, i) => (max * i) / 4);
  const summary = rows.map((r) => `${r.label}: ${fmt(r.estimate)} ${unit}${r.lo !== null && r.hi !== null ? ` [${fmt(r.lo)} – ${fmt(r.hi)}]` : ""}`).join("; ");
  return (
    <figure className="m-0" data-testid="statistics-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`} className="h-auto w-full" fontFamily={CHART_THEME.font} fontSize={12}>
        <title>{title}</title>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={H - bottom} stroke={CHART_THEME.grid} />
            <text x={x(t)} y={H - bottom + 16} textAnchor="middle" fill={CHART_THEME.muted}>
              {fmt(t, max < 10 ? 1 : 0)}
            </text>
          </g>
        ))}
        <text x={(left + W - right) / 2} y={H - 6} textAnchor="middle" fill={CHART_THEME.muted}>
          Median des Positionsfehlers ({unit}) mit Intervall
        </text>
        {rows.map((r, i) => {
          const y = top + i * rowH + rowH / 2;
          const color = r.color ?? (r.emphasized ? CHART_THEME.ink : "#167768");
          return (
            <g key={`${r.label}-${i}`}>
              <text x={left - 8} y={y + 4} textAnchor="end" fill={CHART_THEME.ink} fontWeight={r.emphasized ? 700 : 400}>
                {r.label.length > 28 ? `${r.label.slice(0, 27)}…` : r.label}
              </text>
              {r.lo !== null && r.hi !== null && (
                <g stroke={color} strokeWidth={2}>
                  <line x1={x(r.lo)} x2={x(r.hi)} y1={y} y2={y} />
                  <line x1={x(r.lo)} x2={x(r.lo)} y1={y - 5} y2={y + 5} />
                  <line x1={x(r.hi)} x2={x(r.hi)} y1={y - 5} y2={y + 5} />
                </g>
              )}
              {r.estimate !== null && <rect x={x(r.estimate) - 4.5} y={y - 4.5} width={9} height={9} fill={color} transform={r.emphasized ? `rotate(45 ${x(r.estimate)} ${y})` : undefined} />}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
