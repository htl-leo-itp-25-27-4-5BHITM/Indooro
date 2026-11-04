import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { Beacon, FloorElement, FloorElementType, FloorPlan, Point } from "../core/types";
import { distanceUnit, formatDistance } from "../core/units";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampPan,
  fitViewBox,
  meetMatrix,
  panBy,
  rotatedRectCorners,
  screenToLayout,
  niceScaleBarLength,
  zoomAt,
  zoomCentered,
  zoomOf,
  type ViewBox,
} from "./geometry";
import {
  ALL_LAYERS,
  DEFAULT_LAYERS,
  formatPosition,
  type LayerId,
  type MapDetail,
  type MapSelection,
} from "./layers";
import { MapContext, type MapContextValue } from "./MapContext";

export interface FloorPlanMapProps {
  plan: FloorPlan;
  beacons?: Beacon[];
  /** Controlled layer visibility. Missing keys fall back to the defaults. */
  layers?: Partial<Record<LayerId, boolean>>;
  /** Called when the user toggles a layer chip (controlled and uncontrolled mode). */
  onLayersChange?: (layers: Record<LayerId, boolean>) => void;
  /** Restrict the toggle chips to these layers (default: all). */
  availableLayers?: LayerId[];
  /** Rendered inside the SVG *below* the plan elements (e.g. a heatmap). */
  underlay?: ReactNode;
  /** Overlay slot rendered inside the SVG above the plan: nodes or a render-prop. */
  overlays?: ReactNode;
  children?: ReactNode;
  selectedId?: string;
  onSelect?: (sel: MapSelection) => void;
  /** Container height in px (default 520). */
  height?: number;
  className?: string;
}

interface ViewState {
  zoom: number;
  cx: number;
  cy: number;
}

const FALLBACK_SIZE = { w: 800, h: 520 };

interface ElementStyle {
  fill: string;
  stroke: string;
  dash?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  label: string;
}

const ELEMENT_STYLES: Record<FloorElementType, ElementStyle> = {
  shelf: { fill: "#d3dee5", stroke: "#8ba2b1", label: "Regal" },
  checkout: { fill: "#ecdcb9", stroke: "#b9924a", label: "Kasse" },
  entrance: { fill: "#c3ece0", stroke: "#167768", strokeWidth: 1.4, label: "Eingang" },
  wall: { fill: "#4b6174", stroke: "#2f4556", label: "Wand" },
  cooler: { fill: "#d2eaf3", stroke: "#5f9fba", label: "Kühlregal" },
  freezer: { fill: "#dde3f7", stroke: "#6f83c2", label: "Tiefkühler" },
  counter: { fill: "#e6d8ca", stroke: "#a38465", label: "Theke" },
  anchor: { fill: "none", stroke: "#27b9ab", dash: "4 3", strokeWidth: 1.2, label: "Anker" },
  other: { fill: "#e5eaed", stroke: "#9aa9b3", label: "Sonstiges" },
};

function mergeLayers(layers?: Partial<Record<LayerId, boolean>>): Record<LayerId, boolean> {
  return { ...DEFAULT_LAYERS, ...(layers ?? {}) };
}

function viewToBox(view: ViewState | null, fit: ViewBox): ViewBox {
  if (!view) return fit;
  const w = fit.w / view.zoom;
  const h = fit.h / view.zoom;
  return { x: view.cx - w / 2, y: view.cy - h / 2, w, h };
}

function boxToView(vb: ViewBox, fit: ViewBox): ViewState {
  return { zoom: zoomOf(vb, fit), cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 };
}

function gridStep(pxPerUnit: number): number {
  for (const s of [1, 2, 5, 10, 20, 50, 100]) if (s * pxPerUnit >= 14) return s;
  return 100;
}

function gridPath(plan: FloorPlan, step: number): { minor: string; major: string } {
  let minor = "";
  let major = "";
  const majorEvery = step >= 5 ? step * 2 : 5;
  for (let x = 0; x <= plan.width + 1e-9; x += step) {
    const seg = `M${x} 0V${plan.height}`;
    if (Math.abs(x % majorEvery) < 1e-9) major += seg;
    else minor += seg;
  }
  for (let y = 0; y <= plan.height + 1e-9; y += step) {
    const seg = `M0 ${y}H${plan.width}`;
    if (Math.abs(y % majorEvery) < 1e-9) major += seg;
    else minor += seg;
  }
  return { minor, major };
}

function elementDetail(el: FloorElement, plan: FloorPlan): MapDetail {
  const st = ELEMENT_STYLES[el.type];
  const lines = [
    `Typ: ${st.label}${el.category ? ` · ${el.category}` : ""}`,
    `Position: ${formatPosition({ x: el.x, y: el.y }, plan.scale)}`,
    `Größe: ${el.width} × ${el.height} LE${
      plan.scale.confirmed
        ? ` (${formatDistance(el.width, plan.scale, 1)} × ${formatDistance(el.height, plan.scale, 1)})`
        : ""
    }`,
  ];
  if (el.rotationDeg) lines.push(`Drehung: ${el.rotationDeg}° (im Uhrzeigersinn)`);
  return { kind: "element", id: el.id, title: el.label ?? el.id, lines, position: { x: el.x + el.width / 2, y: el.y + el.height / 2 } };
}

function beaconDetail(b: Beacon, plan: FloorPlan): MapDetail {
  const lines = [`Position: ${formatPosition(b.position, plan.scale)}`, b.enabled ? "Status: aktiv" : "Status: deaktiviert"];
  if (b.txPowerDbm !== undefined) lines.push(`TxPower: ${b.txPowerDbm} dBm`);
  if (b.major !== undefined || b.minor !== undefined) lines.push(`Major/Minor: ${b.major ?? "–"}/${b.minor ?? "–"}`);
  return { kind: "beacon", id: b.id, title: b.label ? `${b.id} · ${b.label}` : b.id, lines, position: b.position };
}

export function FloorPlanMap(props: FloorPlanMapProps) {
  const {
    plan,
    beacons = [],
    layers: layersProp,
    onLayersChange,
    availableLayers,
    underlay,
    overlays,
    children,
    selectedId,
    onSelect,
    height = 520,
    className = "",
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState(FALLBACK_SIZE);
  const [view, setView] = useState<ViewState | null>(null);
  const [innerLayers, setInnerLayers] = useState<Record<LayerId, boolean>>(() => mergeLayers(layersProp));
  const [hover, setHover] = useState<{ detail: MapDetail; x: number; y: number } | null>(null);
  const [pinned, setPinned] = useState<MapDetail | null>(null);
  const [dragging, setDragging] = useState(false);

  const controlled = layersProp !== undefined;
  const layers = controlled ? mergeLayers(layersProp) : innerLayers;

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const fit = useMemo(() => fitViewBox(plan, size.w / size.h), [plan.width, plan.height, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const vb = useMemo(() => viewToBox(view, fit), [view, fit]);
  const zoom = zoomOf(vb, fit);
  const pxPerUnit = Math.min(size.w / vb.w, size.h / vb.h);

  const vbRef = useRef(vb);
  vbRef.current = vb;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const ppuRef = useRef(pxPerUnit);
  ppuRef.current = pxPerUnit;

  const commit = useCallback((next: ViewBox) => {
    const clamped = clampPan(next, plan);
    setView(boxToView(clamped, fitRef.current));
  }, [plan]);

  const clientToLayout = useCallback((cx: number, cy: number): Point => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM?.();
    if (ctm) {
      const p = screenToLayout({ x: cx, y: cy }, ctm);
      if (p) return p;
    }
    const rect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, ...sizeRef.current, width: sizeRef.current.w, height: sizeRef.current.h };
    const m = meetMatrix(
      { left: rect.left, top: rect.top, width: rect.width || sizeRef.current.w, height: rect.height || sizeRef.current.h },
      vbRef.current,
    );
    return screenToLayout({ x: cx, y: cy }, m) ?? { x: 0, y: 0 };
  }, []);

  /* wheel: native non-passive listener so we only block page scroll while zooming over the map */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-Math.max(-200, Math.min(200, dy)) * 0.0015);
      const anchor = clientToLayout(e.clientX, e.clientY);
      commit(zoomAt(vbRef.current, fitRef.current, factor, anchor));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [clientToLayout, commit]);

  /* pointer: drag-pan, pinch-zoom; click suppression after drag */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragStart = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const pinchStart = useRef<{ dist: number; vb: ViewBox } | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 1) {
      dragStart.current = { x: e.clientX, y: e.clientY, vb: vbRef.current };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), vb: vbRef.current };
      dragStart.current = null;
      moved.current = true;
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.dist > 0 && dist > 0) {
        const mid = clientToLayout((a.x + b.x) / 2, (a.y + b.y) / 2);
        commit(zoomAt(pinchStart.current.vb, fitRef.current, dist / pinchStart.current.dist, mid));
      }
      return;
    }
    const start = dragStart.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!moved.current && Math.hypot(dx, dy) < 4) return;
    if (!moved.current) {
      moved.current = true;
      setDragging(true);
      setHover(null);
      try {
        svgRef.current?.setPointerCapture?.(e.pointerId);
      } catch {
        /* not supported (jsdom) */
      }
    }
    const ppu = ppuRef.current;
    commit(panBy(start.vb, -dx / ppu, -dy / ppu));
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) {
      dragStart.current = null;
      setDragging(false);
      // keep `moved` until after the click event fired
      setTimeout(() => (moved.current = false), 0);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = vbRef.current;
    const stepX = cur.w * 0.1;
    const stepY = cur.h * 0.1;
    switch (e.key) {
      case "ArrowLeft":
        commit(panBy(cur, -stepX, 0));
        break;
      case "ArrowRight":
        commit(panBy(cur, stepX, 0));
        break;
      case "ArrowUp":
        commit(panBy(cur, 0, -stepY));
        break;
      case "ArrowDown":
        commit(panBy(cur, 0, stepY));
        break;
      case "+":
      case "=":
        commit(zoomCentered(cur, fitRef.current, 1.4));
        break;
      case "-":
        commit(zoomCentered(cur, fitRef.current, 1 / 1.4));
        break;
      case "0":
        setView(null);
        break;
      case "Escape":
        setPinned(null);
        return;
      default:
        return;
    }
    e.preventDefault();
  };

  const interactive = useCallback(
    (detail: MapDetail) => {
      const rel = (e: { clientX: number; clientY: number }) => {
        const r = containerRef.current?.getBoundingClientRect();
        return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
      };
      return {
        onPointerEnter: (e: PointerEvent<SVGElement>) => {
          if (!dragStart.current || !moved.current) setHover({ detail, ...rel(e) });
        },
        onPointerMove: (e: PointerEvent<SVGElement>) => {
          if (!moved.current) setHover({ detail, ...rel(e) });
        },
        onPointerLeave: () => setHover(null),
        onClick: (e: MouseEvent<SVGElement>) => {
          if (moved.current) return;
          e.stopPropagation();
          setPinned(detail);
          onSelect?.({ kind: detail.kind, id: detail.id, position: detail.position });
        },
      };
    },
    [onSelect],
  );

  const ctxValue: MapContextValue = useMemo(
    () => ({ plan, scale: plan.scale, viewBox: vb, zoom, pxPerUnit, layers, selectedId, interactive }),
    [plan, vb, zoom, pxPerUnit, layers, selectedId, interactive],
  );

  const toggleLayer = (id: LayerId, on: boolean) => {
    const next = { ...layers, [id]: on };
    if (!controlled) setInnerLayers(next);
    onLayersChange?.(next);
  };

  /* ---- scale bar ---- */
  const scaleBar = useMemo(() => {
    const targetPx = 110;
    const targetUnits = targetPx / pxPerUnit;
    if (plan.scale.confirmed) {
      const mpu = plan.scale.metersPerUnit;
      const lenM = niceScaleBarLength(targetUnits * mpu);
      const label = lenM >= 1 ? `${lenM} m` : `${Math.round(lenM * 100)} cm`;
      return { px: (lenM / mpu) * pxPerUnit, label };
    }
    const len = niceScaleBarLength(targetUnits);
    return { px: len * pxPerUnit, label: `${len} LE` };
  }, [pxPerUnit, plan.scale.confirmed, plan.scale.metersPerUnit]);

  const grid = useMemo(() => gridPath(plan, gridStep(pxPerUnit)), [plan, pxPerUnit]);
  const px = (n: number) => n / pxPerUnit;
  const chips = ALL_LAYERS.filter((l) => !availableLayers || availableLayers.includes(l.id));
  const sortedElements = useMemo(
    () => [...plan.elements].sort((a, b) => Number(a.type === "anchor") - Number(b.type === "anchor")),
    [plan.elements],
  );
  const showDetail = hover?.detail ?? null;

  const renderedOverlays = (
    <>
      {overlays}
      {children}
    </>
  );

  return (
    <div className={`rounded-xl border border-line bg-white ${className}`}>
      <div
        ref={containerRef}
        className="relative select-none overflow-hidden rounded-t-xl bg-[#f8fafb] outline-none focus-visible:ring-2 focus-visible:ring-teal"
        style={{ height }}
        role="application"
        aria-label={`Grundriss ${plan.name}. Pfeiltasten verschieben, Plus und Minus zoomen, 0 passt ein.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <svg
          ref={svgRef}
          className="block h-full w-full"
          style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={() => setPinned(null)}
          data-testid="floorplan-svg"
        >
          <MapContext.Provider value={ctxValue}>
            <rect x={0} y={0} width={plan.width} height={plan.height} fill="#ffffff" />
            {layers.grid && (
              <g aria-hidden="true" pointerEvents="none">
                <path d={grid.minor} stroke="#e6edf0" strokeWidth={0.75} fill="none" vectorEffect="non-scaling-stroke" />
                <path d={grid.major} stroke="#cfdbe1" strokeWidth={0.9} fill="none" vectorEffect="non-scaling-stroke" />
              </g>
            )}
            {underlay}
            {layers.elements && (
              <g data-testid="layer-elements">
                {sortedElements.map((el) => {
                  const st = ELEMENT_STYLES[el.type];
                  const pts = rotatedRectCorners(el)
                    .map((c) => `${c.x},${c.y}`)
                    .join(" ");
                  const detail = elementDetail(el, plan);
                  const sel = selectedId === el.id;
                  return (
                    <polygon
                      key={el.id}
                      data-element-id={el.id}
                      data-element-type={el.type}
                      points={pts}
                      fill={st.fill}
                      fillOpacity={st.fillOpacity ?? 0.92}
                      stroke={sel ? "#167768" : st.stroke}
                      strokeWidth={sel ? 2 : (st.strokeWidth ?? 1)}
                      strokeDasharray={st.dash}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                      {...interactive(detail)}
                    >
                      <title>{`${detail.title} (${st.label})`}</title>
                    </polygon>
                  );
                })}
              </g>
            )}
            {layers.elements && layers.labels && (
              <g pointerEvents="none" aria-hidden="true" fontSize={px(10.5)} fill="#33495a" textAnchor="middle" dominantBaseline="central">
                {sortedElements.map((el) => {
                  if (!el.label) return null;
                  const long = Math.max(el.width, el.height) * pxPerUnit;
                  if (long < el.label.length * 5.8 + 6 && zoom < 3) return null;
                  if (Math.min(el.width, el.height) * pxPerUnit < 9 && zoom < 3) return null;
                  const dark = el.type === "wall";
                  return (
                    <text
                      key={el.id}
                      x={el.x + el.width / 2}
                      y={el.y + el.height / 2}
                      fill={dark ? "#ffffff" : "#33495a"}
                      className="tabular"
                    >
                      {el.label}
                    </text>
                  );
                })}
              </g>
            )}
            <g aria-hidden="true" pointerEvents="none">
              <path
                d={`M-${px(7)} 0H${px(7)}M0 -${px(7)}V${px(7)}`}
                stroke="#506779"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              <rect x={0} y={0} width={plan.width} height={plan.height} fill="none" stroke="#7f95a4" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            </g>
            {layers.beacons && (
              <g data-testid="layer-beacons">
                {beacons.map((b) => {
                  const sel = selectedId === b.id;
                  const detail = beaconDetail(b, plan);
                  return (
                    <g
                      key={b.id}
                      data-beacon-id={b.id}
                      transform={`translate(${b.position.x} ${b.position.y}) scale(${1 / pxPerUnit})`}
                      opacity={b.enabled ? 1 : 0.65}
                      style={{ cursor: "pointer" }}
                      {...interactive(detail)}
                    >
                      <title>{`Beacon ${detail.title}${b.enabled ? "" : " (deaktiviert)"}`}</title>
                      <circle r={12} fill="transparent" />
                      {sel && <circle r={11} fill="none" stroke="#27b9ab" strokeWidth={2} />}
                      <circle r={7} fill="none" stroke={b.enabled ? "#27b9ab" : "#9aa9b3"} strokeWidth={1} opacity={0.55} strokeDasharray={b.enabled ? undefined : "2 2"} />
                      <circle
                        r={4.5}
                        fill={b.enabled ? "#102a3b" : "#ffffff"}
                        stroke={b.enabled ? "#7edcc6" : "#7f95a4"}
                        strokeWidth={1.5}
                        strokeDasharray={b.enabled ? undefined : "2.5 2"}
                      />
                      {layers.labels && (
                        <text
                          x={9}
                          y={-7}
                          fontSize={10.5}
                          fontWeight={600}
                          fill={b.enabled ? "#102a3b" : "#7f95a4"}
                          stroke="#ffffff"
                          strokeWidth={3}
                          paintOrder="stroke"
                          strokeLinejoin="round"
                          className="tabular"
                          pointerEvents="none"
                        >
                          {b.id}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            )}
            {renderedOverlays}
          </MapContext.Provider>
        </svg>

        {/* badges & controls (screen space) */}
        <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1.5">
          {plan.origin === "synthetic" && (
            <span
              className="rounded bg-synthetic px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white shadow-sm"
              title="Dieser Grundriss und/oder die Daten sind synthetisch (nicht gemessen)."
            >
              SYNTHETISCH
            </span>
          )}
          <span className="rounded bg-white/90 px-2 py-0.5 text-[11px] text-muted shadow-sm ring-1 ring-line">
            {plan.name} · {plan.width} × {plan.height} LE
          </span>
        </div>

        <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-lg border border-line bg-white/95 shadow-sm">
          <button
            type="button"
            aria-label="Vergrößern"
            title="Vergrößern"
            disabled={zoom >= MAX_ZOOM - 1e-6}
            className="h-8 w-8 text-base text-brand hover:bg-page disabled:opacity-40"
            onClick={() => commit(zoomCentered(vbRef.current, fitRef.current, 1.5))}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Verkleinern"
            title="Verkleinern"
            disabled={zoom <= MIN_ZOOM + 1e-6}
            className="h-8 w-8 border-t border-line text-base text-brand hover:bg-page disabled:opacity-40"
            onClick={() => commit(zoomCentered(vbRef.current, fitRef.current, 1 / 1.5))}
          >
            −
          </button>
          <button
            type="button"
            aria-label="Ansicht einpassen"
            title="Ganzen Grundriss anzeigen"
            className="h-8 w-8 border-t border-line text-[11px] font-medium text-brand hover:bg-page"
            onClick={() => setView(null)}
          >
            Fit
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col items-start gap-1">
          {!plan.scale.confirmed && (
            <span className="rounded bg-amber/25 px-1.5 py-0.5 text-[10.5px] text-[#7a5410] ring-1 ring-amber/60">
              Maßstab nicht bestätigt
            </span>
          )}
          <div className="flex flex-col gap-0.5 rounded bg-white/90 px-2 py-1 shadow-sm ring-1 ring-line" aria-label={`Maßstabsbalken ${scaleBar.label}`}>
            <div className="relative h-2 border-x border-b border-brand" style={{ width: scaleBar.px }} />
            <span className="tabular text-[10.5px] text-brand">
              {scaleBar.label}
              <span className="text-muted"> · {zoom.toFixed(zoom < 10 ? 1 : 0)}×</span>
            </span>
          </div>
        </div>

        <svg
          className="pointer-events-none absolute bottom-2 right-2 rounded bg-white/90 shadow-sm ring-1 ring-line"
          width={64}
          height={56}
          viewBox="0 0 64 56"
          role="img"
          aria-label="Achsen: Ursprung (0,0) oben links, x nach rechts, y nach unten"
        >
          <title>Ursprung (0,0) oben links · x → · y ↓</title>
          <g stroke="#506779" strokeWidth={1.2} fill="none">
            <path d="M12 12H46M42 9L46 12L42 15" />
            <path d="M12 12V42M9 38L12 42L15 38" />
          </g>
          <circle cx={12} cy={12} r={2.2} fill="#102a3b" />
          <g fontSize={9} fill="#506779" className="tabular">
            <text x={50} y={15}>x</text>
            <text x={16} y={50}>y</text>
            <text x={17} y={24}>0,0</text>
          </g>
        </svg>

        {showDetail && !dragging && (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: Math.min(Math.max(hover!.x + 14, 4), Math.max(4, size.w - 270)),
              top: Math.min(Math.max(hover!.y + 14, 4), Math.max(4, size.h - 90)),
            }}
            role="tooltip"
          >
            <div className="font-semibold text-brand">{showDetail.title}</div>
            {showDetail.lines.map((l, i) => (
              <div key={i} className="tabular text-muted">
                {l}
              </div>
            ))}
          </div>
        )}

        {pinned && (
          <div className="absolute bottom-14 left-2 z-10 max-w-[280px] rounded-lg border border-line bg-white p-2.5 text-xs shadow-md sm:bottom-auto sm:left-auto sm:right-14 sm:top-2" role="dialog" aria-label={`Details ${pinned.title}`} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-brand">{pinned.title}</div>
              <button type="button" aria-label="Details schließen" className="-mr-1 -mt-0.5 rounded px-1 text-muted hover:bg-page" onClick={() => setPinned(null)}>
                ×
              </button>
            </div>
            {pinned.lines.map((l, i) => (
              <div key={i} className="tabular text-muted">
                {l}
              </div>
            ))}
          </div>
        )}
      </div>

      <fieldset className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2">
        <legend className="sr-only">Ebenen</legend>
        {chips.map((l) => (
          <label
            key={l.id}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={layers[l.id]}
              onChange={(e) => toggleLayer(l.id, e.target.checked)}
              aria-label={`Ebene ${l.label}`}
            />
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${layers[l.id] ? "bg-accent" : "bg-line"}`} />
            {l.label}
          </label>
        ))}
        <span className="ml-auto self-center text-[11px] text-muted">
          Einheit: <span className="tabular font-medium text-brand">{distanceUnit(plan.scale)}</span>
        </span>
      </fieldset>
    </div>
  );
}
