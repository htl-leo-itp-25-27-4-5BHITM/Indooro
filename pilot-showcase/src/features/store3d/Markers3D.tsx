import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { motion } from "motion/react";
import { AdditiveBlending, Color, DoubleSide, ShaderMaterial, type Mesh, type MeshBasicMaterial } from "three";
import type { Market, ProductLocation } from "../../domain/types";
import { describeLocation } from "../../data";
import { levelCentres, shelfHeight, toWorld, type GridSize } from "./transforms";
import { AMBER, CEILING } from "./theme";
import { FadeLabel } from "./FadeLabel";

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const BEAM_FRAG = /* glsl */ `
  uniform vec3 uColor; uniform float uTime; uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float h = vUv.y;
    float fade = pow(1.0 - h, 1.35);
    float shimmer = 0.85 + 0.15 * sin(h * 24.0 - uTime * 3.0);
    gl_FragColor = vec4(uColor * (1.0 + 0.5 * fade), fade * shimmer * uIntensity);
  }
`;

/** Soft amber light beam rising from a point up to the ceiling. */
export function Beam({ x, z, y0, height = CEILING, reduce, intensity = 0.55 }: { x: number; z: number; y0: number; height?: number; reduce: boolean; intensity?: number }) {
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
        toneMapped: false,
        uniforms: { uColor: { value: new Color(AMBER) }, uTime: { value: 0 }, uIntensity: { value: intensity } }
      }),
    [intensity]
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = reduce ? 0 : clock.elapsedTime;
  });
  const len = Math.max(0.5, height - y0);
  return (
    <group position={[x, y0, z]}>
      <mesh position={[0, len / 2, 0]} material={mat} raycast={() => null} renderOrder={4}>
        <cylinderGeometry args={[0.16, 0.2, len, 24, 1, true]} />
      </mesh>
      <mesh position={[0, len / 2, 0]} raycast={() => null} renderOrder={4}>
        <cylinderGeometry args={[0.035, 0.035, len, 8, 1, true]} />
        <meshBasicMaterial color={AMBER} transparent opacity={0.5} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Expanding ripple rings on the floor. */
export function Ripple({ x, z, color = AMBER, reduce, maxRadius = 1.8, y = 0.045 }: { x: number; z: number; color?: string; reduce: boolean; maxRadius?: number; y?: number }) {
  const a = useRef<Mesh>(null);
  const b = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    [a.current, b.current].forEach((m, i) => {
      if (!m) return;
      const t = reduce ? 0.35 + i * 0.35 : (clock.elapsedTime / 2.4 + i * 0.5) % 1;
      const s = 0.25 + t * maxRadius;
      m.scale.set(s, s, 1);
      (m.material as MeshBasicMaterial).opacity = Math.pow(1 - t, 1.5) * 0.85;
    });
  });
  return (
    <group position={[x, y, z]} rotation-x={-Math.PI / 2}>
      {[a, b].map((r, i) => (
        <mesh key={i} ref={r} raycast={() => null}>
          <ringGeometry args={[0.92, 1, 56]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
      <mesh raycast={() => null}>
        <circleGeometry args={[0.22, 24]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Amber target marker for a product location: beam from its shelf level to the ceiling and a ripple. */
export function ProductTarget({ loc, grid, market, reduce, card, compact }: { loc: ProductLocation; grid: GridSize; market: Market; reduce: boolean; card: boolean; compact: boolean }) {
  const w = toWorld(loc.pin.x, loc.pin.y, grid);
  const h = shelfHeight(loc.shelf);
  const levels = levelCentres(h);
  const y0 = levels[Math.min(levels.length - 1, Math.max(0, loc.level - 1))];
  // nudge the beam a little off the shelf face into the aisle so it does not sink into the body
  const access = loc.shelf.access ?? "south";
  const nx = access === "east" ? 0.25 : access === "west" ? -0.25 : 0;
  const nz = access === "south" ? 0.25 : access === "north" ? -0.25 : 0;
  return (
    <group>
      <Beam x={w.x + nx} z={w.z + nz} y0={y0} reduce={reduce} />
      <Ripple x={w.x + nx * 2} z={w.z + nz * 2} reduce={reduce} />
      <mesh position={[w.x + nx, y0, w.z + nz]} raycast={() => null}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshBasicMaterial color={AMBER} toneMapped={false} />
      </mesh>
      {card && (
        <FadeLabel position={[w.x + nx, CEILING - 0.2, w.z + nz]} fadeStart={70} fadeEnd={110} zIndex={8}>
          <motion.div
            key={loc.product.id}
            initial={reduce ? false : { opacity: 0, y: 10, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            data-testid="store3d-product-card"
            className="flex items-center gap-2.5 rounded-2xl border border-white/12 bg-ink-950/90 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur"
            style={{ padding: compact ? "6px 10px 6px 8px" : "8px 14px 8px 10px", whiteSpace: "nowrap" }}
          >
            <span className="grid place-items-center rounded-xl bg-amber/15" style={{ width: compact ? 30 : 38, height: compact ? 30 : 38, fontSize: compact ? 18 : 22 }}>
              {loc.product.emoji}
            </span>
            <span className="leading-tight">
              <span className="block font-semibold text-white" style={{ fontSize: compact ? 12 : 13.5 }}>
                {loc.product.name}
              </span>
              <span className="block text-ink-200" style={{ fontSize: compact ? 10.5 : 11.5 }}>
                {describeLocation(market, loc)}
              </span>
            </span>
          </motion.div>
        </FadeLabel>
      )}
    </group>
  );
}
