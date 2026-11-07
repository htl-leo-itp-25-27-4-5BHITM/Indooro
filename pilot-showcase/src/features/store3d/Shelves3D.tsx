import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { CanvasTexture, Color, InstancedMesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, type Group, type Material } from "three";
import type { LayoutElement, Market } from "../../domain/types";
import { SHELF_TYPES, categoryColor, shelfName } from "../../data";
import { elementCentre, productBlocks, shelfHeight, type GridSize, type ProductBlock } from "./transforms";
import { AMBER, COOLER_BODY, FRESH_BODY, MINT, SHELF_BODY } from "./theme";
import { FadeLabel } from "./FadeLabel";
import type { ThreeEvent } from "@react-three/fiber";

/** Short zone names (same wording as the 2D map). */
const SHORT_LABEL: Record<string, string> = {
  "110": "Brot",
  "320": "Fleisch",
  "410": "Milch",
  "420": "Käse & Eier",
  "510": "Tiefkühl",
  "610": "Nudeln & Reis",
  "620": "Frühstück",
  "630": "Süßes",
  "640": "Öl & Gewürze",
  "650": "Konserven",
  "710": "Getränke",
  "720": "Bier & Wein",
  "810": "Haushalt",
  "820": "Pflege"
};

export interface ShelfHighlight {
  selectedShelfId: number | null;
  activeShelfId: number | null;
  listShelfIds: ReadonlySet<number>;
}

interface ShelvesProps {
  market: Market;
  highlight: ShelfHighlight;
  compact: boolean;
  onShelfClick(shelf: LayoutElement): void;
  onHover(shelf: LayoutElement | null): void;
}

export function Shelves3D({ market, highlight, compact, onShelfClick, onHover }: ShelvesProps) {
  const grid = market.layout.gridSize;
  const shelves = useMemo(() => market.layout.elements.filter((e) => SHELF_TYPES.includes(e.type)), [market]);

  return (
    <group>
      <ContactShadows shelves={shelves} grid={grid} />
      {shelves.map((s) => (
        <Shelf key={s.id} shelf={s} market={market} grid={grid} highlight={highlight} onShelfClick={onShelfClick} onHover={onHover} />
      ))}
      <Products shelves={shelves} market={market} grid={grid} />
      <ZoneLabels shelves={shelves} market={market} grid={grid} compact={compact} />
    </group>
  );
}

interface ShelfProps {
  shelf: LayoutElement;
  market: Market;
  grid: GridSize;
  highlight: ShelfHighlight;
  onShelfClick(shelf: LayoutElement): void;
  onHover(shelf: LayoutElement | null): void;
}

function Shelf({ shelf, market, grid, highlight, onShelfClick, onHover }: ShelfProps) {
  const c = elementCentre(shelf, grid);
  const h = shelfHeight(shelf);
  const catColor = useMemo(() => new Color(categoryColor(market, shelf.category)), [market, shelf.category]);
  const body = useMemo(
    () =>
      new MeshStandardMaterial({
        color: shelf.type === "cooler" ? COOLER_BODY : shelf.type === "fresh" ? FRESH_BODY : SHELF_BODY,
        roughness: 0.55,
        metalness: 0.25,
        emissive: new Color("#000000")
      }),
    [shelf.type]
  );
  const edge = useMemo(() => new MeshBasicMaterial({ color: catColor.clone(), toneMapped: false }), [catColor]);
  const top = useMemo(
    () => new MeshStandardMaterial({ color: new Color(SHELF_BODY).lerp(catColor, 0.22), roughness: 0.5, metalness: 0.2, emissive: catColor.clone().multiplyScalar(0.18) }),
    [catColor]
  );
  useEffect(
    () => () => {
      body.dispose();
      edge.dispose();
      top.dispose();
    },
    [body, edge, top]
  );
  const horizontal = (shelf.access ?? "south") === "south" || (shelf.access ?? "south") === "north";
  const sw = shelf.width - 0.02;
  const sd = shelf.height - 0.02;

  const hover = useRef(false);
  const emph = useRef(0);
  const group = useRef<Group>(null);
  const isSel = highlight.selectedShelfId === shelf.id;
  const isActive = highlight.activeShelfId === shelf.id;
  const inList = highlight.listShelfIds.has(shelf.id);
  const tmp = useMemo(() => new Color(), []);

  useFrame((_, dt) => {
    const target = hover.current ? 1 : isSel || isActive ? 0.85 : inList ? 0.5 : 0;
    emph.current += (target - emph.current) * Math.min(1, dt * 10);
    const e = emph.current;
    const tint = isSel || isActive ? AMBER : inList && !hover.current ? MINT : "#ffffff";
    tmp.set(tint).lerp(catColor, hover.current ? 0.35 : 0.0);
    body.emissive.copy(tmp).multiplyScalar(0.16 * e);
    edge.color.copy(catColor).lerp(tmp.set(isSel || isActive ? AMBER : "#ffffff"), Math.min(1, e * 0.7)).multiplyScalar(0.8 + 0.5 * e);
    top.emissive.copy(catColor).multiplyScalar(0.18 + 0.5 * e);
    if (group.current) group.current.scale.y = 1 + 0.012 * e;
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5) return; // was a drag (orbit), not a tap
    e.stopPropagation();
    onShelfClick(shelf);
  };

  return (
    <group
      ref={group}
      position={[c.x, 0, c.z]}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation();
        hover.current = true;
        document.body.style.cursor = "pointer";
        onHover(shelf);
      }}
      onPointerOut={() => {
        hover.current = false;
        document.body.style.cursor = "";
        onHover(null);
      }}
    >
      <RoundedBox args={[shelf.width - 0.1, h, shelf.height - 0.1]} radius={0.07} smoothness={2} position={[0, h / 2, 0]} material={body as Material} />
      <RoundedBox args={[sw, 0.06, sd]} radius={0.025} smoothness={2} position={[0, h + 0.02, 0]} material={top as Material} />
      {/* emissive rails along both long edges */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={horizontal ? [0, h + 0.058, (side * (sd - 0.05)) / 2] : [(side * (sw - 0.05)) / 2, h + 0.058, 0]} material={edge}>
          <boxGeometry args={horizontal ? [sw - 0.06, 0.03, 0.05] : [0.05, 0.03, sd - 0.06]} />
        </mesh>
      ))}
    </group>
  );
}

/** One InstancedMesh with all small product blocks of the market. Not raycastable (shelf bodies are). */
function Products({ shelves, market, grid }: { shelves: LayoutElement[]; market: Market; grid: GridSize }) {
  const mesh = useRef<InstancedMesh>(null);
  const items = useMemo(() => {
    const list: Array<{ b: ProductBlock; color: string }> = [];
    for (const s of shelves) {
      const color = categoryColor(market, s.category);
      for (const b of productBlocks(s, grid)) list.push({ b, color });
    }
    return list;
  }, [shelves, market, grid]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    const col = new Color();
    const hsl = { h: 0, s: 0, l: 0 };
    items.forEach(({ b, color }, i) => {
      o.position.set(b.x, b.y, b.z);
      o.scale.set(b.sx, b.sy, b.sz);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      col.set(color);
      col.getHSL(hsl);
      if (b.r > 0.86) col.setHSL(0.1, 0.1, 0.78); // neutral packaging
      else if (b.r > 0.72) col.setHSL(hsl.h + 0.04, 0.55, 0.42);
      else col.setHSL(hsl.h, Math.min(0.85, hsl.s * (0.6 + b.r * 0.5)), 0.38 + b.r * 0.3);
      m.setColorAt(i, col);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, items.length]} raycast={() => null} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} metalness={0.05} emissive="#ffffff" emissiveIntensity={0.05} />
    </instancedMesh>
  );
}

/** Soft dark footprint under every shelf (cheap ambient occlusion). */
function ContactShadows({ shelves, grid }: { shelves: LayoutElement[]; grid: GridSize }) {
  const mesh = useRef<InstancedMesh>(null);
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(32, 32, 6, 32, 32, 32);
      grad.addColorStop(0, "rgba(0,0,0,0.75)");
      grad.addColorStop(0.6, "rgba(0,0,0,0.4)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
    }
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    shelves.forEach((s, i) => {
      const c = elementCentre(s, grid);
      o.position.set(c.x, 0.012, c.z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(s.width + 1.3, s.height + 1.3, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [shelves, grid]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, shelves.length]} raycast={() => null} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </instancedMesh>
  );
}

/** One zone label per category (on its largest shelf); fewer on small screens. */
function ZoneLabels({ shelves, market, grid, compact }: { shelves: LayoutElement[]; market: Market; grid: GridSize; compact: boolean }) {
  const labels = useMemo(() => {
    const byCat = new Map<string, LayoutElement[]>();
    for (const s of shelves) {
      if (!s.category) continue;
      byCat.set(s.category, [...(byCat.get(s.category) ?? []), s]);
    }
    const out = [...byCat.entries()].map(([cat, list]) => {
      // centroid of all meters of that category, snapped to the nearest shelf
      const cx = list.reduce((a, s) => a + s.x + s.width / 2, 0) / list.length;
      const cy = list.reduce((a, s) => a + s.y + s.height / 2, 0) / list.length;
      const nearest = [...list].sort((a, b) => Math.hypot(a.x + a.width / 2 - cx, a.y + a.height / 2 - cy) - Math.hypot(b.x + b.width / 2 - cx, b.y + b.height / 2 - cy))[0];
      return { cat, shelf: nearest, size: list.reduce((a, s) => a + s.width * s.height, 0) };
    });
    out.sort((a, b) => b.size - a.size);
    return compact ? out.slice(0, 7) : out;
  }, [shelves, compact]);

  return (
    <>
      {labels.map(({ cat, shelf }) => {
        const c = elementCentre(shelf, grid);
        const color = categoryColor(market, cat);
        const text = SHORT_LABEL[cat] ?? shelf.label ?? shelfName(market, shelf);
        return (
          <FadeLabel key={cat} position={[c.x, shelfHeight(shelf) + 0.55, c.z]} fadeStart={compact ? 30 : 38} fadeEnd={compact ? 44 : 60} nearHide={4}>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-ink-950/70 font-medium text-white/90 backdrop-blur-sm"
              style={{ padding: compact ? "1px 6px" : "2px 8px", fontSize: compact ? 9.5 : 10.5, whiteSpace: "nowrap", letterSpacing: "0.01em" }}
            >
              <span className="rounded-full" style={{ width: 6, height: 6, background: color, boxShadow: `0 0 6px ${color}` }} />
              {text}
            </span>
          </FadeLabel>
        );
      })}
    </>
  );
}
