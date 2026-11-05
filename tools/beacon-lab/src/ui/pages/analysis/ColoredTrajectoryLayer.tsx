import { useMemo } from "react";
import type { PositionEstimate } from "../../../core/types";
import { splitSegments } from "../../../map";
import { useMap } from "../../../map";

const toPath = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");

/**
 * Estimate path of one configuration in a given colour (the stock TrajectoryLayer uses one fixed colour,
 * which cannot tell several configurations apart). Lines break at failed epochs and large time gaps – failures are never bridged.
 */
export function ColoredEstimatePath({ estimates, color, testId }: { estimates: PositionEstimate[]; color: string; testId?: string }) {
  const { layers } = useMap();
  const segs = useMemo(() => splitSegments(estimates.map((e) => ({ t: e.t, p: e.position }))), [estimates]);
  if (!layers.trajectories) return null;
  return (
    <g data-testid={testId} pointerEvents="none" aria-hidden="true" fill="none" strokeLinejoin="round" strokeLinecap="round">
      {segs.map((s, i) => (
        <path key={i} d={toPath(s)} stroke={color} strokeWidth={1.75} strokeOpacity={0.85} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}
