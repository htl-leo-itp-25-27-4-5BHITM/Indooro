/** The persisted layout format is shared with mobile and the legacy customer app. */
export interface LayoutElement {
  id?: string | number;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  label?: string;
  category?: string | null;
  meter?: number | null;
  layoutCode?: string;
  productPositions?: Array<string | number>;
  accessAngle?: number;
  beaconId?: string;
  beaconCode?: string;
  /** QR anchor id printed on the sticker; unique per layout, `[A-Z0-9-]{1,12}`. */
  anchorId?: string;
  identityKey?: string;
  locked?: boolean;
  [field: string]: unknown;
}

export interface LayoutDocument {
  shopName: string;
  gridSize: { width: number; height: number };
  elements: LayoutElement[];
  exportDate?: string;
  [field: string]: unknown;
}

export type ElementId = string | number;
export type EditorCommand =
  | { type: "create"; element: LayoutElement }
  | { type: "move"; id: ElementId; x: number; y: number }
  | { type: "resize"; id: ElementId; width: number; height: number }
  | { type: "rotate"; id: ElementId; rotation: number }
  | { type: "delete"; id: ElementId }
  | { type: "duplicate"; id: ElementId; duplicateId: ElementId }
  | { type: "reorder"; id: ElementId; direction: "forward" | "backward" }
  | { type: "patch"; id: ElementId; changes: Partial<LayoutElement> }
  | { type: "document"; changes: Partial<Pick<LayoutDocument, "shopName" | "gridSize">> };

export interface EditorState {
  document: LayoutDocument;
  past: LayoutDocument[];
  future: LayoutDocument[];
  savedSignature: string;
  selectedId: ElementId | null;
}

const MAX_HISTORY = 80;
const clone = <T,>(value: T): T => structuredClone(value);

/** Swift's existing LayoutElement decoder requires an Int64 JSON number. */
export const isMobileElementId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;
const freshNumericId = (used: Set<string>): number => {
  let id: number;
  do {
    const random = crypto.getRandomValues(new Uint32Array(2));
    id = (random[0] & 0x1fffff) * 0x100000000 + random[1];
  } while (!isMobileElementId(id) || used.has(String(id)));
  used.add(String(id));
  return id;
};

export function documentSignature(document: LayoutDocument): string {
  // Export timestamps are metadata, not unsaved edits.
  const { exportDate: _exportDate, ...content } = document;
  void _exportDate;
  return JSON.stringify(content);
}

export function createEditorState(document: LayoutDocument): EditorState {
  const copy = clone(document);
  const ids = new Set(copy.elements.map((element) => String(element.id)));
  copy.elements = copy.elements.map((element) => {
    if (element.id !== undefined && element.id !== null) return element;
    return { ...element, id: freshNumericId(ids) };
  });
  return { document: copy, past: [], future: [], selectedId: null, savedSignature: documentSignature(document) };
}

/** Import is one undoable edit and never changes the last server-saved signature. */
export function replaceDocument(state: EditorState, document: LayoutDocument): EditorState {
  const imported = createEditorState(document).document;
  if (documentSignature(imported) === documentSignature(state.document)) return state;
  return { ...state, document: imported, past: [...state.past, clone(state.document)].slice(-MAX_HISTORY), future: [], selectedId: null };
}

export function parseImportedDocument(value: unknown): LayoutDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Die Datei enthält keinen Grundriss.");
  const document = value as Partial<LayoutDocument>;
  const grid = document.gridSize;
  if (typeof document.shopName !== "string" || !grid || !Number.isFinite(grid.width) || !Number.isFinite(grid.height)
    || grid.width <= 0 || grid.height <= 0 || grid.width > 1000 || grid.height > 1000) {
    throw new Error("Filialname oder Rastergröße sind ungültig.");
  }
  if (!Array.isArray(document.elements) || document.elements.length > 5000) throw new Error("Die Elementliste ist ungültig oder zu groß.");
  const ids = new Set<string>();
  for (const item of document.elements) {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.type !== "string" || !item.type.trim()
      || !Number.isFinite(item.x) || !Number.isFinite(item.y)
      || (item.width !== undefined && (!Number.isFinite(item.width) || item.width < 0))
      || (item.height !== undefined && (!Number.isFinite(item.height) || item.height < 0))
      || (item.rotation !== undefined && !Number.isFinite(item.rotation))
      || (item.label !== undefined && typeof item.label !== "string")
      || (item.id !== undefined && typeof item.id !== "number" && typeof item.id !== "string")) {
      throw new Error("Mindestens ein Element enthält ungültige Daten.");
    }
    if (item.id !== undefined) {
      const id = String(item.id);
      if (ids.has(id)) throw new Error("Element-IDs müssen eindeutig sein.");
      ids.add(id);
    }
  }
  return document as LayoutDocument;
}

export function isDirty(state: EditorState): boolean {
  return documentSignature(state.document) !== state.savedSignature;
}

export function markSaved(state: EditorState, savedDocument: LayoutDocument = state.document): EditorState {
  return { ...state, savedSignature: documentSignature(savedDocument) };
}

export function selectElement(state: EditorState, id: ElementId | null): EditorState {
  if (id !== null && !state.document.elements.some((element) => element.id === id)) return state;
  return { ...state, selectedId: id };
}

export function snap(value: number, step = 1, enabled = true): number {
  if (!Number.isFinite(value)) return 0;
  return enabled ? Math.round(value / Math.max(step, 0.001)) * Math.max(step, 0.001) : value;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);
const isPoint = (element: LayoutElement) => element.type === "beacon";

export function constrainElement(element: LayoutElement, document: LayoutDocument, snapStep = 1, snapping = true): LayoutElement {
  const point = isPoint(element);
  const width = point ? 0 : Math.max(0.1, Math.min(Number(element.width) || 1, document.gridSize.width));
  const height = point ? 0 : Math.max(0.1, Math.min(Number(element.height) || 1, document.gridSize.height));
  const x = clamp(snap(Number(element.x), snapStep, snapping), 0, Math.max(0, document.gridSize.width - width));
  const y = clamp(snap(Number(element.y), snapStep, snapping), 0, Math.max(0, document.gridSize.height - height));
  return point ? { ...element, x, y } : { ...element, x, y, width, height };
}

export function applyCommand(state: EditorState, command: EditorCommand, snapStep = 1, snapping = true): EditorState {
  const before = state.document;
  let next: LayoutDocument = before;
  let selectedId = state.selectedId;
  const index = "id" in command ? before.elements.findIndex((element) => element.id === command.id) : -1;
  const replace = (replacement: LayoutElement) => ({ ...before, elements: before.elements.map((element, at) => at === index ? replacement : element) });

  switch (command.type) {
    case "create": {
      if (before.elements.length >= 5000 || command.element.id == null || before.elements.some((element) => element.id === command.element.id)) return state;
      const element = constrainElement(command.element, before, snapStep, snapping);
      next = { ...before, elements: [...before.elements, element] };
      selectedId = element.id ?? null;
      break;
    }
    case "move":
      if (index < 0 || before.elements[index].locked) return state;
      next = replace(constrainElement({ ...before.elements[index], x: command.x, y: command.y }, before, snapStep, snapping));
      break;
    case "resize":
      if (index < 0 || before.elements[index].locked || isPoint(before.elements[index])) return state;
      next = replace(constrainElement({ ...before.elements[index], width: snap(command.width, snapStep, snapping), height: snap(command.height, snapStep, snapping) }, before, snapStep, snapping));
      break;
    case "rotate":
      if (index < 0 || before.elements[index].locked || !Number.isFinite(command.rotation)) return state;
      next = replace({ ...before.elements[index], rotation: ((Math.round(command.rotation * 10) / 10 % 360) + 360) % 360 });
      break;
    case "delete":
      if (index < 0 || before.elements[index].locked) return state;
      next = { ...before, elements: before.elements.filter((_, at) => at !== index) };
      if (selectedId === command.id) selectedId = null;
      break;
    case "duplicate": {
      if (index < 0 || before.elements[index].locked || before.elements.length >= 5000 || before.elements.some((element) => element.id === command.duplicateId)) return state;
      const source = before.elements[index];
      const copy = constrainElement({ ...clone(source), id: command.duplicateId, x: source.x + 1, y: source.y + 1, locked: false,
        // Beacon hardware identity is unique to one placement.
        ...(source.type === "beacon" ? { beaconId: undefined, beaconCode: undefined, beaconDbId: undefined, beaconIdentity: undefined, identityKey: undefined, uuid: undefined, beaconUUID: undefined, major: undefined, minor: undefined, beaconMajor: undefined, beaconMinor: undefined } : {})
      }, before, snapStep, snapping);
      next = { ...before, elements: [...before.elements.slice(0, index + 1), copy, ...before.elements.slice(index + 1)] };
      selectedId = command.duplicateId;
      break;
    }
    case "reorder": {
      const destination = index + (command.direction === "forward" ? 1 : -1);
      if (index < 0 || before.elements[index].locked || destination < 0 || destination >= before.elements.length) return state;
      const elements = [...before.elements];
      [elements[index], elements[destination]] = [elements[destination], elements[index]];
      next = { ...before, elements };
      break;
    }
    case "patch": {
      if (index < 0 || (before.elements[index].locked && command.changes.locked !== false)) return state;
      // Geometry has dedicated commands so inspector changes cannot bypass constraints.
      const { id: _id, x: _x, y: _y, width: _width, height: _height, rotation: _rotation, ...safeChanges } = command.changes;
      void _id; void _x; void _y; void _width; void _height; void _rotation;
      next = replace({ ...before.elements[index], ...safeChanges });
      break;
    }
    case "document": {
      const changes = command.changes;
      if (changes.gridSize) {
        const width = Number(changes.gridSize.width);
        const height = Number(changes.gridSize.height);
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 1000 || height > 1000) return state;
      }
      next = { ...before, ...changes };
      break;
    }
  }
  if (documentSignature(next) === documentSignature(before)) return state;
  return { ...state, document: clone(next), past: [...state.past, clone(before)].slice(-MAX_HISTORY), future: [], selectedId };
}

export function undo(state: EditorState): EditorState {
  if (!state.past.length) return state;
  const document = state.past[state.past.length - 1];
  return { ...state, document, past: state.past.slice(0, -1), future: [state.document, ...state.future], selectedId: document.elements.some((element) => element.id === state.selectedId) ? state.selectedId : null };
}

export function redo(state: EditorState): EditorState {
  if (!state.future.length) return state;
  const document = state.future[0];
  return { ...state, document, past: [...state.past, state.document].slice(-MAX_HISTORY), future: state.future.slice(1), selectedId: document.elements.some((element) => element.id === state.selectedId) ? state.selectedId : null };
}

export function newElementId(document: LayoutDocument): number {
  const ids = new Set(document.elements.map((element) => String(element.id)));
  return freshNumericId(ids);
}

/** One undoable migration for candidate versions created before numeric IDs were enforced. */
export function repairMobileElementIds(document: LayoutDocument): LayoutDocument {
  const ids = new Set(document.elements.filter((element) => isMobileElementId(element.id)).map((element) => String(element.id)));
  return { ...document, elements: document.elements.map((element) => isMobileElementId(element.id) ? element : { ...element, id: freshNumericId(ids) }) };
}
