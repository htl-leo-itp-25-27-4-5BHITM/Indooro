import type { PathLossModel } from "../../../core/types";
import { distanceToRssi } from "../../../positioning/pathloss";

/** Points of the model curve RSSI(d) on a log-spaced distance grid. */
export function modelCurve(model: PathLossModel, minM: number, maxM: number, steps = 60): { x: number; y: number }[] {
  const lo = Math.max(0.1, minM);
  const hi = Math.max(lo * 1.01, maxM);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const d = lo * Math.pow(hi / lo, i / steps);
    pts.push({ x: d, y: distanceToRssi(d, model) });
  }
  return pts;
}

export const SOURCE_LABEL: Record<PathLossModel["source"], string> = {
  default: "unkalibriert (Standardwert)",
  fitted: "kalibriert (Fit)",
  manual: "manuell – ungeprüft",
};
