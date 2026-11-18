import type { SimState } from "./simModel";
import { MAX_LOW_COVERAGE_SHARE, MIN_BEACONS_PER_CELL } from "./simModel";

/**
 * Vereinfachte Nachbildung der echten Bereitschaftsprüfung (StoreReadinessEvaluator.java).
 * Gleiche Befund-Codes, gleiche Schwere, gleiche Ampel-Logik:
 * RED, sobald ein blockierender Befund existiert; YELLOW bei nur Warnungen; sonst GREEN.
 * Nur die Regeln, die diese Simulation zeigen kann, sind enthalten.
 */
export type ReadinessStatus = "GREEN" | "YELLOW" | "RED";
export type Severity = "BLOCKING" | "WARNING";

export type FindingCode =
  | "NO_ACTIVE_LAYOUT"
  | "ENTRANCE_COUNT"
  | "PRODUCT_NO_SHELF"
  | "TARGET_SHELF_WITHOUT_LABEL"
  | "BEACON_MAJOR_MINOR_MISSING"
  | "BEACON_IDENTITY_DUPLICATE"
  | "SHELF_WITHOUT_PRODUCTS"
  | "LOW_BEACON_COVERAGE";

export interface Finding {
  severity: Severity;
  code: FindingCode;
  message: string;
  /** Eindeutiger Schlüssel, falls ein Code mehrfach vorkommt. */
  key: string;
}

export interface Coverage {
  walkableCells: number;
  lowCells: number;
  /** Anteil begehbarer Zellen mit mindestens k Beacons im Radius, 0..1. Planungswert. */
  coveredShare: number;
  /** Beacon-Anzahl je begehbarer Zelle, zeilenweise (y * width + x); -1 für Regalzellen. */
  perCell: number[];
}

export interface ReadinessReport {
  status: ReadinessStatus;
  label: string;
  findings: Finding[];
  blocking: number;
  warnings: number;
  counts: { shelves: number; products: number; beacons: number };
  coverage: Coverage;
}

export const STATUS_LABEL: Record<ReadinessStatus, string> = {
  GREEN: "Bereit",
  YELLOW: "Bereit mit Hinweisen",
  RED: "Nicht bereit"
};

export function computeCoverage(state: SimState): Coverage {
  const { gridWidth: w, gridHeight: h, shelves, beacons, radius } = state;
  const perCell: number[] = [];
  let walkable = 0;
  let low = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const blocked = shelves.some((s) => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
      if (blocked) {
        perCell.push(-1);
        continue;
      }
      const cx = x + 0.5;
      const cy = y + 0.5;
      const n = beacons.filter((b) => Math.hypot(b.x - cx, b.y - cy) <= radius).length;
      perCell.push(n);
      walkable++;
      if (n < MIN_BEACONS_PER_CELL) low++;
    }
  }
  return { walkableCells: walkable, lowCells: low, coveredShare: walkable === 0 ? 0 : 1 - low / walkable, perCell };
}

function fmtRadius(r: number): string {
  return String(r).replace(".", ",");
}

export function evaluateReadiness(state: SimState): ReadinessReport {
  const findings: Finding[] = [];
  const coverage = computeCoverage(state);
  const counts = { shelves: state.shelves.length, products: state.products.length, beacons: state.beacons.length };

  if (!state.layoutActive) {
    findings.push({
      severity: "BLOCKING",
      code: "NO_ACTIVE_LAYOUT",
      key: "NO_ACTIVE_LAYOUT",
      message: "Keine aktive Layout-Version: Die Filiale kann nicht getestet werden."
    });
    return report(findings, counts, coverage);
  }

  if (state.entranceCount !== 1) {
    findings.push({
      severity: "BLOCKING",
      code: "ENTRANCE_COUNT",
      key: "ENTRANCE_COUNT",
      message: `Genau ein Eingang ist erforderlich, gefunden: ${state.entranceCount}.`
    });
  }

  // Produkte gegen Regale
  const hit = new Set<string>();
  for (const p of state.products) {
    const shelf = state.shelves.find((s) => s.category === p.layoutCode);
    if (shelf) {
      hit.add(shelf.id);
    } else {
      findings.push({
        severity: "BLOCKING",
        code: "PRODUCT_NO_SHELF",
        key: `PRODUCT_NO_SHELF:${p.id}`,
        message: `Produkt ${p.id} hat einen layoutCode (${p.layoutCode || "(leer)"}), der kein Regal trifft.`
      });
    }
  }
  for (const s of state.shelves) {
    if (hit.has(s.id) && !s.label) {
      findings.push({
        severity: "BLOCKING",
        code: "TARGET_SHELF_WITHOUT_LABEL",
        key: `TARGET_SHELF_WITHOUT_LABEL:${s.id}`,
        message: `Regal ${s.category} wird von Produkten angesteuert, hat aber kein Label.`
      });
    }
    if (!hit.has(s.id)) {
      findings.push({
        severity: "WARNING",
        code: "SHELF_WITHOUT_PRODUCTS",
        key: `SHELF_WITHOUT_PRODUCTS:${s.id}`,
        message: `Regal ${s.category} hat keine Produkte.`
      });
    }
  }

  // Beacons
  const seen = new Set<string>();
  for (const b of state.beacons) {
    if (b.major === null || b.minor === null) {
      const missing = (b.major === null ? "Major" : "") + (b.major === null && b.minor === null ? " und " : "") + (b.minor === null ? "Minor" : "");
      findings.push({
        severity: "BLOCKING",
        code: "BEACON_MAJOR_MINOR_MISSING",
        key: `BEACON_MAJOR_MINOR_MISSING:${b.code}`,
        message: `Registriertes Beacon ${b.code} hat kein Major/Minor (${missing} fehlt).`
      });
      continue;
    }
    const k = `${b.major}:${b.minor}`;
    if (seen.has(k)) {
      findings.push({
        severity: "BLOCKING",
        code: "BEACON_IDENTITY_DUPLICATE",
        key: `BEACON_IDENTITY_DUPLICATE:${b.code}`,
        message: `Registriertes Beacon ${b.code} hat dieselbe UUID/Major/Minor wie ein anderes Beacon der Filiale.`
      });
    }
    seen.add(k);
  }

  // Abdeckung (Planungswert)
  if (coverage.walkableCells > 0 && coverage.lowCells > MAX_LOW_COVERAGE_SHARE * coverage.walkableCells) {
    const pct = ((100 * coverage.lowCells) / coverage.walkableCells).toFixed(1).replace(".", ",");
    findings.push({
      severity: "WARNING",
      code: "LOW_BEACON_COVERAGE",
      key: "LOW_BEACON_COVERAGE",
      message: `${coverage.lowCells} von ${coverage.walkableCells} begehbaren Zellen (${pct} %) haben weniger als ${MIN_BEACONS_PER_CELL} Beacons im Radius ${fmtRadius(state.radius)} m (erlaubt: ${MAX_LOW_COVERAGE_SHARE * 100} %).`
    });
  }

  return report(findings, counts, coverage);
}

function report(findings: Finding[], counts: ReadinessReport["counts"], coverage: Coverage): ReadinessReport {
  const blocking = findings.filter((f) => f.severity === "BLOCKING").length;
  const warnings = findings.length - blocking;
  const status: ReadinessStatus = blocking > 0 ? "RED" : warnings > 0 ? "YELLOW" : "GREEN";
  return { status, label: STATUS_LABEL[status], findings, blocking, warnings, counts, coverage };
}
