import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Grid, RoundedBox } from "@react-three/drei";
import { AdditiveBlending, CanvasTexture, DoubleSide, LinearFilter, type MeshBasicMaterial } from "three";
import type { LayoutElement } from "../../domain/types";
import { elementCentre, type GridSize } from "./transforms";
import { AMBER, BG, FLOOR, MINT } from "./theme";
import { FadeLabel } from "./FadeLabel";

/** Radial fade texture used for the ground vignette. */
function useVignetteTexture() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
      grad.addColorStop(0, "rgba(17,38,46,1)");
      grad.addColorStop(0.55, "rgba(10,24,30,0.85)");
      grad.addColorStop(1, "rgba(7,17,23,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
    }
    const t = new CanvasTexture(c);
    t.minFilter = LinearFilter;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

export function Floor({ grid }: { grid: GridSize }) {
  const vignette = useVignetteTexture();
  const span = Math.max(grid.width, grid.height) * 3.2;
  return (
    <group>
      {/* soft vignette ground that fades into the background */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.06, 0]}>
        <planeGeometry args={[span, span]} />
        <meshBasicMaterial map={vignette} transparent depthWrite={false} />
      </mesh>
      {/* floor slab */}
      <RoundedBox args={[grid.width, 0.2, grid.height]} radius={0.06} smoothness={2} position={[0, -0.1, 0]}>
        <meshStandardMaterial color={FLOOR} roughness={0.62} metalness={0.15} />
      </RoundedBox>
      <Grid
        position={[0, 0.004, 0]}
        args={[grid.width, grid.height]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2a4650"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#3a5e69"
        fadeDistance={90}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 70, 170]} />
    </group>
  );
}

export function Walls({ elements, grid }: { elements: LayoutElement[]; grid: GridSize }) {
  const walls = elements.filter((e) => e.type === "wall");
  return (
    <group>
      {walls.map((w) => {
        const c = elementCentre(w, grid);
        const h = 1.05;
        return (
          <group key={w.id} position={[c.x, 0, c.z]}>
            <mesh position={[0, h / 2, 0]}>
              <boxGeometry args={[w.width, h, w.height]} />
              <meshStandardMaterial color="#0a171d" transparent opacity={0.5} roughness={0.5} metalness={0.1} depthWrite={false} />
            </mesh>
            <mesh position={[0, h + 0.015, 0]}>
              <boxGeometry args={[w.width + 0.02, 0.03, w.height + 0.02]} />
              <meshBasicMaterial color="#3d6772" toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Glowing floor gate with two posts, a lintel and a pulsing chevron strip. */
export function Gates({ elements, grid, compact }: { elements: LayoutElement[]; grid: GridSize; compact: boolean }) {
  const gates = elements.filter((e) => e.type === "entrance" || e.type === "exit");
  return (
    <group>
      {gates.map((g) => (
        <Gate key={g.id} el={g} grid={grid} compact={compact} />
      ))}
    </group>
  );
}

function Gate({ el, grid, compact }: { el: LayoutElement; grid: GridSize; compact: boolean }) {
  const c = elementCentre(el, grid);
  const entering = el.type === "entrance";
  const w = el.width;
  const d = el.height;
  const strip = useRef<MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (strip.current) strip.current.opacity = 0.2 + 0.12 * Math.sin(clock.elapsedTime * 2.2 + (entering ? 0 : 1.6));
  });
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial ref={strip} color={MINT} transparent opacity={0.28} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {[-w / 2 + 0.05, w / 2 - 0.05].map((x) => (
        <mesh key={x} position={[x, 1.1, 0]}>
          <boxGeometry args={[0.07, 2.2, 0.07]} />
          <meshBasicMaterial color={MINT} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[w - 0.03, 0.07, 0.07]} />
        <meshBasicMaterial color={MINT} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <planeGeometry args={[w - 0.1, 2.1]} />
        <meshBasicMaterial color={MINT} transparent opacity={0.07} side={DoubleSide} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <FadeLabel position={[0, 2.75, 0]} fadeStart={60} fadeEnd={95}>
        <span
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-ink-950/80 font-semibold text-mint backdrop-blur"
          style={{ padding: compact ? "2px 7px" : "3px 10px", fontSize: compact ? 10 : 11.5, letterSpacing: "0.03em", whiteSpace: "nowrap" }}
        >
          {entering ? "Eingang" : "Ausgang"}
        </span>
      </FadeLabel>
    </group>
  );
}

export function Checkouts({ elements, grid, compact }: { elements: LayoutElement[]; grid: GridSize; compact: boolean }) {
  const list = elements.filter((e) => e.type === "checkout");
  return (
    <group>
      {list.map((k) => {
        const c = elementCentre(k, grid);
        const w = Math.max(0.5, k.width - 0.16);
        const d = Math.max(0.5, k.height - 0.16);
        const long = Math.max(w, d);
        const alongX = w >= d;
        return (
          <group key={k.id} position={[c.x, 0, c.z]}>
            <RoundedBox args={[w, 0.95, d]} radius={0.08} smoothness={3} position={[0, 0.475, 0]}>
              <meshStandardMaterial color="#26414a" roughness={0.45} metalness={0.2} />
            </RoundedBox>
            {/* belt */}
            <mesh position={[0, 0.965, 0]}>
              <boxGeometry args={alongX ? [long * 0.72, 0.02, d * 0.5] : [w * 0.5, 0.02, long * 0.72]} />
              <meshStandardMaterial color="#0b161b" roughness={0.9} />
            </mesh>
            {/* amber edge */}
            <mesh position={alongX ? [0, 0.99, d / 2] : [w / 2, 0.99, 0]}>
              <boxGeometry args={alongX ? [w + 0.02, 0.03, 0.06] : [0.06, 0.03, d + 0.02]} />
              <meshBasicMaterial color={AMBER} toneMapped={false} />
            </mesh>
            {/* display */}
            <mesh position={alongX ? [-long * 0.38, 1.3, 0] : [0, 1.3, -long * 0.38]}>
              <boxGeometry args={[0.28, 0.2, 0.05]} />
              <meshBasicMaterial color={AMBER} transparent opacity={0.85} toneMapped={false} />
            </mesh>
            {!compact && (
              <FadeLabel position={[0, 1.75, 0]} fadeStart={30} fadeEnd={46}>
                <span className="rounded-full border border-white/10 bg-ink-950/75 font-semibold text-amber backdrop-blur" style={{ padding: "2px 7px", fontSize: 10.5, whiteSpace: "nowrap" }}>
                  {k.label ?? "Kasse"}
                </span>
              </FadeLabel>
            )}
          </group>
        );
      })}
    </group>
  );
}
