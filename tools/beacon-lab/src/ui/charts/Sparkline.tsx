import { CHART_THEME } from "./ChartFrame";
import { extent, linearScale } from "./math";

export interface SparklineProps {
  values: (number | null)[];
  width?: number;
  height?: number;
  color?: string;
  /** accessible description, e.g. "RSSI-Verlauf Beacon 1" */
  label: string;
  synthetic?: boolean;
}

/** Tiny inline trend line. Gaps (null) break the line. */
export function Sparkline({ values, width = 96, height = 24, color = "#167768", label, synthetic }: SparklineProps) {
  const ys = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const e = extent(ys);
  const pad = 2;
  const sx = linearScale([0, Math.max(1, values.length - 1)], [pad, width - pad]);
  const [lo, hi] = e ?? [0, 1];
  const sy = linearScale([lo === hi ? lo - 1 : lo, lo === hi ? hi + 1 : hi], [height - pad, pad]);
  let d = "";
  let pen = false;
  let last: [number, number] | null = null;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = sx(i);
    const y = sy(v);
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
    last = [x, y];
  });
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="inline-block align-middle" style={{ outline: synthetic ? `1px solid ${CHART_THEME.synthetic}` : undefined }}>
      <title>{label}</title>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {last && <circle cx={(last as [number, number])[0]} cy={(last as [number, number])[1]} r={2} fill={color} />}
    </svg>
  );
}
