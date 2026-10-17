import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ApiClient } from "../api/client";
import { fitViewport, screenToWorld, zoomAt, type Point, type Viewport } from "./geometry";
import { assignShelfSections, chooseShelfCategory, elementFill, nextAnchorId, shelfMetadata, shelfMetadataChanges } from "./metadata";
import { applyCommand, createEditorState, isDirty, isMobileElementId, markSaved, newElementId, parseImportedDocument, redo, repairMobileElementIds, replaceDocument, selectElement, undo, type EditorCommand, type EditorState, type ElementId, type LayoutDocument, type LayoutElement } from "./model";
import { validateLayout, type AssignedBeacon } from "./validation";
import { UnderlayPanel } from "./UnderlayPanel";
import type { LayoutUnderlay } from "./underlay";
import "./LayoutEditor.css";

const TYPES = [
  { type: "shelf", label: "Regal", color: "#557b8f", width: 4, height: 2 },
  { type: "counter", label: "Theke", color: "#8e6989", width: 4, height: 2 },
  { type: "cooler", label: "Kühlregal", color: "#5a87ac", width: 4, height: 2 },
  { type: "freezer", label: "Tiefkühlregal", color: "#598ca0", width: 4, height: 2 },
  { type: "entrance", label: "Eingang", color: "#3b9a81", width: 3, height: 1 },
  { type: "checkout", label: "Kasse", color: "#b98049", width: 3, height: 2 },
  { type: "wall", label: "Wand", color: "#667085", width: 5, height: 0.5 },
  { type: "poi", label: "POI", color: "#947da6", width: 2, height: 2 },
  { type: "beacon", label: "Beacon", color: "#b6635f", width: 0, height: 0 },
  { type: "anchor", label: "QR-Anker", color: "#1f2937", width: 1, height: 1 },
] as const;

const TEMPLATES = [
  { label: "Kleiner Laden", width: 15, height: 20 },
  { label: "Mittlerer Laden", width: 40, height: 60 },
  { label: "Großer Laden", width: 60, height: 80 },
] as const;

type Tool = "select" | "pan" | "create";
type Gesture =
  | { kind: "pan"; start: Point; viewport: Viewport }
  | { kind: "create"; start: Point; element: LayoutElement }
  | { kind: "move" | "resize" | "rotate"; id: ElementId; start: Point; element: LayoutElement; initialAngle?: number };

export interface LayoutEditorProps {
  api?: ApiClient;
  initialDocument: LayoutDocument;
  mode: "store" | "legacy";
  storeId?: string;
  storeName?: string;
  assignedBeacons?: AssignedBeacon[];
  saveMode?: "draft" | "immediate";
  onSaveDraft?: (document: LayoutDocument) => Promise<unknown>;
  onSaveCurrent?: (document: LayoutDocument) => Promise<unknown>;
  onPublish?: (document: LayoutDocument) => Promise<unknown>;
  publishLabel?: string;
  publishPrompt?: string;
  allowUnchangedSave?: boolean;
  onBack?: () => void;
}

const labelFor = (element: LayoutElement) => element.label || TYPES.find((item) => item.type === element.type)?.label || element.type;
const number = (value: string, fallback: number) => Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback;
const confirmCriticalDelete = (element: LayoutElement) => !(["entrance", "exit", "checkout", "cashier", "wall", "shelf", "aisle", "beacon", "navigation-node"].includes(element.type)
  || (Array.isArray(element.productPositions) && element.productPositions.length > 0)
  || !!element.layoutCode) || window.confirm(`„${labelFor(element)}“ löschen? Die Karte oder Produktpositionen können danach ungültig sein.`);
const publishWarningNote = (issues: ReturnType<typeof validateLayout>) => {
  const warnings = issues.filter((issue) => issue.severity === "warning");
  if (!warnings.length) return "";
  const details = warnings.slice(0, 5).map((issue) => `• ${issue.message}`).join("\n");
  const remaining = warnings.length > 5 ? `\n… und ${warnings.length - 5} weitere Hinweise in der Prüfung.` : "";
  return `\n\n${warnings.length} Hinweis${warnings.length === 1 ? "" : "e"} bleiben offen:\n${details}${remaining}`;
};

export function LayoutEditor({ api, initialDocument, mode, storeId, storeName, assignedBeacons = [], saveMode = "draft", onSaveDraft, onSaveCurrent, onPublish, publishLabel = "Veröffentlichen", publishPrompt = "Diesen gespeicherten Entwurf veröffentlichen? Die mobile Ansicht verwendet danach diese Version.", allowUnchangedSave = false, onBack }: LayoutEditorProps) {
  const [editor, setEditor] = useState<EditorState>(() => createEditorState(initialDocument));
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const [tool, setTool] = useState<Tool>("select");
  const [createType, setCreateType] = useState<(typeof TYPES)[number]["type"]>("shelf");
  const [snapping, setSnapping] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [viewport, setViewport] = useState<Viewport>({ x: 40, y: 40, scale: 12 });
  const [canvasSize, setCanvasSize] = useState({ width: 720, height: 540 });
  const [preview, setPreview] = useState<LayoutElement | null>(null);
  const [keyboardPoint, setKeyboardPoint] = useState<Point>(() => ({ x: initialDocument.gridSize.width / 2, y: initialDocument.gridSize.height / 2 }));
  const [working, setWorking] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newPosition, setNewPosition] = useState("");
  const [categories, setCategories] = useState<Array<{ categoryCode: number; categoryName: string }>>([]);
  const [categoryError, setCategoryError] = useState(false);
  const [categoryRevision, setCategoryRevision] = useState(0);
  const [underlay, setUnderlay] = useState<LayoutUnderlay | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const previewRef = useRef<LayoutElement | null>(null);
  const spaceHeld = useRef(false);
  const keyboardPointRef = useRef(keyboardPoint);
  keyboardPointRef.current = keyboardPoint;
  const placementTypeRef = useRef(createType);
  placementTypeRef.current = createType;
  const toolRef = useRef(tool);
  toolRef.current = tool;

  const document = editor.document;
  const documentRef = useRef(document);
  documentRef.current = document;
  const dirty = isDirty(editor);
  const issues = useMemo(() => validateLayout(document, assignedBeacons, mode === "store"), [document, assignedBeacons, mode]);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const invalidMobileIds = document.elements.filter((element) => !isMobileElementId(element.id)).length;
  const brokenShelfAddresses = issues.some((issue) => ["shelf-category", "shelf-section", "shelf-address-duplicate"].includes(issue.code));
  const selected = document.elements.find((element) => element.id === editor.selectedId) ?? null;
  const selectedIndex = document.elements.findIndex((element) => element.id === editor.selectedId);
  const placedBeaconCodes = new Set(document.elements.filter((element) => element.type === "beacon" && element.id !== selected?.id).map((element) => element.beaconId));

  useEffect(() => { setNewPosition(""); }, [editor.selectedId]);

  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    api.get<Array<{ categoryCode: number; categoryName: string }>>("/api/categories?size=500", { signal: controller.signal })
      .then((items) => {
        if (controller.signal.aborted) return;
        setCategories(Array.isArray(items) ? items.filter((item) => Number.isInteger(item.categoryCode) && typeof item.categoryName === "string") : []);
        setCategoryError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setCategoryError(true); });
    return () => controller.abort();
  }, [api, categoryRevision]);

  const createAtWorld = (world: Point, type: (typeof TYPES)[number]["type"]) => {
    const definition = TYPES.find((item) => item.type === type)!;
    let beacon: AssignedBeacon | undefined;
    if (type === "beacon" && mode === "store") {
      const placed = new Set(editorRef.current.document.elements.filter((element) => element.type === "beacon").map((element) => element.beaconId));
      beacon = assignedBeacons.find((item) => item.beaconCode && !placed.has(item.beaconCode));
      if (!beacon) { setMessage("Keine freien zugeordneten Beacons verfügbar."); return; }
    }
    const x = type === "beacon" ? world.x : world.x - definition.width / 2;
    const y = type === "beacon" ? world.y : world.y - definition.height / 2;
    dispatch({ type: "create", element: { id: newElementId(editorRef.current.document), type, x, y, accessAngle: 90,
      ...(type === "beacon" ? { beaconId: beacon?.beaconCode, beaconDbId: beacon?.beaconId, identityKey: beacon?.identityKey, uuid: beacon?.uuid, major: beacon?.major, minor: beacon?.minor } : { width: definition.width, height: definition.height }),
      ...(type === "anchor" ? { anchorId: nextAnchorId(editorRef.current.document) } : {}) } });
    setTool("select");
  };
  const placeKeyboardElement = () => createAtWorld(keyboardPointRef.current, placementTypeRef.current);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      setViewport((current) => zoomAt(current, { x: event.clientX - rect.left, y: event.clientY - rect.top }, Math.exp(-event.deltaY * 0.0015)));
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    setViewport(fitViewport(document.gridSize, canvasSize));
    // Fit on initial size and document switch; routine edits retain the viewport.
  }, [canvasSize.width, canvasSize.height, initialDocument]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty(editorRef.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const target = event.target;
      // `document` is shadowed by the layout document in this component, so the browser document is addressed explicitly.
      if (!(target instanceof Element) || (target !== window.document.body && !target.closest(".le"))) return;
      if (target.closest("button, a, input, textarea, select, summary, [contenteditable], [role='button']")) return;
      if (event.code === "Space") {
        spaceHeld.current = true;
        event.preventDefault();
      }
      if (toolRef.current === "create" && event.target === svgRef.current && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const definition = TYPES.find((item) => item.type === placementTypeRef.current)!;
        const current = keyboardPointRef.current;
        const step = event.shiftKey ? 5 : 1;
        const halfWidth = definition.width / 2;
        const halfHeight = definition.height / 2;
        const x = Math.max(halfWidth, Math.min(documentRef.current.gridSize.width - halfWidth, current.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0)));
        const y = Math.max(halfHeight, Math.min(documentRef.current.gridSize.height - halfHeight, current.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0)));
        keyboardPointRef.current = { x, y };
        setKeyboardPoint({ x, y });
        return;
      }
      if (toolRef.current === "create" && event.target === svgRef.current && event.key === "Enter") {
        event.preventDefault();
        placeKeyboardElement();
        return;
      }
      if (event.key.toLowerCase() === "v" && !event.metaKey && !event.ctrlKey) setTool("select");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setEditor((current) => event.shiftKey ? redo(current) : undo(current));
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        setEditor(redo);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const id = editorRef.current.selectedId;
        const element = editorRef.current.document.elements.find((item) => item.id === id);
        if (element && !element.locked && confirmCriticalDelete(element)) setEditor((current) => applyCommand(current, { type: "delete", id: element.id! }));
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        const id = editorRef.current.selectedId;
        const element = editorRef.current.document.elements.find((item) => item.id === id);
        if (element && !element.locked) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          setEditor((current) => applyCommand(current, {
            type: "move", id: element.id!, x: element.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
            y: element.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
          }));
        }
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const id = editorRef.current.selectedId;
        if (id !== null && !editorRef.current.document.elements.find((item) => item.id === id)?.locked) setEditor((current) => applyCommand(current, { type: "duplicate", id, duplicateId: newElementId(current.document), anchorId: nextAnchorId(current.document) }));
      } else if (event.key === "Escape") {
        setTool("select");
        setEditor((current) => selectElement(current, null));
      }
    };
    const keyUp = (event: KeyboardEvent) => { if (event.code === "Space") spaceHeld.current = false; };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); };
  }, []);

  const issueFor = (id: ElementId | undefined) => issues.some((issue) => issue.severity === "error" && issue.elementId === id);
  const dispatch = (command: EditorCommand) => { setEditor((current) => applyCommand(current, command, 1, snapping)); setMessage(null); };
  const localPoint = (event: ReactPointerEvent<SVGElement>): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const capture = (event: ReactPointerEvent<SVGElement>) => svgRef.current?.setPointerCapture(event.pointerId);
  const startGesture = (event: ReactPointerEvent<SVGElement>, next: Gesture) => { gesture.current = next; capture(event); event.stopPropagation(); event.preventDefault(); };

  const onBackgroundDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    const at = localPoint(event);
    if (tool === "pan" || spaceHeld.current || event.button === 1) {
      startGesture(event, { kind: "pan", start: at, viewport });
      return;
    }
    if (tool === "create") {
      const world = screenToWorld(at, viewport);
      // Beacons and QR anchors are placed by a single click at a fixed size.
      if (createType === "beacon" || createType === "anchor") createAtWorld(world, createType);
      else {
        const definition = TYPES.find((item) => item.type === createType)!;
        const element: LayoutElement = { id: newElementId(editorRef.current.document), type: createType, x: world.x - definition.width / 2, y: world.y - definition.height / 2, width: definition.width, height: definition.height, accessAngle: 90 };
        startGesture(event, { kind: "create", start: world, element });
      }
    } else setEditor((current) => selectElement(current, null));
  };

  const onElementDown = (event: ReactPointerEvent<SVGElement>, element: LayoutElement) => {
    if (tool === "pan" || spaceHeld.current || event.button === 1) { startGesture(event, { kind: "pan", start: localPoint(event), viewport }); return; }
    if (tool === "create") return;
    setEditor((current) => selectElement(current, element.id ?? null));
    if (element.locked || element.id == null) { event.stopPropagation(); return; }
    startGesture(event, { kind: "move", id: element.id, start: screenToWorld(localPoint(event), viewport), element });
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active) return;
    const at = localPoint(event);
    if (active.kind === "pan") { setViewport({ ...active.viewport, x: active.viewport.x + at.x - active.start.x, y: active.viewport.y + at.y - active.start.y }); return; }
    const world = screenToWorld(at, viewport);
    const setGesturePreview = (element: LayoutElement) => { previewRef.current = element; setPreview(element); };
    if (active.kind === "create") {
      const dx = world.x - active.start.x;
      const dy = world.y - active.start.y;
      if (Math.hypot(dx, dy) > 0.2) {
        const width = snapping ? Math.max(1, Math.round(Math.abs(dx))) : Math.max(0.1, Math.abs(dx));
        const height = snapping ? Math.max(1, Math.round(Math.abs(dy))) : Math.max(0.1, Math.abs(dy));
        setGesturePreview({ ...active.element, x: Math.min(active.start.x, world.x), y: Math.min(active.start.y, world.y), width, height });
      } else setGesturePreview(active.element);
    } else if (active.kind === "move") {
      setGesturePreview({ ...active.element, x: active.element.x + world.x - active.start.x, y: active.element.y + world.y - active.start.y });
    } else if (active.kind === "resize") {
      const angle = (active.element.rotation || 0) * Math.PI / 180;
      const dx = world.x - active.start.x;
      const dy = world.y - active.start.y;
      setGesturePreview({ ...active.element, width: Math.max(0.1, (active.element.width || 1) + dx * Math.cos(angle) + dy * Math.sin(angle)), height: Math.max(0.1, (active.element.height || 1) - dx * Math.sin(angle) + dy * Math.cos(angle)) });
    } else {
      const cx = active.element.x + (active.element.width || 0) / 2;
      const cy = active.element.y + (active.element.height || 0) / 2;
      const currentAngle = Math.atan2(world.y - cy, world.x - cx) * 180 / Math.PI;
      setGesturePreview({ ...active.element, rotation: (active.element.rotation || 0) + currentAngle - (active.initialAngle || 0) });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const active = gesture.current;
    if (!active) return;
    const finalPreview = previewRef.current;
    if (active.kind === "create") {
      const end = screenToWorld(localPoint(event), viewport);
      const dx = end.x - active.start.x;
      const dy = end.y - active.start.y;
      const element = Math.hypot(dx, dy) > 0.2
        ? { ...active.element, x: Math.min(active.start.x, end.x), y: Math.min(active.start.y, end.y), width: snapping ? Math.max(1, Math.round(Math.abs(dx))) : Math.max(0.1, Math.abs(dx)), height: snapping ? Math.max(1, Math.round(Math.abs(dy))) : Math.max(0.1, Math.abs(dy)) }
        : active.element;
      dispatch({ type: "create", element });
    } else if (active.kind !== "pan" && finalPreview) {
      if (active.kind === "move") dispatch({ type: "move", id: active.id, x: finalPreview.x, y: finalPreview.y });
      if (active.kind === "resize") dispatch({ type: "resize", id: active.id, width: finalPreview.width || 1, height: finalPreview.height || 1 });
      if (active.kind === "rotate") dispatch({ type: "rotate", id: active.id, rotation: finalPreview.rotation || 0 });
    }
    gesture.current = null;
    previewRef.current = null;
    setPreview(null);
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  };

  const onPointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    gesture.current = null;
    previewRef.current = null;
    setPreview(null);
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  };

  const saveDocument = async () => {
    const saveAction = saveMode === "immediate" ? onSaveCurrent : onSaveDraft;
    if (!saveAction || working || (!dirty && !allowUnchangedSave) || (saveMode === "immediate" && errors > 0)) return;
    const warningNote = publishWarningNote(issues);
    if (saveMode === "immediate" && !window.confirm(`Das globale Layout jetzt für alle Kunden veröffentlichen? Diese Änderung ist sofort sichtbar.${warningNote}`)) return;
    const saved = structuredClone(editorRef.current.document);
    setWorking("save"); setMessage(null);
    try {
      await saveAction(saved);
      setEditor((current) => markSaved(current, saved));
      setMessage(saveMode === "immediate" ? "Globales Layout veröffentlicht." : "Entwurf gespeichert.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Layout konnte nicht gespeichert werden."); }
    finally { setWorking(null); }
  };

  const publish = async () => {
    if (!onPublish || working || dirty || errors) return;
    const warningNote = publishWarningNote(issues);
    if (!window.confirm(`${publishPrompt}${warningNote}`)) return;
    setWorking("publish"); setMessage(null);
    try { await onPublish(structuredClone(editorRef.current.document)); setMessage("Layout veröffentlicht."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Veröffentlichung fehlgeschlagen."); }
    finally { setWorking(null); }
  };

  const exportDocument = () => {
    const current = structuredClone(editorRef.current.document);
    const data = { ...current, exportDate: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${(current.shopName || "layout").trim().replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 80) || "layout"}_layout.json`;
    window.document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage("Grundriss als JSON heruntergeladen. Der Serverstand wurde nicht geändert.");
  };

  const importDocument = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error("Die JSON-Datei darf höchstens 5 MB groß sein.");
      const imported = parseImportedDocument(JSON.parse(await file.text()) as unknown);
      if (isDirty(editorRef.current) && !window.confirm("Ungespeicherte Änderungen durch den Import ersetzen? Rückgängig bleibt möglich.")) return;
      setEditor((current) => replaceDocument(current, imported));
      setTool("select");
      setMessage("Grundriss importiert. Bitte prüfen und als Entwurf speichern.");
    } catch (error) {
      setMessage(error instanceof Error ? `Import fehlgeschlagen: ${error.message}` : "Import fehlgeschlagen.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const startNewLayout = () => {
    if (!window.confirm("Neues Layout starten? Alle aktuellen Elemente werden entfernt. Rückgängig bleibt möglich.")) return;
    setEditor((current) => replaceDocument(current, { ...current.document, elements: [] }));
    setTool("select");
    setMessage("Neuer leerer Grundriss. Änderungen erst speichern, wenn er übernommen werden soll.");
  };

  const applyTemplate = (template: (typeof TEMPLATES)[number]) => {
    if (editorRef.current.document.elements.length && !window.confirm(`${template.label} (${template.width} × ${template.height}) anwenden? Alle aktuellen Elemente werden entfernt. Rückgängig bleibt möglich.`)) return;
    setEditor((current) => replaceDocument(current, { ...current.document, gridSize: { width: template.width, height: template.height }, elements: [] }));
    setTool("select");
    setKeyboardPoint({ x: template.width / 2, y: template.height / 2 });
    setMessage(`${template.label} ausgewählt. Der neue Grundriss ist noch nicht gespeichert.`);
  };

  const changeNumber = (field: "x" | "y" | "width" | "height" | "rotation", value: string) => {
    if (!selected?.id && selected?.id !== 0) return;
    const parsed = number(value, Number(selected[field]) || 0);
    if (field === "x" || field === "y") dispatch({ type: "move", id: selected.id, x: field === "x" ? parsed : selected.x, y: field === "y" ? parsed : selected.y });
    if (field === "width" || field === "height") dispatch({ type: "resize", id: selected.id, width: field === "width" ? parsed : selected.width || 1, height: field === "height" ? parsed : selected.height || 1 });
    if (field === "rotation") dispatch({ type: "rotate", id: selected.id, rotation: parsed });
  };

  return <section className="le" aria-label="Layout-Editor">
    <header className="le-header">
      <div className="le-heading"><span className="le-kicker">INDOORO · GRUNDRISS</span><h1>{storeName || document.shopName || "Neuer Grundriss"}</h1><span className="le-context">{mode === "store" ? "Filiallayout" : "Globales Legacy-Layout · nur Admin"}</span></div>
      <div className="le-actions">
        {onBack && <button type="button" className="le-button le-quiet" onClick={() => { if (!dirty || window.confirm("Ungespeicherte Änderungen verwerfen?")) onBack(); }}>Zurück</button>}
        <button type="button" className="le-button" onClick={exportDocument}>JSON exportieren</button>
        <button type="button" className="le-button" onClick={() => importRef.current?.click()} disabled={!!working}>JSON importieren</button>
        <input ref={importRef} className="le-file-input" type="file" accept=".json,application/json" aria-label="Grundrissdatei importieren" onChange={(event) => void importDocument(event.target.files?.[0])} />
        <span className={`le-save-indicator ${dirty ? "is-dirty" : ""}`}>{dirty ? "● Ungespeicherte Änderungen" : "✓ Gespeichert"}</span>
        <button type="button" className={`le-button ${saveMode === "immediate" ? "le-primary" : ""}`} aria-disabled={!(saveMode === "immediate" ? onSaveCurrent : onSaveDraft) || (!dirty && !allowUnchangedSave) || !!working || (saveMode === "immediate" && errors > 0)} onClick={saveDocument}>{working === "save" ? "Speichert …" : saveMode === "immediate" ? "Global veröffentlichen" : "Entwurf speichern"}</button>
        {saveMode === "draft" && <button type="button" className="le-button le-primary" disabled={!onPublish || dirty || errors > 0 || !!working} onClick={publish}>{working === "publish" ? "Veröffentlicht …" : publishLabel}</button>}
      </div>
    </header>
    {message && <p className="le-message" role="status">{message}</p>}
    <div className="le-body">
      <aside className="le-left" aria-label="Werkzeuge und Elemente">
        <h2>Werkzeuge</h2>
        <div className="le-tool-row"><button type="button" aria-pressed={tool === "select"} onClick={() => setTool("select")}>Auswählen <kbd>V</kbd></button><button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")}>Verschieben <kbd>Space</kbd></button></div>
        <button type="button" className="le-button le-new-layout" onClick={startNewLayout} disabled={!!working}>Neues Layout</button>
        {invalidMobileIds > 0 && <button type="button" className="le-button le-new-layout" disabled={!!working} onClick={() => {
          if (!window.confirm(`${invalidMobileIds} Element-ID${invalidMobileIds === 1 ? "" : "s"} für die iOS-Karte numerisch neu vergeben? Der Schritt kann rückgängig gemacht werden.`)) return;
          setEditor((current) => replaceDocument(current, repairMobileElementIds(current.document)));
          setMessage("Element-IDs für die iOS-Karte repariert. Bitte den Grundriss prüfen und speichern.");
        }}>iOS-IDs reparieren</button>}
        {brokenShelfAddresses && <button type="button" className="le-button le-new-layout" disabled={!!working} onClick={() => {
          if (!window.confirm("Fehlende oder doppelte Regalabschnitte zuweisen? Bestehende eindeutige Abschnitte bleiben erhalten. Bitte Produktziele danach prüfen; Rückgängig ist möglich.")) return;
          const repaired = assignShelfSections(editorRef.current.document);
          if (JSON.stringify(repaired) === JSON.stringify(editorRef.current.document)) { setMessage("Bitte zuerst einen gültigen numerischen Kategoriecode eingeben."); return; }
          setEditor((current) => replaceDocument(current, repaired));
          setMessage("Regalabschnitte zugewiesen. Bitte Produktziele prüfen und den Grundriss speichern.");
        }}>Regalabschnitte zuweisen</button>}
        <h2>Vorlagen</h2>
        <div className="le-templates">{TEMPLATES.map((template) => <button type="button" key={template.label} disabled={!!working} onClick={() => applyTemplate(template)}>{template.label}<span>{template.width} × {template.height} m</span></button>)}</div>
        {mode === "store" && api && storeId && <UnderlayPanel api={api} storeId={storeId} underlay={underlay} onChange={setUnderlay} />}
        <h2>Elemente</h2><p id="le-keyboard-help" className="le-hint">Tastatur: Element wählen, Tab zum Grundriss, Pfeile positionieren, Enter platzieren. Bei ausgewählter Ebene bewegen Pfeile das Element; Shift + Pfeil bewegt schneller. Escape beendet das Werkzeug. Eigenschaften stehen rechts.</p>
        <div className="le-library">{TYPES.map((item) => <button type="button" key={item.type} aria-pressed={tool === "create" && createType === item.type} onClick={() => { setCreateType(item.type); setTool("create"); setKeyboardPoint({ x: document.gridSize.width / 2, y: document.gridSize.height / 2 }); }}><span className="le-swatch" style={{ background: item.color }} />{item.label}</button>)}</div>
        <h2>Ebenen <span>{document.elements.length}</span></h2>
        <ul className="le-layers">{document.elements.length ? document.elements.map((element, index) => <li key={`${element.id ?? "missing"}-${index}`}><button type="button" aria-current={editor.selectedId === element.id} onClick={() => setEditor((current) => selectElement(current, element.id ?? null))}><span className="le-layer-index">{String(index + 1).padStart(2, "0")}</span><span>{labelFor(element)}</span>{element.locked && <span title="Gesperrt">🔒</span>}{issueFor(element.id) && <span className="le-error-dot" title="Validierungsfehler">!</span>}</button></li>) : <li className="le-empty">Noch keine Elemente</li>}</ul>
      </aside>
      <div className="le-center">
        <div className="le-canvas-toolbar"><span>{document.gridSize.width} × {document.gridSize.height} Rastereinheiten</span><label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Raster</label><label><input type="checkbox" checked={snapping} onChange={(event) => setSnapping(event.target.checked)} /> Einrasten</label><button type="button" onClick={() => setEditor(undo)} disabled={!editor.past.length} title="Rückgängig" aria-label="Rückgängig">↶</button><button type="button" onClick={() => setEditor(redo)} disabled={!editor.future.length} title="Wiederholen" aria-label="Wiederholen">↷</button><button type="button" onClick={() => setViewport((current) => zoomAt(current, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, 1.2))} aria-label="Vergrößern">＋</button><span>{viewport.scale.toFixed(1)} px/E</span><button type="button" onClick={() => setViewport((current) => zoomAt(current, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, 1 / 1.2))} aria-label="Verkleinern">－</button><button type="button" onClick={() => setViewport(fitViewport(document.gridSize, canvasSize))}>Einpassen</button></div>
        <div className="le-mobile-controls" aria-label="Mobile Grundrisswerkzeuge">
          <div className="le-tool-row">
            <button type="button" aria-pressed={tool === "select"} onClick={() => setTool("select")}>Auswählen</button>
            <button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")}>Verschieben</button>
          </div>
          <label>Elementtyp<select aria-label="Elementtyp" value={createType} onChange={(event) => { setCreateType(event.target.value as (typeof TYPES)[number]["type"]); setTool("create"); }}>
            {TYPES.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}
          </select></label>
        </div>
        <svg ref={svgRef} tabIndex={0} className={`le-canvas le-tool-${tool}`} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none" onPointerDown={onBackgroundDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} aria-label="Interaktiver Grundriss" aria-describedby="le-keyboard-help" role="group">
          <defs><pattern id="le-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#d9e2df" strokeWidth={0.045} /></pattern><clipPath id="le-underlay-clip"><rect x="0" y="0" width={document.gridSize.width} height={document.gridSize.height} /></clipPath></defs>
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <rect x={0} y={0} width={document.gridSize.width} height={document.gridSize.height} fill="#fff" stroke="#aabfba" strokeWidth={1 / viewport.scale} />
            {underlay && (() => {
              const scale = underlay.scaleMPerPx ?? document.gridSize.width / underlay.widthPx;
              const width = underlay.widthPx * scale;
              const height = underlay.heightPx * scale;
              const cx = underlay.offsetXM + width / 2;
              const cy = underlay.offsetYM + height / 2;
              return <g clipPath="url(#le-underlay-clip)" pointerEvents="none"><image href={`data:${underlay.contentType};base64,${underlay.imageBase64}`} x={underlay.offsetXM} y={underlay.offsetYM} width={width} height={height} opacity={underlay.opacity} transform={`rotate(${underlay.rotationDeg} ${cx} ${cy})`} preserveAspectRatio="none" /></g>;
            })()}
            {showGrid && <rect x={0} y={0} width={document.gridSize.width} height={document.gridSize.height} fill="url(#le-grid)" pointerEvents="none" />}
            {tool === "create" && createType !== "beacon" && <rect className="le-keyboard-preview" x={keyboardPoint.x - (TYPES.find((item) => item.type === createType)?.width || 0) / 2} y={keyboardPoint.y - (TYPES.find((item) => item.type === createType)?.height || 0) / 2} width={TYPES.find((item) => item.type === createType)?.width} height={TYPES.find((item) => item.type === createType)?.height} rx=".2" />}
            {tool === "create" && createType === "beacon" && <circle className="le-keyboard-preview" cx={keyboardPoint.x} cy={keyboardPoint.y} r=".35" />}
            {[...document.elements, ...(preview && !document.elements.some((item) => item.id === preview.id) ? [preview] : [])].map((stored, index) => {
              const element = preview && preview.id === stored.id ? preview : stored;
              const definition = TYPES.find((item) => item.type === element.type);
              const active = element.id === editor.selectedId;
              const point = element.type === "beacon";
              const w = point ? 0 : element.width || 1;
              const h = point ? 0 : element.height || 1;
              const cx = element.x + w / 2;
              const cy = element.y + h / 2;
              const rotation = element.rotation || 0;
              return <g key={`${element.id ?? "missing"}-${index}`} transform={`rotate(${rotation} ${cx} ${cy})`}>
                {point ? <g onPointerDown={(event) => onElementDown(event, element)}><circle cx={element.x} cy={element.y} r={Math.max(0.32, 8 / viewport.scale)} fill={elementFill(element, definition?.color || "#b6635f")} stroke={active ? "#123f40" : "white"} strokeWidth={2 / viewport.scale} /><circle cx={element.x} cy={element.y} r={Math.max(0.55, 14 / viewport.scale)} fill="transparent" /></g> : <g onPointerDown={(event) => onElementDown(event, element)}><rect x={element.x} y={element.y} width={w} height={h} rx={Math.min(0.25, h / 5)} fill={elementFill(element, definition?.color || "#7d91a0")} stroke={active ? "#123f40" : issueFor(element.id) ? "#c23b42" : "#ffffff"} strokeWidth={(active ? 3 : 1.5) / viewport.scale} /><text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={element.type === "anchor" ? 0.45 : Math.min(0.7, Math.max(0.3, w / 8))} pointerEvents="none">{element.type === "anchor" ? "QR" : w >= 2 ? labelFor(element).slice(0, 16) : ""}</text></g>}
                {active && !element.locked && !point && <><circle className="le-handle" cx={element.x + w} cy={element.y + h} r={7 / viewport.scale} strokeWidth={2 / viewport.scale} onPointerDown={(event) => startGesture(event, { kind: "resize", id: element.id!, start: screenToWorld(localPoint(event), viewport), element })} /><line x1={cx} y1={element.y} x2={cx} y2={element.y - 18 / viewport.scale} stroke="#123f40" strokeWidth={2 / viewport.scale} pointerEvents="none" /><circle className="le-handle le-rotate" cx={cx} cy={element.y - 18 / viewport.scale} r={7 / viewport.scale} strokeWidth={2 / viewport.scale} onPointerDown={(event) => { const world = screenToWorld(localPoint(event), viewport); startGesture(event, { kind: "rotate", id: element.id!, start: world, element, initialAngle: Math.atan2(world.y - cy, world.x - cx) * 180 / Math.PI }); }} /></>}
              </g>;
            })}
          </g>
        </svg>
        <div className="le-canvas-footer"><span>{tool === "create" ? `${TYPES.find((item) => item.type === createType)?.label} platzieren` : tool === "pan" ? "Ansicht verschieben" : "Element auswählen oder ziehen"}</span><span>Rad: Zoom · Space: Schwenken · ⌘/Ctrl Z: Rückgängig</span></div>
      </div>
      <aside className="le-right" aria-label="Eigenschaften und Prüfung">
        <h2>Eigenschaften</h2>
        {selected ? <div className="le-inspector" key={String(selected.id)}>
          <div className="le-inspector-heading"><span className="le-swatch" style={{ background: TYPES.find((item) => item.type === selected.type)?.color || "#7d91a0" }} /><strong>{labelFor(selected)}</strong></div>
          <p className="le-hint">Elementtyp: {TYPES.find((item) => item.type === selected.type)?.label || selected.type}</p>
          <label>Bezeichnung<input type="text" maxLength={200} value={selected.label || ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { label: event.target.value } })} /></label>
          <div className="le-number-grid">{(["x", "y", ...(selected.type === "beacon" ? [] : ["width", "height"]), "rotation"] as const).map((field) => <label key={field}>{({ x: "X", y: "Y", width: "Breite", height: "Höhe", rotation: "Winkel" } as Record<string, string>)[field]}<input type="number" step={field === "rotation" ? 1 : snapping ? 1 : 0.1} value={Number(selected[field] ?? 0)} disabled={selected.locked} onChange={(event) => changeNumber(field as "x" | "y" | "width" | "height" | "rotation", event.target.value)} /></label>)}</div>
          {selected.type === "anchor" && <label>QR-Anker-ID<input type="text" maxLength={12} value={selected.anchorId ?? ""} placeholder="A1" disabled={selected.locked} aria-describedby="le-anchor-id-hint" onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { anchorId: event.target.value.toUpperCase() } })} /></label>}
          {selected.type === "anchor" && <p id="le-anchor-id-hint" className="le-hint">Eindeutige ID pro Layout: A–Z, 0–9 und Bindestrich, höchstens 12 Zeichen. Diese ID steht auf dem Ausdruck.</p>}
          {selected.type !== "beacon" && selected.type !== "anchor" && <label>Zugriffswinkel<input type="number" min={0} max={360} step={1} value={Number(selected.accessAngle ?? 90)} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { accessAngle: Math.max(0, Math.min(360, number(event.target.value, Number(selected.accessAngle ?? 90)))) } })} /></label>}
          {selected.type === "shelf" && <><div className="le-number-grid"><label>Kategoriecode<input type="text" maxLength={180} value={shelfMetadata(selected).code} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: shelfMetadataChanges(selected, { code: event.target.value }) })} /></label><label>Abschnitt<input type="number" min={1} step={1} value={shelfMetadata(selected).section ?? ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: shelfMetadataChanges(selected, { section: event.target.value === "" ? null : number(event.target.value, shelfMetadata(selected).section || 1) }) })} /></label></div>
          {api && <label>Produktkategorie auswählen<select value={categories.some((item) => String(item.categoryCode) === shelfMetadata(selected).code) ? shelfMetadata(selected).code : ""} disabled={selected.locked || categories.length === 0} onChange={(event) => { if (event.target.value) dispatch({ type: "patch", id: selected.id!, changes: chooseShelfCategory(document, selected, event.target.value) }); }}><option value="">Kategorie wählen</option>{categories.map((item) => <option key={item.categoryCode} value={item.categoryCode}>{item.categoryCode} · {item.categoryName}</option>)}</select></label>}
          {api && categoryError && <p className="le-category-error" role="status">Kategorien nicht verfügbar. Code kann manuell eingegeben werden. <button type="button" onClick={() => setCategoryRevision((value) => value + 1)}>Erneut laden</button></p>}
          </>}
          {(selected.type === "shelf" || selected.type === "poi") && <label>Layout-Code<input type="text" maxLength={180} value={selected.layoutCode || ""} disabled={selected.locked} placeholder="310/1/1/1" onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { layoutCode: event.target.value } })} /></label>}
          {selected.type === "shelf" && <div className="le-position-editor"><strong>Produktpositionen</strong><ul>{(Array.isArray(selected.productPositions) ? selected.productPositions : []).map((position, index) => <li key={`${String(position)}-${index}`}><span>{String(position)}</span><button type="button" disabled={selected.locked} aria-label={`Produktposition ${String(position)} entfernen`} onClick={() => dispatch({ type: "patch", id: selected.id!, changes: { productPositions: selected.productPositions?.filter((_, at) => at !== index) || [] } })}>Entfernen</button></li>)}</ul><form onSubmit={(event) => { event.preventDefault(); const position = newPosition.trim(); const existing = Array.isArray(selected.productPositions) ? selected.productPositions : []; if (!position) return; if (existing.some((value) => String(value) === position)) { setMessage("Diese Produktposition ist bereits zugeordnet."); return; } if (existing.length >= 500) { setMessage("Höchstens 500 Produktpositionen pro Element."); return; } dispatch({ type: "patch", id: selected.id!, changes: { productPositions: [...existing, position] } }); setNewPosition(""); }}><label>Produktposition hinzufügen<input type="text" maxLength={80} value={newPosition} disabled={selected.locked} onChange={(event) => setNewPosition(event.target.value)} placeholder="z. B. 310-42" /></label><button type="submit" disabled={selected.locked || !newPosition.trim()}>Hinzufügen</button></form></div>}
          {selected.type === "poi" && <label>Kategorie<input type="text" maxLength={200} value={selected.category || ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { category: event.target.value } })} /></label>}
          {selected.type === "beacon" && mode === "store" && <label>Zugeordneter Beacon<select value={selected.beaconId || ""} disabled={selected.locked} onChange={(event) => { if (placedBeaconCodes.has(event.target.value)) { setMessage("Dieser Beacon ist bereits im Grundriss platziert."); return; } const beacon = assignedBeacons.find((item) => item.beaconCode === event.target.value); dispatch({ type: "patch", id: selected.id!, changes: { beaconId: beacon?.beaconCode || "", beaconDbId: beacon?.beaconId, identityKey: beacon?.identityKey, uuid: beacon?.uuid, major: beacon?.major, minor: beacon?.minor } }); }}><option value="">Nicht zugeordnet</option>{assignedBeacons.map((item) => <option key={item.beaconCode || item.id} value={item.beaconCode} disabled={placedBeaconCodes.has(item.beaconCode)}>{item.beaconCode || item.id}{placedBeaconCodes.has(item.beaconCode) ? " · bereits platziert" : ""}</option>)}</select></label>}
          {selected.type === "beacon" && mode === "legacy" && <label>Beacon-ID<input type="text" maxLength={200} value={selected.beaconId || ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { beaconId: event.target.value } })} /></label>}
          <label className="le-inline"><input type="checkbox" checked={!!selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { locked: event.target.checked } })} /> Gesperrt</label>
          <div className="le-inspector-actions"><button type="button" disabled={selected.locked || selectedIndex <= 0} onClick={() => dispatch({ type: "reorder", id: selected.id!, direction: "backward" })}>Nach hinten</button><button type="button" disabled={selected.locked || selectedIndex >= document.elements.length - 1} onClick={() => dispatch({ type: "reorder", id: selected.id!, direction: "forward" })}>Nach vorne</button></div>
          <div className="le-inspector-actions">{selected.type !== "beacon" && <button type="button" disabled={selected.locked} onClick={() => dispatch({ type: "rotate90", id: selected.id! })}>90° drehen</button>}<button type="button" disabled={selected.locked} onClick={() => dispatch({ type: "duplicate", id: selected.id!, duplicateId: newElementId(document), anchorId: nextAnchorId(document) })}>Duplizieren</button><button type="button" disabled={selected.locked} onClick={() => { if (confirmCriticalDelete(selected)) dispatch({ type: "delete", id: selected.id! }); }}>Löschen</button></div>
        </div> : <div className="le-inspector"><p className="le-empty">Element auswählen, um Position und Eigenschaften zu bearbeiten.</p><label>Filialname<input type="text" maxLength={200} value={document.shopName} onChange={(event) => dispatch({ type: "document", changes: { shopName: event.target.value } })} /></label><div className="le-number-grid"><label>Breite<input type="number" min={1} max={1000} value={document.gridSize.width} onChange={(event) => dispatch({ type: "document", changes: { gridSize: { width: number(event.target.value, document.gridSize.width), height: document.gridSize.height } } })} /></label><label>Höhe<input type="number" min={1} max={1000} value={document.gridSize.height} onChange={(event) => dispatch({ type: "document", changes: { gridSize: { width: document.gridSize.width, height: number(event.target.value, document.gridSize.height) } } })} /></label></div></div>}
        <div className="le-validation"><h2>Prüfung <span>{errors ? `${errors} Fehler` : "Bereit"}</span></h2><p>{issues.length ? `${errors} Fehler · ${issues.length - errors} Hinweise` : "Keine Probleme gefunden."}</p><ul>{issues.map((issue, index) => <li key={`${issue.code}-${String(issue.elementId)}-${index}`} className={`le-${issue.severity}`}><button type="button" onClick={() => issue.elementId !== null && setEditor((current) => selectElement(current, issue.elementId))} disabled={issue.elementId === null}><span>{issue.severity === "error" ? "!" : "i"}</span>{issue.message}</button></li>)}</ul></div>
      </aside>
    </div>
  </section>;
}
