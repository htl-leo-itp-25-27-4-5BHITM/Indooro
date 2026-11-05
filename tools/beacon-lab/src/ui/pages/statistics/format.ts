import type { BootstrapCI, ProportionCI } from "../../../positioning/uncertainty";
import { fmt, fmtPct } from "../analysis/format";

export interface CellText {
  text: string;
  /** tooltip, e.g. the reason why no interval exists */
  title?: string;
}

const DASH = "–";

/** "2,10 [1,85 – 2,41] LE" or, without an interval, "2,10 [n. b.] LE" (title: reason). */
export function fmtBootstrap(ci: BootstrapCI, unit: string, digits = 2): CellText {
  if (ci.estimate === null) return { text: DASH };
  const est = fmt(ci.estimate, digits);
  if (ci.lo === null || ci.hi === null) return { text: `${est} [n. b.] ${unit}`, title: ci.reason ?? "Intervall nicht berechenbar" };
  return { text: `${est} [${fmt(ci.lo, digits)} ${DASH} ${fmt(ci.hi, digits)}] ${unit}` };
}

/** "93,1 % [88,0 – 96,1 %]" (Wilson). */
export function fmtProportion(p: ProportionCI): CellText {
  if (p.p === null) return { text: DASH };
  if (p.lo === null || p.hi === null) return { text: fmtPct(p.p) };
  return { text: `${fmtPct(p.p)} [${fmtPct(p.lo)} ${DASH} ${fmtPct(p.hi)}]` };
}

export const CI_LEGEND =
  "n. b. = nicht berechenbar (weniger als 5 Blöcke). Prozentwerte: Wilson-Intervall (setzt unabhängige Epochen voraus, ist bei autokorrelierten Epochen eher zu eng). Fehlerstatistiken: Block-Bootstrap, Perzentilintervall.";
