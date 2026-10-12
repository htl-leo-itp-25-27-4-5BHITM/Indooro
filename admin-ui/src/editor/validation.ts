import { elementBounds, overlaps } from "./geometry";
import type { ElementId, LayoutDocument, LayoutElement } from "./model";

export interface AssignedBeacon { id?: string; beaconCode?: string; identityKey?: string; beaconId?: string; uuid?: string; major?: number; minor?: number }
export interface LayoutIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  elementId: ElementId | null;
}

export function validateLayout(document: LayoutDocument, assignedBeacons: AssignedBeacon[] = []): LayoutIssue[] {
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
  const assigned = new Set(assignedBeacons.flatMap((beacon) => [beacon.id, beacon.beaconCode, beacon.identityKey].filter((value): value is string => Boolean(value))));

  for (const element of document.elements) {
    const id = element.id ?? null;
    const name = element.label || element.type;
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
    if (element.type === "shelf" && typeof element.category === "string" && element.category.trim()) {
      const parts = element.category.split("/");
      const section = Number(parts[1]);
      if (parts.length !== 2 || !parts[0].trim() || !Number.isInteger(section) || section <= 0) {
        add("error", "shelf-category", `${name} braucht eine Kategorie im Format Code/Abschnitt.`, id);
      } else if (element.meter !== null && element.meter !== undefined && element.meter !== section) {
        add("error", "shelf-section", `${name}: Kategorie-Abschnitt und Meterangabe widersprechen sich.`, id);
      }
    }
    if (element.type === "beacon") {
      const beaconId = element.beaconId || element.beaconCode || element.identityKey;
      if (!beaconId) add("error", "beacon-unassigned", `${name} ist keinem Beacon zugeordnet.`, id);
      else {
        if (beaconIds.has(beaconId)) add("error", "beacon-duplicate", `${name} verwendet ${beaconId} mehrfach.`, id);
        beaconIds.add(beaconId);
        if (assignedBeacons.length && !assigned.has(beaconId)) add("error", "beacon-foreign", `${name} gehört nicht zu dieser Filiale.`, id);
      }
    }
  }
  for (const beacon of assignedBeacons) {
    const key = beacon.beaconCode || beacon.id || beacon.identityKey;
    if (key && !beaconIds.has(key)) add("warning", "beacon-unused", `Zugewiesener Beacon ${key} ist noch nicht platziert.`);
  }
  // Physical fixtures may intentionally touch. Overlap warnings prompt review, not publication denial.
  const fixtures = document.elements.filter((element): element is LayoutElement => element.type !== "beacon" && element.type !== "entrance");
  for (let i = 0; i < fixtures.length; i++) for (let j = i + 1; j < fixtures.length; j++) {
    if (overlaps(fixtures[i], fixtures[j])) add("warning", "overlap", `${fixtures[i].label || fixtures[i].type} überlappt ${fixtures[j].label || fixtures[j].type}.`, fixtures[j].id ?? null);
  }
  return issues;
}
