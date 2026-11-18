import type { FindingSeverity } from "../../../positioning/diagnostics";
import { useMap } from "../../../map";

export interface BeaconMarker {
  id: string;
  x: number;
  y: number;
  severity: FindingSeverity | null;
  dataSufficient: boolean;
  /** pre-formatted badge text, e.g. "Δ +0,35 m" */
  badge?: string;
}

export const SEVERITY_COLOR = { warning: "#d97706", info: "#3b6fb6", ok: "#167768", none: "#9aa9b3" } as const;

export function markerColor(m: Pick<BeaconMarker, "severity" | "dataSufficient">): string {
  if (m.severity === "warning") return SEVERITY_COLOR.warning;
  if (m.severity === "info") return SEVERITY_COLOR.info;
  return m.dataSufficient ? SEVERITY_COLOR.ok : SEVERITY_COLOR.none;
}

/** Map overlay: coloured ring around each beacon by finding severity plus a badge with the leave-one-out delta. */
export function BeaconFindingLayer({ markers }: { markers: BeaconMarker[] }) {
  const { pxPerUnit } = useMap();
  return (
    <g data-testid="layer-beacon-findings" pointerEvents="none">
      {markers.map((m) => {
        const color = markerColor(m);
        return (
          <g key={m.id} transform={`translate(${m.x} ${m.y}) scale(${1 / pxPerUnit})`} data-severity={m.severity ?? (m.dataSufficient ? "ok" : "insufficient")}>
            <circle r={13} fill={color} fillOpacity={0.14} stroke={color} strokeWidth={2.5} strokeDasharray={m.dataSufficient ? undefined : "3 3"} />
            {m.badge && (
              <g transform="translate(10 11)">
                <rect x={0} y={0} width={Math.max(34, m.badge.length * 6.2 + 8)} height={15} rx={4} fill="#ffffff" stroke={color} strokeWidth={1} />
                <text x={4} y={11} fontSize={10} fontWeight={700} fill="#102a3b" className="tabular">
                  {m.badge}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
