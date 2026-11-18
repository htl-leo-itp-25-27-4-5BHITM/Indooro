import { useId } from "react";
import { colorRamp, normalize, rampGradientCss, useMap, type ColorScaleKind } from "../../../map";

export interface PrognosisCell {
  /** "ix|iy" */
  id: string;
  /** linke obere Ecke (LE) */
  x: number;
  y: number;
  size: number;
  /** null = keine Schätzung ("schraffiert") */
  value: number | null;
  /** optionale Sonderfarbe (z. B. Delta-Status) */
  color?: string;
  title: string;
  lines: string[];
}

/**
 * Zeichnet Prognosezellen. Bewusst eigene Ebene (nicht HeatmapLayer): Tooltips und Beschriftung sagen
 * ausdrücklich „Modellprognose“, nie „Messposition“.
 */
export function PrognosisLayer({
  cells,
  domain,
  ramp,
  reversed = false,
}: {
  cells: PrognosisCell[];
  domain: [number, number];
  ramp: ColorScaleKind;
  reversed?: boolean;
}) {
  const { interactive, pxPerUnit, layers } = useMap();
  const hid = useId().replace(/:/g, "");
  if (!layers.heatmap) return null;
  const hatch = 6 / pxPerUnit;
  return (
    <g data-testid="layer-prognosis">
      <defs>
        <pattern id={`ph-${hid}`} patternUnits="userSpaceOnUse" width={hatch} height={hatch} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={hatch} stroke="#7f95a4" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.7} />
        </pattern>
      </defs>
      {cells.map((c) => {
        const t = c.value === null ? 0 : normalize(c.value, domain[0], domain[1]);
        const fill = c.color ?? (c.value === null ? `url(#ph-${hid})` : colorRamp(reversed ? 1 - t : t, ramp));
        return (
          <rect
            key={`${c.x}|${c.y}`}
            x={c.x}
            y={c.y}
            width={c.size}
            height={c.size}
            fill={fill}
            fillOpacity={c.value === null && !c.color ? 1 : 0.82}
            stroke="#ffffff"
            strokeWidth={0.5}
            vectorEffect="non-scaling-stroke"
            {...interactive({
              kind: "cell",
              id: `prog-${c.x}-${c.y}`,
              title: c.title,
              lines: [...c.lines, "MODELLPROGNOSE – keine Messung"],
              position: { x: c.x + c.size / 2, y: c.y + c.size / 2 },
            })}
          />
        );
      })}
    </g>
  );
}

export function PrognosisLegend({
  title,
  unit,
  domain,
  ramp,
  digits,
  note,
  extra,
  reversed = false,
}: {
  title: string;
  unit: string;
  domain: [number, number];
  ramp: ColorScaleKind;
  digits: number;
  note: string;
  extra?: string;
  reversed?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs" data-testid="planning-legend">
      <div className="mb-1 font-medium text-brand">
        {title} <span className="font-normal text-muted">({unit})</span> · <span className="font-semibold text-synthetic">MODELLPROGNOSE</span>
      </div>
      <div className="h-2 w-full max-w-[240px] rounded-sm" style={{ background: rampGradientCss(ramp), transform: reversed ? "scaleX(-1)" : undefined }} />
      <div className="tabular flex max-w-[240px] justify-between text-muted">
        <span>{domain[0].toFixed(digits)}</span>
        <span>{domain[1].toFixed(digits)}</span>
      </div>
      <div className="mt-1 text-muted">{note}</div>
      {extra && <div className="mt-0.5 text-muted">{extra}</div>}
      <div className="mt-0.5 text-muted">Schraffiert = keine Schätzung möglich · Zellen = Mittelpunkt-Simulation, nicht interpoliert.</div>
    </div>
  );
}
