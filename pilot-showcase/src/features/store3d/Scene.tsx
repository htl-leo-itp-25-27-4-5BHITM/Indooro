import { useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { LayoutElement } from "../../domain/types";
import { productsOnShelf, shelfName } from "../../data";
import { CameraRig, FOV_DEG } from "./CameraRig";
import { homePose } from "./camera";
import { Beacons3D } from "./Beacons3D";
import { Checkouts, Floor, Gates, Walls } from "./Environment3D";
import { FadeLabel, LabelScaleContext } from "./FadeLabel";
import { ProductTarget } from "./Markers3D";
import { Route3D } from "./Route3D";
import { Shelves3D } from "./Shelves3D";
import { Shopper3D, type ShopperPose } from "./Shopper3D";
import { shelfHeight, elementCentre, toWorld } from "./transforms";
import type { Store3DViewProps } from "./types";

export interface SceneProps extends Store3DViewProps {
  reduce: boolean;
  compact: boolean;
  following: boolean;
  followWanted: boolean;
  overviewNonce: number;
}

/** Everything inside the <Canvas>. Rebuilt (keyed) when the market changes. */
export function Scene({ market, route, sim, selected, listPins, activeShelfId, showBeacons, onShelfClick, reduce, compact, following, followWanted, overviewNonce }: SceneProps) {
  const grid = market.layout.gridSize;
  const els = market.layout.elements;
  const shopper = useRef<ShopperPose>({ x: 0, z: 0, heading: 0, active: false });
  const size = useThree((st) => st.size);
  const aspect = size.width / Math.max(1, size.height);
  const home = useMemo(
    () => homePose(grid.width, grid.height, { fovDeg: FOV_DEG, aspect, pitchDeg: compact ? 50 : 42, yawDeg: compact && aspect < 0.95 && grid.width > grid.height * 1.15 ? 78 : 9, fill: compact ? 0.97 : 0.96, boxHeight: 2 }),
    [grid.width, grid.height, aspect, compact]
  );
  const labelScale = useMemo(() => Math.max(0.7, new Vector3(...home.position).distanceTo(new Vector3(...home.target)) / 45), [home]);
  const [hovered, setHovered] = useState<LayoutElement | null>(null);

  const highlight = useMemo(
    () => ({ selectedShelfId: selected?.shelf.id ?? null, activeShelfId, listShelfIds: new Set(listPins.map((l) => l.location.shelf.id)) as ReadonlySet<number> }),
    [selected, activeShelfId, listPins]
  );
  const stopNames = useMemo(() => new Map(listPins.map((l) => [l.location.product.id, l.location.product.name])), [listPins]);

  const activeStopId = route && sim.activeStopIndex >= 0 ? route.order[sim.activeStopIndex]?.id : undefined;
  const activeLoc = useMemo(() => (activeStopId ? listPins.find((l) => l.location.product.id === activeStopId)?.location : undefined), [activeStopId, listPins]);
  const showActive = Boolean(activeLoc) && activeLoc?.product.id !== selected?.product.id && !sim.reachedStopIds.has(activeStopId ?? "");

  const focus = useMemo(() => {
    if (!selected) return null;
    const w = toWorld(selected.pin.x, selected.pin.y, grid);
    return { key: `${market.code}:${selected.product.id}`, x: w.x, z: w.z };
  }, [selected, grid, market.code]);

  const hoverProducts = hovered ? productsOnShelf(market, hovered) : [];

  return (
    <LabelScaleContext.Provider value={labelScale}>
      <hemisphereLight args={["#9fc9d3", "#07111a", 0.55]} />
      <directionalLight position={[-14, 26, 12]} intensity={0.85} color="#fff1dc" />
      <directionalLight position={[16, 10, -14]} intensity={0.3} color="#7fd8ff" />

      <CameraRig
        home={home}
        width={grid.width}
        depth={grid.height}
        marketKey={market.code}
        reduce={reduce}
        compact={compact}
        following={following}
        followWanted={followWanted}
        shopper={shopper}
        overviewNonce={overviewNonce}
        focus={focus}
      />

      <group key={market.code}>
        <Floor grid={grid} />
        <Walls elements={els} grid={grid} />
        <Gates elements={els} grid={grid} compact={compact} />
        <Checkouts elements={els} grid={grid} compact={compact} />
        <Shelves3D market={market} highlight={highlight} compact={compact} onShelfClick={onShelfClick} onHover={setHovered} />
        {showBeacons && <Beacons3D elements={els} grid={grid} animate={!reduce} />}

        {route && <Route3D route={route} sim={sim} grid={grid} reduce={reduce} compact={compact} stopNames={stopNames} />}
        {showActive && activeLoc && <ProductTarget loc={activeLoc} grid={grid} market={market} reduce={reduce} card={false} compact={compact} />}
        {selected && <ProductTarget loc={selected} grid={grid} market={market} reduce={reduce} card compact={compact} />}

        <Shopper3D sim={sim} grid={grid} reduce={reduce} poseRef={shopper} />

        {hovered && !compact && (
          <FadeLabel position={[elementCentre(hovered, grid).x, shelfHeight(hovered) + 1.1, elementCentre(hovered, grid).z]} fadeStart={90} fadeEnd={120} zIndex={9}>
            <div className="rounded-xl border border-white/10 bg-ink-950/95 px-3 py-2 text-xs shadow-[0_12px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur" style={{ maxWidth: 240 }}>
              <div className="font-semibold text-white">{shelfName(market, hovered)}</div>
              <div className="mt-0.5 text-ink-200">
                {hoverProducts.length > 0 ? hoverProducts.slice(0, 3).map((p) => `${p.emoji} ${p.name}`).join(" · ") + (hoverProducts.length > 3 ? ` · +${hoverProducts.length - 3}` : "") : "Keine Produkte hinterlegt"}
              </div>
            </div>
          </FadeLabel>
        )}
      </group>
    </LabelScaleContext.Provider>
  );
}
