import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LayoutElement, Market, ProductLocation } from "../../domain/types";
import { SHELF_TYPES, categoryColor, locateProduct, productsOnShelf, shelfName } from "../../data";

export interface ListPin {
  location: ProductLocation;
  /** Number shown in the pin (visit number if a route exists, otherwise list position). */
  number: number;
}

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoreMapProps {
  market: Market;
  selectedProductId?: string | null;
  listLocations?: ListPin[];
  onShelfClick?: (shelf: LayoutElement) => void;
  /** Shelf that is currently open in the side panel (highlighted). */
  activeShelfId?: number | null;
  showBeacons?: boolean;
  /** Zoom the camera to this rect (metres). null = whole store. */
  focusRect?: MapRect | null;
  /** Rendered inside the svg above shelves (route layer, simulated position). */
  children?: ReactNode;
  /** HTML overlay inside the map frame (legends, toolbars). */
  overlay?: ReactNode;
  className?: string;
}

const PAD = 0.9;
const AMBER = "#E8B86D";
const MINT = "#63E6B4";

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 720);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface Tip {
  shelfId: number;
  left: number;
  top: number;
}

export function StoreMap({
  market,
  selectedProductId,
  listLocations = [],
  onShelfClick,
  activeShelfId,
  showBeacons = false,
  focusRect,
  children,
  overlay,
  className = ""
}: StoreMapProps) {
  const reduce = useReducedMotion();
  const uid = useId().replace(/:/g, "");
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [wrapRef, wrapWidth] = useContainerWidth<HTMLDivElement>();
  const { width: W, height: H } = market.layout.gridSize;
  const fullBox = { x: -PAD, y: -PAD, width: W + PAD * 2, height: H + PAD * 2 };
  const pxPerM = wrapWidth / fullBox.width;
  /** Visual scale for pins and labels so they stay readable on narrow screens. */
  const k = Math.max(1, 15 / pxPerM);
  const showLabels = pxPerM >= 12;

  const els = market.layout.elements;
  const shelves = useMemo(
    () => els.filter((e) => SHELF_TYPES.includes(e.type)).sort((a, b) => a.y - b.y || a.x - b.x),
    [els]
  );
  const selectedLoc = useMemo(() => {
    if (!selectedProductId) return null;
    const product = market.products.find((p) => p.id === selectedProductId);
    return product ? (locateProduct(market, product) ?? null) : null;
  }, [market, selectedProductId]);

  const listShelfIds = new Set(listLocations.map((l) => l.location.shelf.id));
  const dimOthers = Boolean(selectedProductId);

  const [hover, setHover] = useState<Tip | null>(null);
  const [roving, setRoving] = useState(0);
  const [focusRing, setFocusRing] = useState<number | null>(null);
  const shelfRefs = useRef<Array<SVGGElement | null>>([]);

  const showTip = useCallback((shelf: LayoutElement, node: Element) => {
    const frame = frameRef.current;
    if (!frame) return;
    const f = frame.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    setHover({ shelfId: shelf.id, left: r.left - f.left + r.width / 2, top: r.top - f.top });
  }, []);

  const onGroupKey = (e: KeyboardEvent<SVGGElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (roving + dir + shelves.length) % shelves.length;
    setRoving(next);
    shelfRefs.current[next]?.focus();
  };

  const vb = focusRect ? { x: focusRect.x, y: focusRect.y, width: focusRect.width, height: focusRect.height } : fullBox;
  const viewBox = `${vb.x} ${vb.y} ${vb.width} ${vb.height}`;
  const hoverShelf = hover ? shelves.find((s) => s.id === hover.shelfId) : undefined;
  const hoverProducts = hoverShelf ? productsOnShelf(market, hoverShelf) : [];

  const labelFont = 0.56;
  const edgeLabel = Math.max(0.6, 10 / pxPerM);

  return (
    <div ref={frameRef} className={`relative overflow-hidden rounded-3xl bg-ink-800 ring-1 ring-white/8 ${className}`} data-testid="store-map">
      <div ref={wrapRef} className="w-full">
        <motion.svg
          role="group"
          aria-label={`Grundriss ${market.name} (fiktiver Demomarkt)`}
          className="block h-auto w-full select-none"
          style={{ aspectRatio: `${fullBox.width} / ${fullBox.height}` }}
          initial={false}
          animate={{ viewBox }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          preserveAspectRatio="xMidYMid meet"
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <pattern id={`${uid}-grid`} width="1" height="1" patternUnits="userSpaceOnUse">
              <path d="M 1 0 L 0 0 0 1" fill="none" stroke="#9db0b2" strokeOpacity="0.07" strokeWidth="0.03" />
            </pattern>
            <radialGradient id={`${uid}-floor`} cx="50%" cy="40%" r="80%">
              <stop offset="0%" stopColor="#12262e" />
              <stop offset="100%" stopColor="#0b171d" />
            </radialGradient>
            <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="0.25" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* floor */}
          <rect x={0} y={0} width={W} height={H} rx={0.5} fill={`url(#${uid}-floor)`} />
          <rect x={0} y={0} width={W} height={H} rx={0.5} fill={`url(#${uid}-grid)`} />

          {/* walls */}
          {els
            .filter((e) => e.type === "wall")
            .map((w) => (
              <rect key={w.id} x={w.x} y={w.y} width={w.width} height={w.height} fill="#1d353e" stroke="#2c4a54" strokeWidth={0.04} />
            ))}

          {/* entrance / exit */}
          {els
            .filter((e) => e.type === "entrance" || e.type === "exit")
            .map((e) => {
              const cx = e.x + e.width / 2;
              const entering = e.type === "entrance";
              return (
                <g key={e.id} data-testid={entering ? "map-entrance" : "map-exit"}>
                  <rect x={e.x} y={e.y} width={e.width} height={e.height} fill={MINT} fillOpacity={0.16} stroke={MINT} strokeOpacity={0.7} strokeWidth={0.06} />
                  <path
                    d={entering ? `M ${cx - 0.3} ${e.y + 0.65} L ${cx} ${e.y + 0.3} L ${cx + 0.3} ${e.y + 0.65}` : `M ${cx - 0.3} ${e.y + 0.35} L ${cx} ${e.y + 0.7} L ${cx + 0.3} ${e.y + 0.35}`}
                    fill="none"
                    stroke={MINT}
                    strokeWidth={0.11}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <text x={cx} y={e.y - 0.35} textAnchor="middle" fontSize={edgeLabel} fontWeight={600} fill={MINT} fillOpacity={0.9} style={{ letterSpacing: "0.02em" }}>
                    {e.label}
                  </text>
                </g>
              );
            })}

          {/* checkouts */}
          {els
            .filter((e) => e.type === "checkout")
            .map((c) => (
              <g key={c.id} data-testid="map-checkout">
                <rect x={c.x + 0.05} y={c.y + 0.05} width={c.width - 0.1} height={c.height - 0.1} rx={0.18} fill={AMBER} fillOpacity={0.14} stroke={AMBER} strokeOpacity={0.6} strokeWidth={0.06} />
                {showLabels ? (
                  <text x={c.x + c.width / 2} y={c.y + 0.68} textAnchor="middle" fontSize={0.5} fontWeight={600} fill={AMBER} fillOpacity={0.95}>
                    {c.label}
                  </text>
                ) : (
                  <circle cx={c.x + c.width / 2} cy={c.y + 0.5} r={0.18 * k} fill={AMBER} fillOpacity={0.8} />
                )}
              </g>
            ))}

          {/* shelves */}
          <g onKeyDown={onGroupKey}>
            {shelves.map((s, i) => {
              const color = categoryColor(market, s.category);
              const isSel = selectedLoc?.shelf.id === s.id;
              const isActive = activeShelfId === s.id;
              const isHover = hover?.shelfId === s.id;
              const inList = listShelfIds.has(s.id);
              const dim = dimOthers && !isSel && !inList;
              const count = productsOnShelf(market, s).length;
              const vertical = s.height > s.width;
              const emphasis = isSel || isActive || isHover;
              return (
                <g
                  key={s.id}
                  ref={(n) => {
                    shelfRefs.current[i] = n;
                  }}
                  role="button"
                  tabIndex={roving === i ? 0 : -1}
                  aria-label={`${shelfName(market, s)}, ${count} ${count === 1 ? "Produkt" : "Produkte"}`}
                  data-testid="map-shelf"
                  data-category={s.category}
                  data-meter={s.meter}
                  data-selected={isSel ? "true" : undefined}
                  style={{ cursor: "pointer", outline: "none", transition: "opacity 400ms cubic-bezier(0.16,1,0.3,1)" }}
                  opacity={dim ? 0.32 : 1}
                  onClick={() => {
                    setRoving(i);
                    onShelfClick?.(s);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      onShelfClick?.(s);
                    }
                  }}
                  onMouseEnter={(ev) => showTip(s, ev.currentTarget)}
                  onFocus={(ev) => {
                    setRoving(i);
                    showTip(s, ev.currentTarget);
                    setFocusRing(ev.currentTarget.matches(":focus-visible") ? s.id : null);
                  }}
                  onBlur={() => {
                    setHover((h) => (h?.shelfId === s.id ? null : h));
                    setFocusRing((f) => (f === s.id ? null : f));
                  }}
                >
                  <rect
                    x={s.x + 0.06}
                    y={s.y + 0.06}
                    width={s.width - 0.12}
                    height={s.height - 0.12}
                    rx={0.2}
                    fill={color}
                    fillOpacity={emphasis ? 0.4 : s.type === "shelf" ? 0.17 : 0.24}
                    stroke={isSel ? AMBER : color}
                    strokeOpacity={emphasis ? 1 : 0.5}
                    strokeWidth={isSel ? 0.12 : 0.06}
                    style={{ transition: "fill-opacity 250ms, stroke-opacity 250ms" }}
                    filter={isSel ? `url(#${uid}-glow)` : undefined}
                  />
                  {s.type === "cooler" && (
                    <rect x={s.x + 0.2} y={s.y + 0.2} width={s.width - 0.4} height={s.height - 0.4} rx={0.12} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={0.04} strokeDasharray="0.25 0.2" />
                  )}
                  {showLabels && s.width * s.height >= 4 && (
                    <text
                      x={s.x + s.width / 2}
                      y={s.y + s.height / 2}
                      transform={vertical ? `rotate(-90 ${s.x + s.width / 2} ${s.y + s.height / 2})` : undefined}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={labelFont}
                      fontWeight={600}
                      fill="#e7efee"
                      fillOpacity={0.82}
                      pointerEvents="none"
                    >
                      {s.label}
                    </text>
                  )}
                  {/* focus ring */}
                  <rect x={s.x - 0.05} y={s.y - 0.05} width={s.width + 0.1} height={s.height + 0.1} rx={0.26} fill="none" stroke={MINT} strokeWidth={0.1} opacity={focusRing === s.id ? 1 : 0} />
                </g>
              );
            })}
          </g>

          {/* beacons */}
          {showBeacons &&
            els
              .filter((e) => e.type === "beacon")
              .map((b, i) => {
                const cx = b.x + 0.5;
                const cy = b.y + 0.5;
                return (
                  <g key={b.id} data-testid="map-beacon" pointerEvents="none">
                    {!reduce &&
                      [0, 1].map((n) => (
                        <circle key={n} cx={cx} cy={cy} r={0.2} fill="none" stroke={MINT} strokeWidth={0.05}>
                          <animate attributeName="r" values="0.2;1.5" dur="3s" begin={`${(i % 4) * 0.4 + n * 1.5}s`} repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.7;0" dur="3s" begin={`${(i % 4) * 0.4 + n * 1.5}s`} repeatCount="indefinite" />
                        </circle>
                      ))}
                    <circle cx={cx} cy={cy} r={0.2} fill={MINT} fillOpacity={0.95} />
                    <circle cx={cx} cy={cy} r={0.34} fill="none" stroke={MINT} strokeOpacity={0.5} strokeWidth={0.05} />
                    {showLabels && (
                      <text x={cx} y={cy - 0.5} textAnchor="middle" fontSize={0.42} fill={MINT} fillOpacity={0.75} fontWeight={600}>
                        {b.beaconCode}
                      </text>
                    )}
                  </g>
                );
              })}

          {/* list pins (numbered) */}
          {listLocations.map(({ location, number }) => {
            const { x, y } = location.pin;
            const r = 0.5 * k;
            const isSel = location.product.id === selectedProductId;
            return (
              <g key={location.product.id} data-testid="map-list-pin" data-number={number} pointerEvents="none" opacity={dimOthers && !isSel ? 0.9 : 1}>
                <circle cx={x} cy={y} r={r} fill="#071117" stroke={MINT} strokeWidth={0.09 * k} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={0.62 * k} fontWeight={700} fill={MINT}>
                  {number}
                </text>
              </g>
            );
          })}

          {/* route layer etc. from the navigation feature */}
          {children}

          {/* selected product pin */}
          {selectedLoc && <SelectedPin key={selectedLoc.product.id} loc={selectedLoc} k={k} reduce={Boolean(reduce)} bounds={{ w: W, h: H }} />}
        </motion.svg>
      </div>

      {hover && hoverShelf && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-20 w-max max-w-[15rem] -translate-x-1/2 -translate-y-full rounded-xl border border-white/10 bg-ink-950/95 px-3 py-2 text-xs shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur"
          style={{ left: Math.min(Math.max(hover.left, 110), Math.max(110, wrapWidth - 110)), top: Math.max(hover.top - 8, 8) }}
          data-testid="map-tooltip"
        >
          <div className="font-semibold text-white">{shelfName(market, hoverShelf)}</div>
          {hoverProducts.length > 0 ? (
            <div className="mt-1 text-ink-200">
              {hoverProducts.slice(0, 4).map((p) => `${p.emoji} ${p.name}`).join(" · ")}
              {hoverProducts.length > 4 ? ` · +${hoverProducts.length - 4} weitere` : ""}
            </div>
          ) : (
            <div className="mt-1 text-ink-300">Keine Produkte hinterlegt</div>
          )}
        </div>
      )}
      {overlay}
    </div>
  );
}

function SelectedPin({ loc, k, reduce, bounds }: { loc: ProductLocation; k: number; reduce: boolean; bounds: { w: number; h: number } }) {
  const { x, y } = loc.pin;
  const access = loc.shelf.access ?? "south";
  const dx = access === "east" ? 1 : access === "west" ? -1 : 0;
  const dy = access === "south" ? 1 : access === "north" ? -1 : 0;
  const text = `${loc.product.emoji}  ${loc.product.name}`;
  const fs = 0.62 * k;
  const w = Math.min(14, text.length * 0.34 * k + 1.4 * k);
  const h = 1.2 * k;
  const cx = Math.min(bounds.w - w / 2 - 0.2, Math.max(w / 2 + 0.2, x + dx * (w / 2 + 0.9 * k)));
  const cy = Math.min(bounds.h - h / 2 - 0.2, Math.max(h / 2 + 0.2, y + dy * (h / 2 + 1.1 * k)));
  return (
    <g data-testid="selected-pin" data-product-id={loc.product.id} pointerEvents="none">
      {!reduce &&
        [0, 1.1].map((begin) => (
          <circle key={begin} cx={x} cy={y} r={0.4 * k} fill="none" stroke={AMBER} strokeWidth={0.07 * k}>
            <animate attributeName="r" values={`${0.4 * k};${2.2 * k}`} dur="2.2s" begin={`${begin}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.85;0" dur="2.2s" begin={`${begin}s`} repeatCount="indefinite" />
          </circle>
        ))}
      <circle cx={x} cy={y} r={0.62 * k} fill={AMBER} fillOpacity={0.22} />
      <circle cx={x} cy={y} r={0.4 * k} fill={AMBER} stroke="#071117" strokeWidth={0.1 * k} />
      <circle cx={x} cy={y} r={0.12 * k} fill="#071117" />
      <g>
        <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={0.35 * k} fill="#071117" fillOpacity={0.92} stroke={AMBER} strokeOpacity={0.8} strokeWidth={0.06 * k} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={600} fill="#f4efe4">
          {text}
        </text>
      </g>
    </g>
  );
}
