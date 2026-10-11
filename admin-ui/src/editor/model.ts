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
  beaconId?: string;
  beaconCode?: string;
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

export function documentSignature(document: LayoutDocument): string {
  // Export timestamps are metadata, not unsaved edits.
  const { exportDate: _exportDate, ...content } = document;
  void _exportDate;
  return JSON.stringify(content);
}

export function createEditorState(document: LayoutDocument): EditorState {
  const copy = clone(document);
  const ids = new Set(copy.elements.map((element) => String(element.id)));
  copy.elements = copy.elements.map((element, index) => {
    if (element.id !== undefined && element.id !== null) return element;
    let id = `legacy-${index + 1}`;
    while (ids.has(id)) id += "-";
    ids.add(id);
    return { ...element, id };
  });
  return { document: copy, past: [], future: [], selectedId: null, savedSignature: documentSignature(copy) };
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
      if (index < 0 || before.elements[index].locked) return state;
      next = replace({ ...before.elements[index], rotation: ((command.rotation % 360) + 360) % 360 });
      break;
    case "delete":
      if (index < 0 || before.elements[index].locked) return state;
      next = { ...before, elements: before.elements.filter((_, at) => at !== index) };
      if (selectedId === command.id) selectedId = null;
      break;
    case "duplicate": {
      if (index < 0 || before.elements.length >= 5000 || before.elements.some((element) => element.id === command.duplicateId)) return state;
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

export function newElementId(document: LayoutDocument): string {
  const ids = new Set(document.elements.map((element) => String(element.id)));
  let id: string;
  do { id = `el-${crypto.randomUUID()}`; } while (ids.has(id));
  return id;
}
