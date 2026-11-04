/**
 * Floor plans: parser for the Indooro layout JSON and the built-in FICTIONAL demo market.
 *
 * Coordinate frame: layout units, origin top-left, y grows down (see core/types.ts).
 * The scale is NEVER assumed confirmed here – defaultScale() has confirmed = false.
 */
import { defaultScale } from "../core/defaults";
import { newId } from "../core/ids";
import type { Beacon, DataIssue, FloorElement, FloorElementType, FloorPlan } from "../core/types";

const ELEMENT_TYPES: Record<string, FloorElementType> = {
  shelf: "shelf",
  checkout: "checkout",
  entrance: "entrance",
  cooler: "cooler",
  freezer: "freezer",
  counter: "counter",
  anchor: "anchor",
  wall: "wall",
};

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim() !== "") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}

function emptyPlan(fileName: string): FloorPlan {
  return {
    id: newId("plan"),
    name: fileName,
    width: 1,
    height: 1,
    elements: [],
    scale: defaultScale(),
    origin: "real",
    source: fileName,
  };
}

/**
 * Parses an Indooro layout JSON (`shopName`, `gridSize`, `elements[]`), also inside the wrapper
 * `{ "layout": {...} }` returned by the layout/current endpoint.
 */
export function floorPlanFromIndooroLayout(
  json: unknown,
  fileName: string,
): { plan: FloorPlan; beacons: Beacon[]; issues: DataIssue[] } {
  const issues: DataIssue[] = [];
  let root: unknown = json;
  if (root && typeof root === "object" && !Array.isArray(root)) {
    const o = root as Record<string, unknown>;
    if (o.layout && typeof o.layout === "object" && !Array.isArray(o.layout) && !Array.isArray(o.elements)) {
      root = o.layout;
    }
  }
  if (!root || typeof root !== "object" || Array.isArray(root) || !Array.isArray((root as Record<string, unknown>).elements)) {
    issues.push({
      severity: "error",
      code: "layout-invalid",
      message: "Keine gültige Indooro-Layout-Datei: erwartet wird ein Objekt mit „elements“-Array (optional in „layout“ gewrappt).",
    });
    return { plan: emptyPlan(fileName), beacons: [], issues };
  }
  const obj = root as Record<string, unknown>;
  const rawElements = obj.elements as unknown[];

  const elements: FloorElement[] = [];
  const beacons: Beacon[] = [];
  const unknownTypes = new Map<string, number>();
  let badGeometry = 0;
  let noBeaconId = 0;
  let maxX = 0;
  let maxY = 0;
  const beaconIds = new Set<string>();

  rawElements.forEach((raw, idx) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      badGeometry++;
      return;
    }
    const e = raw as Record<string, unknown>;
    const type = typeof e.type === "string" ? e.type : "";
    const x = num(e.x);
    const y = num(e.y);
    const elId = str(e.id) ?? `element-${idx + 1}`;

    if (type === "beacon" || e.beaconId !== undefined) {
      if (x === undefined || y === undefined) {
        badGeometry++;
        return;
      }
      const major = num(e.beaconMajor);
      const minor = num(e.beaconMinor);
      let id = str(e.beaconId);
      if (!id) {
        if (major !== undefined && minor !== undefined) id = `${major}-${minor}`;
        else {
          id = `beacon-${elId}`;
          noBeaconId++;
        }
      }
      if (beaconIds.has(id)) {
        issues.push({
          severity: "warning",
          code: "duplicate-beacon-id",
          message: `Beacon-ID „${id}“ kommt im Layout mehrfach vor; das Duplikat wird ignoriert.`,
        });
        return;
      }
      beaconIds.add(id);
      const b: Beacon = { id, position: { x, y }, enabled: true };
      const label = str(e.label);
      if (label) b.label = label;
      const uuid = str(e.beaconUUID);
      if (uuid) b.uuid = uuid;
      if (major !== undefined) b.major = major;
      if (minor !== undefined) b.minor = minor;
      beacons.push(b);
      return;
    }

    const w = num(e.width);
    const h = num(e.height);
    if (x === undefined || y === undefined || w === undefined || h === undefined) {
      badGeometry++;
      return;
    }
    const mapped = ELEMENT_TYPES[type];
    if (!mapped) unknownTypes.set(type || "(ohne Typ)", (unknownTypes.get(type || "(ohne Typ)") ?? 0) + 1);
    const el: FloorElement = {
      id: elId,
      type: mapped ?? "other",
      x,
      y,
      width: w,
      height: h,
      rotationDeg: num(e.rotation) ?? 0,
    };
    const label = str(e.label);
    if (label) el.label = label;
    const category = str(e.category);
    if (category) el.category = category;
    elements.push(el);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  });

  if (unknownTypes.size > 0) {
    const list = [...unknownTypes.entries()].map(([t, n]) => `„${t}“ (${n}×)`).join(", ");
    issues.push({
      severity: "info",
      code: "unknown-element-type",
      count: [...unknownTypes.values()].reduce((a, b) => a + b, 0),
      message: `Unbekannte Elementtypen wurden als „other“ übernommen: ${list}.`,
    });
  }
  if (badGeometry > 0) {
    issues.push({
      severity: "warning",
      code: "element-invalid",
      count: badGeometry,
      message: `${badGeometry} Elemente ohne gültige Position/Größe wurden übersprungen.`,
    });
  }
  if (noBeaconId > 0) {
    issues.push({
      severity: "warning",
      code: "beacon-without-id",
      count: noBeaconId,
      message: `${noBeaconId} Beacon-Element(e) ohne beaconId und ohne Major/Minor – es wurde eine Ersatz-ID vergeben; Zuordnung zu Messdaten prüfen.`,
    });
  }
  if (beacons.length === 0) {
    issues.push({
      severity: "warning",
      code: "no-beacons",
      message: "Das Layout enthält keine Beacon-Elemente. Beacons müssen in der Kampagne von Hand angelegt werden.",
    });
  }

  const grid = obj.gridSize && typeof obj.gridSize === "object" ? (obj.gridSize as Record<string, unknown>) : undefined;
  let width = num(grid?.width);
  let height = num(grid?.height);
  if (width === undefined || height === undefined || width <= 0 || height <= 0) {
    for (const b of beacons) {
      maxX = Math.max(maxX, b.position.x);
      maxY = Math.max(maxY, b.position.y);
    }
    width = Math.max(1, Math.ceil(maxX));
    height = Math.max(1, Math.ceil(maxY));
    issues.push({
      severity: "warning",
      code: "missing-grid-size",
      message: `„gridSize“ fehlt oder ist ungültig – Rastergröße aus den Elementen abgeleitet (${width} × ${height}).`,
    });
  }

  const shopName = str(obj.shopName);
  const synthetic = !!shopName && /synthet/i.test(shopName);
  const plan: FloorPlan = {
    id: newId("plan"),
    name: shopName ?? fileName,
    width,
    height,
    elements,
    scale: defaultScale(),
    origin: synthetic ? "synthetic" : "real",
    source: fileName,
  };
  issues.push({
    severity: "info",
    code: "scale-unconfirmed",
    message:
      "Maßstab: Indooro-Konvention „1 Zelle = 1 m“ übernommen, aber NICHT bestätigt. Fehler werden in Layout-Einheiten (LE) angezeigt, bis der Maßstab vor Ort geprüft wurde.",
  });
  return { plan, beacons, issues };
}

/* ------------------------------------------------------------------ */
/* Fictional demo market                                               */
/* ------------------------------------------------------------------ */

export const DEMO_PLAN_ID = "plan-demo-fiktiv";
export const DEMO_WIDTH = 30;
export const DEMO_HEIGHT = 20;

/**
 * A FICTIONAL market of 30 x 20 layout units. Geometry (y grows down):
 *  - outer walls 0.3 thick; entrance bottom-left (x 1..4) with a gap in the bottom wall
 *  - cooler along the back (top) wall
 *  - 5 parallel shelf rows (depth 1) with aisles >= 2 units: aisle centres y = 2.4, 5.5, 8.5, 11.5, 14.5
 *    plus free side corridors x 0.3..3 (left) and x 26..29.7 (right)
 *  - 4 checkout lanes at the lower left next to the entrance
 *  - 10 beacons "LAB-B01".. mounted on shelf ends, cooler front and walls
 */
export function demoFloorPlan(): { plan: FloorPlan; beacons: Beacon[] } {
  const el = (
    id: string,
    type: FloorElementType,
    x: number,
    y: number,
    width: number,
    height: number,
    label?: string,
  ): FloorElement => ({ id, type, x, y, width, height, rotationDeg: 0, ...(label ? { label } : {}) });

  const elements: FloorElement[] = [
    el("demo-wall-top", "wall", 0, 0, 30, 0.3, "Außenwand oben"),
    el("demo-wall-left", "wall", 0, 0, 0.3, 20, "Außenwand links"),
    el("demo-wall-right", "wall", 29.7, 0, 0.3, 20, "Außenwand rechts"),
    el("demo-wall-bottom-1", "wall", 0, 19.7, 1, 0.3, "Außenwand unten"),
    el("demo-wall-bottom-2", "wall", 4, 19.7, 26, 0.3, "Außenwand unten"),
    el("demo-entrance", "entrance", 1, 19, 3, 1, "Eingang"),
    el("demo-cooler", "cooler", 3, 0.3, 24, 1, "Kühlregal"),
    el("demo-shelf-1", "shelf", 4, 3.5, 22, 1, "Regal 1"),
    el("demo-shelf-2", "shelf", 4, 6.5, 22, 1, "Regal 2"),
    el("demo-shelf-3", "shelf", 4, 9.5, 22, 1, "Regal 3"),
    el("demo-shelf-4", "shelf", 4, 12.5, 22, 1, "Regal 4"),
    el("demo-shelf-5", "shelf", 13, 15.5, 13, 1, "Regal 5"),
    el("demo-checkout-1", "checkout", 5, 15.5, 1.2, 2.5, "Kasse 1"),
    el("demo-checkout-2", "checkout", 7, 15.5, 1.2, 2.5, "Kasse 2"),
    el("demo-checkout-3", "checkout", 9, 15.5, 1.2, 2.5, "Kasse 3"),
    el("demo-checkout-4", "checkout", 11, 15.5, 1.2, 2.5, "Kasse 4"),
  ];

  const positions: [number, number][] = [
    [4.0, 3.5],
    [26.0, 3.5],
    [4.0, 9.5],
    [26.0, 9.5],
    [15.0, 1.4],
    [0.5, 13.0],
    [29.5, 6.5],
    [15.0, 12.5],
    [13.0, 15.5],
    [26.0, 15.5],
  ];
  const beacons: Beacon[] = positions.map(([x, y], i) => ({
    id: `LAB-B${String(i + 1).padStart(2, "0")}`,
    label: `Lab-Beacon ${i + 1}`,
    major: 100,
    minor: i + 1,
    position: { x, y },
    enabled: true,
  }));

  const plan: FloorPlan = {
    id: DEMO_PLAN_ID,
    name: "Fiktiver Demo-Markt (synthetisch)",
    width: DEMO_WIDTH,
    height: DEMO_HEIGHT,
    elements,
    scale: defaultScale(),
    origin: "synthetic",
    source: "eingebauter fiktiver Demo-Markt",
  };
  return { plan, beacons };
}
