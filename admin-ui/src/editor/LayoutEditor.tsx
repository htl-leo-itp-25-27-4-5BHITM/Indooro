import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { fitViewport, screenToWorld, zoomAt, type Point, type Viewport } from "./geometry";
import { elementFill, shelfMetadata, shelfMetadataChanges } from "./metadata";
import { applyCommand, createEditorState, isDirty, markSaved, newElementId, redo, selectElement, undo, type EditorCommand, type EditorState, type ElementId, type LayoutDocument, type LayoutElement } from "./model";
import { validateLayout, type AssignedBeacon } from "./validation";
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
] as const;

type Tool = "select" | "pan" | "create";
type Gesture =
  | { kind: "pan"; start: Point; viewport: Viewport }
  | { kind: "move" | "resize" | "rotate"; id: ElementId; start: Point; element: LayoutElement; initialAngle?: number };

export interface LayoutEditorProps {
  initialDocument: LayoutDocument;
  mode: "store" | "legacy";
  storeName?: string;
  assignedBeacons?: AssignedBeacon[];
  saveMode?: "draft" | "immediate";
  onSaveDraft?: (document: LayoutDocument) => Promise<unknown>;
  onSaveCurrent?: (document: LayoutDocument) => Promise<unknown>;
  onPublish?: (document: LayoutDocument) => Promise<unknown>;
  onBack?: () => void;
}

const labelFor = (element: LayoutElement) => element.label || TYPES.find((item) => item.type === element.type)?.label || element.type;
const number = (value: string, fallback: number) => Number.isFinite(Number(value)) && value !== "" ? Number(value) : fallback;

export function LayoutEditor({ initialDocument, mode, storeName, assignedBeacons = [], saveMode = "draft", onSaveDraft, onSaveCurrent, onPublish, onBack }: LayoutEditorProps) {
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
  const [working, setWorking] = useState<"save" | "publish" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const previewRef = useRef<LayoutElement | null>(null);
  const spaceHeld = useRef(false);

  const document = editor.document;
  const dirty = isDirty(editor);
  const issues = useMemo(() => validateLayout(document, assignedBeacons), [document, assignedBeacons]);
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const selected = document.elements.find((element) => element.id === editor.selectedId) ?? null;
  const selectedIndex = document.elements.findIndex((element) => element.id === editor.selectedId);

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
      if (event.code === "Space" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        spaceHeld.current = true;
        event.preventDefault();
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (event.key.toLowerCase() === "v" && !event.metaKey && !event.ctrlKey) setTool("select");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        setEditor((current) => event.shiftKey ? redo(current) : undo(current));
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        setEditor(redo);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const id = editorRef.current.selectedId;
        if (id !== null) setEditor((current) => applyCommand(current, { type: "delete", id }));
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
        if (id !== null) setEditor((current) => applyCommand(current, { type: "duplicate", id, duplicateId: newElementId(current.document) }));
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
      const definition = TYPES.find((item) => item.type === createType)!;
      const world = screenToWorld(at, viewport);
      let beacon: AssignedBeacon | undefined;
      if (createType === "beacon" && mode === "store") {
        const placed = new Set(document.elements.filter((element) => element.type === "beacon").map((element) => element.beaconId));
        beacon = assignedBeacons.find((item) => item.beaconCode && !placed.has(item.beaconCode));
        if (!beacon) { setMessage("Keine freien zugeordneten Beacons verfügbar."); return; }
      }
      const element: LayoutElement = {
        id: newElementId(document), type: createType, x: world.x - definition.width / 2, y: world.y - definition.height / 2,
        ...(createType === "beacon" ? { beaconId: beacon?.beaconCode, beaconDbId: beacon?.beaconId, identityKey: beacon?.identityKey, uuid: beacon?.uuid, major: beacon?.major, minor: beacon?.minor } : { width: definition.width, height: definition.height }),
      };
      dispatch({ type: "create", element });
      setTool("select");
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
    if (active.kind === "move") {
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
    if (active.kind !== "pan" && finalPreview) {
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
    if (!saveAction || working || (saveMode === "immediate" && errors > 0)) return;
    const warningCount = issues.length - errors;
    const warningNote = warningCount ? `\n\n${warningCount} Hinweis${warningCount === 1 ? "" : "e"} aus der Prüfung bleiben offen. Bitte vor der Veröffentlichung prüfen.` : "";
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
    const warningCount = issues.length - errors;
    const warningNote = warningCount ? `\n\n${warningCount} Hinweis${warningCount === 1 ? "" : "e"} aus der Prüfung bleiben offen. Bitte vor der Veröffentlichung prüfen.` : "";
    if (!window.confirm(`Diesen gespeicherten Entwurf veröffentlichen? Die mobile Ansicht verwendet danach diese Version.${warningNote}`)) return;
    setWorking("publish"); setMessage(null);
    try { await onPublish(structuredClone(editorRef.current.document)); setMessage("Layout veröffentlicht."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Veröffentlichung fehlgeschlagen."); }
    finally { setWorking(null); }
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
        <span className={`le-save-indicator ${dirty ? "is-dirty" : ""}`}>{dirty ? "● Ungespeicherte Änderungen" : "✓ Gespeichert"}</span>
        <button type="button" className={`le-button ${saveMode === "immediate" ? "le-primary" : ""}`} disabled={!(saveMode === "immediate" ? onSaveCurrent : onSaveDraft) || !dirty || !!working || (saveMode === "immediate" && errors > 0)} onClick={saveDocument}>{working === "save" ? "Speichert …" : saveMode === "immediate" ? "Global veröffentlichen" : "Entwurf speichern"}</button>
        {saveMode === "draft" && <button type="button" className="le-button le-primary" disabled={!onPublish || dirty || errors > 0 || !!working} onClick={publish}>{working === "publish" ? "Veröffentlicht …" : "Veröffentlichen"}</button>}
      </div>
    </header>
    {message && <p className="le-message" role="status">{message}</p>}
    <div className="le-body">
      <aside className="le-left" aria-label="Werkzeuge und Elemente">
        <h2>Werkzeuge</h2>
        <div className="le-tool-row"><button type="button" aria-pressed={tool === "select"} onClick={() => setTool("select")}>Auswählen <kbd>V</kbd></button><button type="button" aria-pressed={tool === "pan"} onClick={() => setTool("pan")}>Verschieben <kbd>Space</kbd></button></div>
        <h2>Elemente</h2><p className="le-hint">Element wählen, dann im Grundriss platzieren.</p>
        <div className="le-library">{TYPES.map((item) => <button type="button" key={item.type} aria-pressed={tool === "create" && createType === item.type} onClick={() => { setCreateType(item.type); setTool("create"); }}><span className="le-swatch" style={{ background: item.color }} />{item.label}</button>)}</div>
        <h2>Ebenen <span>{document.elements.length}</span></h2>
        <div className="le-layers" role="list">{document.elements.length ? document.elements.map((element, index) => <button type="button" role="listitem" key={`${element.id ?? "missing"}-${index}`} aria-current={editor.selectedId === element.id} onClick={() => setEditor((current) => selectElement(current, element.id ?? null))}><span className="le-layer-index">{String(index + 1).padStart(2, "0")}</span><span>{labelFor(element)}</span>{element.locked && <span title="Gesperrt">🔒</span>}{issueFor(element.id) && <span className="le-error-dot" title="Validierungsfehler">!</span>}</button>) : <p className="le-empty">Noch keine Elemente</p>}</div>
      </aside>
      <div className="le-center">
        <div className="le-canvas-toolbar"><span>{document.gridSize.width} × {document.gridSize.height} Rastereinheiten</span><label><input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} /> Raster</label><label><input type="checkbox" checked={snapping} onChange={(event) => setSnapping(event.target.checked)} /> Einrasten</label><button type="button" onClick={() => setEditor(undo)} disabled={!editor.past.length} title="Rückgängig">↶</button><button type="button" onClick={() => setEditor(redo)} disabled={!editor.future.length} title="Wiederholen">↷</button><button type="button" onClick={() => setViewport((current) => zoomAt(current, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, 1.2))}>＋</button><span>{viewport.scale.toFixed(1)} px/E</span><button type="button" onClick={() => setViewport((current) => zoomAt(current, { x: canvasSize.width / 2, y: canvasSize.height / 2 }, 1 / 1.2))}>－</button><button type="button" onClick={() => setViewport(fitViewport(document.gridSize, canvasSize))}>Einpassen</button></div>
        <svg ref={svgRef} className={`le-canvas le-tool-${tool}`} viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none" onPointerDown={onBackgroundDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} aria-label="Interaktiver Grundriss" role="img">
          <defs><pattern id="le-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#d9e2df" strokeWidth={0.045} /></pattern></defs>
          <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
            <rect x={0} y={0} width={document.gridSize.width} height={document.gridSize.height} fill="#fff" stroke="#aabfba" strokeWidth={1 / viewport.scale} />
            {showGrid && <rect x={0} y={0} width={document.gridSize.width} height={document.gridSize.height} fill="url(#le-grid)" pointerEvents="none" />}
            {document.elements.map((stored, index) => {
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
                {point ? <g onPointerDown={(event) => onElementDown(event, element)}><circle cx={element.x} cy={element.y} r={Math.max(0.32, 8 / viewport.scale)} fill={elementFill(element, definition?.color || "#b6635f")} stroke={active ? "#123f40" : "white"} strokeWidth={2 / viewport.scale} /><circle cx={element.x} cy={element.y} r={Math.max(0.55, 14 / viewport.scale)} fill="transparent" /></g> : <g onPointerDown={(event) => onElementDown(event, element)}><rect x={element.x} y={element.y} width={w} height={h} rx={Math.min(0.25, h / 5)} fill={elementFill(element, definition?.color || "#7d91a0")} stroke={active ? "#123f40" : issueFor(element.id) ? "#c23b42" : "#ffffff"} strokeWidth={(active ? 3 : 1.5) / viewport.scale} /><text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="white" fontSize={Math.min(0.7, Math.max(0.3, w / 8))} pointerEvents="none">{w >= 2 ? labelFor(element).slice(0, 16) : ""}</text></g>}
                {active && !element.locked && !point && <><circle className="le-handle" cx={element.x + w} cy={element.y + h} r={7 / viewport.scale} onPointerDown={(event) => startGesture(event, { kind: "resize", id: element.id!, start: screenToWorld(localPoint(event), viewport), element })} /><line x1={cx} y1={element.y} x2={cx} y2={element.y - 18 / viewport.scale} stroke="#123f40" strokeWidth={2 / viewport.scale} pointerEvents="none" /><circle className="le-handle le-rotate" cx={cx} cy={element.y - 18 / viewport.scale} r={7 / viewport.scale} onPointerDown={(event) => { const world = screenToWorld(localPoint(event), viewport); startGesture(event, { kind: "rotate", id: element.id!, start: world, element, initialAngle: Math.atan2(world.y - cy, world.x - cx) * 180 / Math.PI }); }} /></>}
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
          <label>Bezeichnung<input type="text" maxLength={200} value={selected.label || ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { label: event.target.value } })} /></label>
          <div className="le-number-grid">{(["x", "y", ...(selected.type === "beacon" ? [] : ["width", "height"]), "rotation"] as const).map((field) => <label key={field}>{({ x: "X", y: "Y", width: "Breite", height: "Höhe", rotation: "Winkel" } as Record<string, string>)[field]}<input type="number" step={field === "rotation" ? 1 : snapping ? 1 : 0.1} value={Number(selected[field] ?? 0)} disabled={selected.locked} onChange={(event) => changeNumber(field as "x" | "y" | "width" | "height" | "rotation", event.target.value)} /></label>)}</div>
          {selected.type === "shelf" && <div className="le-number-grid"><label>Kategoriecode<input type="text" maxLength={180} value={shelfMetadata(selected).code} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: shelfMetadataChanges(selected, { code: event.target.value }) })} /></label><label>Abschnitt<input type="number" min={1} step={1} value={shelfMetadata(selected).section ?? ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: shelfMetadataChanges(selected, { section: event.target.value === "" ? null : number(event.target.value, shelfMetadata(selected).section || 1) }) })} /></label></div>}
          {selected.type === "poi" && <label>Kategorie<input type="text" maxLength={200} value={selected.category || ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { category: event.target.value } })} /></label>}
          {selected.type === "beacon" && mode === "store" && <label>Zugeordneter Beacon<select value={selected.beaconId || ""} disabled={selected.locked} onChange={(event) => { const beacon = assignedBeacons.find((item) => item.beaconCode === event.target.value); dispatch({ type: "patch", id: selected.id!, changes: { beaconId: beacon?.beaconCode || "", beaconDbId: beacon?.beaconId, identityKey: beacon?.identityKey, uuid: beacon?.uuid, major: beacon?.major, minor: beacon?.minor } }); }}><option value="">Nicht zugeordnet</option>{assignedBeacons.map((item) => <option key={item.beaconCode || item.id} value={item.beaconCode}>{item.beaconCode || item.id}</option>)}</select></label>}
          {selected.type === "beacon" && mode === "legacy" && <label>Beacon-ID<input type="text" maxLength={200} value={selected.beaconId || ""} disabled={selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { beaconId: event.target.value } })} /></label>}
          <label className="le-inline"><input type="checkbox" checked={!!selected.locked} onChange={(event) => dispatch({ type: "patch", id: selected.id!, changes: { locked: event.target.checked } })} /> Gesperrt</label>
          <div className="le-inspector-actions"><button type="button" disabled={selected.locked || selectedIndex <= 0} onClick={() => dispatch({ type: "reorder", id: selected.id!, direction: "backward" })}>Nach hinten</button><button type="button" disabled={selected.locked || selectedIndex >= document.elements.length - 1} onClick={() => dispatch({ type: "reorder", id: selected.id!, direction: "forward" })}>Nach vorne</button></div>
          <div className="le-inspector-actions"><button type="button" disabled={selected.locked} onClick={() => dispatch({ type: "duplicate", id: selected.id!, duplicateId: newElementId(document) })}>Duplizieren</button><button type="button" disabled={selected.locked} onClick={() => dispatch({ type: "delete", id: selected.id! })}>Löschen</button></div>
        </div> : <div className="le-inspector"><p className="le-empty">Element auswählen, um Position und Eigenschaften zu bearbeiten.</p><label>Filialname<input type="text" maxLength={200} value={document.shopName} onChange={(event) => dispatch({ type: "document", changes: { shopName: event.target.value } })} /></label><div className="le-number-grid"><label>Breite<input type="number" min={1} max={1000} value={document.gridSize.width} onChange={(event) => dispatch({ type: "document", changes: { gridSize: { width: number(event.target.value, document.gridSize.width), height: document.gridSize.height } } })} /></label><label>Höhe<input type="number" min={1} max={1000} value={document.gridSize.height} onChange={(event) => dispatch({ type: "document", changes: { gridSize: { width: document.gridSize.width, height: number(event.target.value, document.gridSize.height) } } })} /></label></div></div>}
        <div className="le-validation"><h2>Prüfung <span>{errors ? `${errors} Fehler` : "Bereit"}</span></h2><p>{issues.length ? `${errors} Fehler · ${issues.length - errors} Hinweise` : "Keine Probleme gefunden."}</p><ul>{issues.map((issue, index) => <li key={`${issue.code}-${String(issue.elementId)}-${index}`} className={`le-${issue.severity}`}><button type="button" onClick={() => issue.elementId !== null && setEditor((current) => selectElement(current, issue.elementId))} disabled={issue.elementId === null}><span>{issue.severity === "error" ? "!" : "i"}</span>{issue.message}</button></li>)}</ul></div>
      </aside>
    </div>
  </section>;
}
