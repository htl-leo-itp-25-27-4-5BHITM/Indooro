import { elementBounds, overlaps } from "./geometry";
import { isMobileElementId, type ElementId, type LayoutDocument, type LayoutElement } from "./model";

export interface AssignedBeacon { id?: string; beaconCode?: string; identityKey?: string; beaconId?: string; uuid?: string; major?: number; minor?: number }
export interface LayoutIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  elementId: ElementId | null;
}

/**
 * A conservative editor-side check for shelves that explicitly carry product
 * targets. Layout geometry can show an obvious blocked approach, but it cannot
 * prove that the mobile client's routing graph or positioning will work.
 */
function hasGeometricShelfAccess(document: LayoutDocument, shelf: LayoutElement): boolean {
  const shelfBounds = elementBounds(shelf);
  const { width, height } = document.gridSize;
  if (![shelfBounds.left, shelfBounds.top, shelfBounds.right, shelfBounds.bottom, width, height].every(Number.isFinite)) return true;

  const clearance = 0.5;
  const accessPoints = [
    { x: (shelfBounds.left + shelfBounds.right) / 2, y: shelfBounds.top - clearance },
    { x: (shelfBounds.right + shelfBounds.left) / 2, y: shelfBounds.bottom + clearance },
    { x: shelfBounds.left - clearance, y: (shelfBounds.top + shelfBounds.bottom) / 2 },
    { x: shelfBounds.right + clearance, y: (shelfBounds.top + shelfBounds.bottom) / 2 },
  ];
  // Only known physical obstacles count. Aisles, POIs, and unknown legacy
  // elements are deliberately treated as potentially walkable.
  const obstacles = document.elements.filter((element) =>
    element !== shelf && ["shelf", "wall", "cashier"].includes(element.type)
    && Number.isFinite(element.x) && Number.isFinite(element.y)
    && Number.isFinite(element.width) && Number.isFinite(element.height)
    && (element.width ?? 0) > 0 && (element.height ?? 0) > 0,
  );
  return accessPoints.some((point) => {
    // Keep a small body radius inside the map. A side beyond the map edge is
    // not considered a usable approach point.
    if (point.x < clearance || point.y < clearance || point.x > width - clearance || point.y > height - clearance) return false;
    return !obstacles.some((obstacle) => {
      const bounds = elementBounds(obstacle);
      return point.x >= bounds.left - 0.25 && point.x <= bounds.right + 0.25
        && point.y >= bounds.top - 0.25 && point.y <= bounds.bottom + 0.25;
    });
  });
}

function shelfProductTargets(shelf: LayoutElement): string[] {
  const positions = Array.isArray(shelf.productPositions)
    ? shelf.productPositions.filter((value): value is string | number => typeof value === "string" || typeof value === "number")
      .map(String).map((value) => value.trim()).filter(Boolean)
    : [];
  const layoutCode = typeof shelf.layoutCode === "string" ? shelf.layoutCode.trim() : "";
  return [...new Set([...positions, ...(layoutCode ? [layoutCode] : [])])];
}

export function validateLayout(document: LayoutDocument, assignedBeacons: AssignedBeacon[] = [], requireAssignedBeacons = false): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const add = (severity: LayoutIssue["severity"], code: string, message: string, elementId: ElementId | null = null) => issues.push({ severity, code, message, elementId });
  const { width, height } = document.gridSize;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 1000 || height > 1000) add("error", "grid", "Rastergröße muss zwischen 0 und 1000 liegen.");
  if (!document.shopName.trim()) add("warning", "name", "Filialname fehlt.");
  if (document.elements.length === 0) add("error", "empty", "Der Grundriss enthält keine Elemente.");
  if (document.elements.length > 5000) add("error", "element-limit", "Der Grundriss enthält mehr als 5000 Elemente.");
  if (!document.elements.some((element) => element.type === "entrance")) add("error", "entrance", "Ein Eingang ist für die Navigation erforderlich.");
  const beaconIds = new Set<string>();
  const elementIds = new Set<string>();
  const shelfAddresses = new Set<string>();
  const assigned = new Set(assignedBeacons.flatMap((beacon) => [beacon.id, beacon.beaconCode, beacon.identityKey].filter((value): value is string => Boolean(value))));

  for (const element of document.elements) {
    const id = element.id ?? null;
    const name = element.label || element.type;
    if (!isMobileElementId(id)) add("error", "mobile-id", `${name} braucht eine numerische Element-ID für die iOS-Karte. IDs reparieren und erneut speichern.`, id);
    if (id !== null) {
      const key = `${typeof id}:${String(id)}`;
      if (elementIds.has(key)) add("error", "element-duplicate", `${name} hat eine doppelte Element-ID.`, id);
      elementIds.add(key);
    }
    const bounds = elementBounds(element);
    if (!Number.isFinite(element.x) || !Number.isFinite(element.y) || bounds.left < -1e-8 || bounds.top < -1e-8 || bounds.right > width + 1e-8 || bounds.bottom > height + 1e-8) {
      add("error", "bounds", `${name} liegt außerhalb des Grundrisses.`, id);
    }
    if (element.type !== "beacon" && (!Number.isFinite(element.width) || !Number.isFinite(element.height) || (element.width ?? 0) <= 0 || (element.height ?? 0) <= 0)) {
      add("error", "dimension", `${name} braucht eine gültige Breite und Höhe.`, id);
    }
    if ((element.type === "shelf" || element.type === "poi") && !element.category && !element.layoutCode) {
      add("warning", "metadata", `${name} hat keine Kategorie oder Layoutkennung.`, id);
    }
    if (element.type === "shelf" && shelfProductTargets(element).length > 0
      && (typeof element.category !== "string" || !/^[1-9]\d{0,3}\/[1-9]\d{0,2}$/.test(element.category))) {
      add("error", "shelf-target-address", `${name}: Produktpositionen und Layout-Code allein verknüpfen Produkte nicht mit der Karte. Kategorie und Abschnitt zuweisen.`, id);
    }
    if (element.accessAngle !== undefined && (!Number.isFinite(element.accessAngle) || element.accessAngle < 0 || element.accessAngle > 360)) {
      add("error", "access-angle", `${name} braucht einen Zugriffswinkel zwischen 0 und 360 Grad.`, id);
    }
    if (element.layoutCode !== undefined && (typeof element.layoutCode !== "string" || (element.layoutCode.trim() !== "" && !/^\d{1,4}\/\d{1,3}\/\d{1,2}\/\d{1,2}$/.test(element.layoutCode.trim())))) {
      add("error", "layout-code", `${name} braucht einen Layout-Code im Format Kategorie/Abschnitt/Fach/Reihe.`, id);
    }
    if (element.type === "shelf" && typeof element.layoutCode === "string" && /^\d{1,4}\/\d{1,3}\/\d{1,2}\/\d{1,2}$/.test(element.layoutCode.trim())
      && typeof element.category === "string" && /^[1-9]\d{0,3}\/[1-9]\d{0,2}$/.test(element.category)
      && !element.layoutCode.trim().startsWith(`${element.category}/`)) {
      add("error", "shelf-target-mismatch", `${name}: Layout-Code und Regal-Kategorie/Abschnitt widersprechen sich. Produktziel korrigieren.`, id);
    }
    if (element.productPositions !== undefined) {
      const positions = element.productPositions;
      if (!Array.isArray(positions) || positions.length > 500 || positions.some((position) => (typeof position !== "string" && typeof position !== "number") || !String(position).trim())
        || new Set(positions.map(String)).size !== positions.length) {
        add("error", "product-positions", `${name} hat ungültige oder doppelte Produktpositionen.`, id);
      }
    }
    if (element.type === "shelf" && typeof element.category === "string" && element.category.trim()) {
      const parts = element.category.split("/");
      const section = Number(parts[1]);
      if (parts.length !== 2 || !/^[1-9]\d{0,3}$/.test(parts[0]) || !/^[1-9]\d{0,2}$/.test(parts[1])) {
        add("error", "shelf-category", `${name} braucht eine numerische Kategorie im Format Code/Abschnitt.`, id);
      } else if (element.meter !== null && element.meter !== undefined && element.meter !== section) {
        add("error", "shelf-section", `${name}: Kategorie-Abschnitt und Meterangabe widersprechen sich.`, id);
      } else {
        const address = `${parts[0]}/${section}`;
        if (shelfAddresses.has(address)) add("error", "shelf-address-duplicate", `${name}: ${address} wird von mehreren Regalen verwendet. Abschnitt zuweisen, damit Produkte das richtige Regal finden.`, id);
        shelfAddresses.add(address);
      }
    }
    if (element.type === "beacon") {
      const beaconId = element.beaconId || element.beaconCode || element.identityKey;
      if (!beaconId) add("error", "beacon-unassigned", `${name} ist keinem Beacon zugeordnet.`, id);
      else {
        if (beaconIds.has(beaconId)) add("error", "beacon-duplicate", `${name} verwendet ${beaconId} mehrfach.`, id);
        beaconIds.add(beaconId);
        if ((requireAssignedBeacons || assignedBeacons.length > 0) && !assigned.has(beaconId)) add("error", "beacon-foreign", `${name} gehört nicht zu dieser Filiale.`, id);
      }
    }
  }
  for (const beacon of assignedBeacons) {
    const key = beacon.beaconCode || beacon.id || beacon.identityKey;
    if (key && !beaconIds.has(key)) add("warning", "beacon-unused", `Zugewiesener Beacon ${key} ist noch nicht platziert.`);
  }
  for (const shelf of document.elements.filter((element) => element.type === "shelf")) {
    const targets = shelfProductTargets(shelf);
    // Category/section metadata alone is not a product route target. Legacy
    // layouts without explicit target geometry therefore remain unchanged.
    if (targets.length && hasGeometricShelfAccess(document, shelf)) continue;
    if (targets.length) {
      const name = shelf.label || "Regal";
      add("warning", "routing-access", `${name}: Für ${targets.join(", ")} ist anhand der Geometrie kein direkter Regalzugang erkennbar. Bitte Routing manuell prüfen; dies ist keine Aussage zur mobilen Routbarkeit.`, shelf.id ?? null);
    }
  }
  // Physical fixtures may intentionally touch. Overlap warnings prompt review, not publication denial.
  const fixtures = document.elements.filter((element): element is LayoutElement => element.type !== "beacon" && element.type !== "entrance");
  for (let i = 0; i < fixtures.length; i++) for (let j = i + 1; j < fixtures.length; j++) {
    if (overlaps(fixtures[i], fixtures[j])) add("warning", "overlap", `${fixtures[i].label || fixtures[i].type} überlappt ${fixtures[j].label || fixtures[j].type}.`, fixtures[j].id ?? null);
  }
  return issues;
}
