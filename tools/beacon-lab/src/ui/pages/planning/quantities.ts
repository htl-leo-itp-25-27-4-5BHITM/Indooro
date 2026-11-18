import type { CellResult, SimResult } from "../../../planning";

export type QuantityId = "median" | "p90" | "failure" | "audible" | "hdop";

export interface QuantityDef {
  id: QuantityId;
  label: string;
  /** Rampe: "error" = klein gut (teal) → groß schlecht (rot); "sequential" = viridis */
  ramp: "error" | "sequential";
  /** true: Farbskala umdrehen, wenn hohe Werte gut sind (hörbare Beacons) – hier nicht nötig, viridis hell = viel */
  distance: boolean;
  value: (c: CellResult) => number | null;
  /** feste Domäne in Anzeigeeinheit; sonst Datenbereich */
  fixedDomain?: [number, number];
  digits: number;
  unitLabel: (r: Pick<SimResult, "unit">) => string;
  /** Erläuterung für die Legende */
  note: string;
}

export const QUANTITIES: QuantityDef[] = [
  {
    id: "median",
    label: "Medianfehler",
    ramp: "error",
    distance: true,
    value: (c) => c.medianError,
    digits: 2,
    unitLabel: (r) => r.unit,
    note: "Median der Positionsfehler über alle simulierten Epochen der Zelle (nur erfolgreiche Schätzungen).",
  },
  {
    id: "p90",
    label: "P90-Fehler",
    ramp: "error",
    distance: true,
    value: (c) => c.p90Error,
    digits: 2,
    unitLabel: (r) => r.unit,
    note: "90. Perzentil der Positionsfehler der Zelle: 9 von 10 Epochen sind besser.",
  },
  {
    id: "failure",
    label: "Ausfallrate",
    ramp: "error",
    distance: false,
    value: (c) => c.failureRate * 100,
    fixedDomain: [0, 100],
    digits: 0,
    unitLabel: () => "%",
    note: "Anteil der Epochen ohne Positionsschätzung (zu wenige hörbare Beacons).",
  },
  {
    id: "audible",
    label: "Hörbare Beacons",
    ramp: "sequential",
    distance: false,
    value: (c) => c.meanAudible,
    digits: 1,
    unitLabel: () => "Beacons",
    note: "Mittlere Anzahl Beacons über der Empfindlichkeit. Trilateration braucht mindestens 3.",
  },
  {
    id: "hdop",
    label: "Geometrie (HDOP)",
    ramp: "error",
    distance: false,
    value: (c) => c.hdop,
    fixedDomain: [1, 6],
    digits: 2,
    unitLabel: () => "HDOP",
    note: "2D-HDOP aus den Richtungen zu den hörbaren Beacons (1 = ideal, > 4 schlecht, 99 = kollinear). Ohne Wert bei < 3 hörbaren Beacons.",
  },
];

export function quantityById(id: QuantityId): QuantityDef {
  return QUANTITIES.find((q) => q.id === id) ?? QUANTITIES[0];
}

/** Wert in Anzeigeeinheit (Abstände: LE → m bei bestätigtem Maßstab). */
export function toDisplay(q: QuantityDef, valueLE: number | null, r: Pick<SimResult, "unit" | "metersPerUnit">): number | null {
  if (valueLE === null) return null;
  return q.distance && r.unit === "m" ? valueLE * r.metersPerUnit : valueLE;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
}
