import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { AdditiveBlending, ConeGeometry, DoubleSide, type Group, type Mesh } from "three";
import type { NavigationSimulation } from "../navigation";
import { dampFactor, shortestAngle } from "./camera";
import { toWorld, type GridSize } from "./transforms";
import { MINT } from "./theme";
import { FadeLabel } from "./FadeLabel";

export interface ShopperPose {
  x: number;
  z: number;
  /** layout heading in radians (0 = +x, grows towards +z) */
  heading: number;
  active: boolean;
}

/** Stylised simulated shopper: capsule body, head, heading cone and an illustrative accuracy halo. */
export function Shopper3D({ sim, grid, reduce, poseRef }: { sim: NavigationSimulation; grid: GridSize; reduce: boolean; poseRef: MutableRefObject<ShopperPose> }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const halo = useRef<Group>(null);
  const pulse = useRef<Mesh>(null);
  const first = useRef(true);

  const simRef = useRef(sim);
  simRef.current = sim;
  const cone = useMemo(() => new ConeGeometry(0.34, 0.9, 20, 1, true).rotateZ(-Math.PI / 2).translate(1.05, 0.04, 0), []);
  useEffect(() => () => cone.dispose(), [cone]);
  const circle = useMemo(() => Array.from({ length: 65 }, (_, i) => [Math.cos((i / 64) * Math.PI * 2) * 1.5, 0.05, Math.sin((i / 64) * Math.PI * 2) * 1.5] as [number, number, number]), []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = simRef.current;
    const g = root.current;
    if (!g) return;
    const p = s.position;
    g.visible = Boolean(p);
    poseRef.current.active = Boolean(p);
    if (!p) {
      first.current = true;
      return;
    }
    const target = toWorld(p.x, p.y, grid);
    const headingT = (p.heading * Math.PI) / 180;
    if (first.current) {
      poseRef.current.x = target.x;
      poseRef.current.z = target.z;
      poseRef.current.heading = headingT;
      first.current = false;
    }
    const k = dampFactor(reduce ? 60 : 14, dt);
    const pose = poseRef.current;
    pose.x += (target.x - pose.x) * k;
    pose.z += (target.z - pose.z) * k;
    pose.heading += shortestAngle(pose.heading, headingT) * dampFactor(reduce ? 60 : 9, dt);
    g.position.set(pose.x, 0, pose.z);
    g.rotation.y = -pose.heading;
    const t = clock.elapsedTime;
    if (body.current) {
      const walking = s.state === "running" && !reduce;
      body.current.position.y = walking ? Math.abs(Math.sin(t * 7)) * 0.035 : 0;
      body.current.rotation.z = walking ? Math.sin(t * 7) * 0.025 : 0;
    }
    if (halo.current && !reduce) halo.current.rotation.y = -t * 0.35 - g.rotation.y;
    if (pulse.current && !reduce) {
      const q = (t / 2) % 1;
      pulse.current.scale.setScalar(0.5 + q * 1.1);
      (pulse.current.material as { opacity: number }).opacity = (1 - q) * 0.35;
    }
  });

  return (
    <group ref={root} visible={false} data-testid="store3d-shopper">
      {/* soft ground glow + illustrative accuracy halo (not a measured radius) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} raycast={() => null}>
        <circleGeometry args={[0.9, 40]} />
        <meshBasicMaterial color={MINT} transparent opacity={0.16} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <mesh ref={pulse} rotation-x={-Math.PI / 2} position={[0, 0.04, 0]} raycast={() => null}>
        <ringGeometry args={[0.92, 1, 48]} />
        <meshBasicMaterial color={MINT} transparent opacity={0.3} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      <group ref={halo}>
        <Line points={circle} color={MINT} lineWidth={1.4} dashed dashSize={0.18} gapSize={0.16} transparent opacity={0.55} toneMapped={false} />
      </group>

      {/* heading cone on the floor */}
      <mesh geometry={cone} position={[0, 0.05, 0]} scale={[1, 0.02, 1]} raycast={() => null}>
        <meshBasicMaterial color={MINT} transparent opacity={0.45} side={DoubleSide} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>

      <group ref={body}>
        <mesh position={[0, 0.62, 0]} raycast={() => null}>
          <capsuleGeometry args={[0.2, 0.62, 6, 16]} />
          <meshStandardMaterial color="#0f2a31" emissive={MINT} emissiveIntensity={0.55} roughness={0.35} metalness={0.2} />
        </mesh>
        <mesh position={[0, 1.38, 0]} raycast={() => null}>
          <sphereGeometry args={[0.16, 20, 20]} />
          <meshStandardMaterial color="#d9fff0" emissive={MINT} emissiveIntensity={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.62, 0]} raycast={() => null}>
          <capsuleGeometry args={[0.235, 0.66, 4, 16]} />
          <meshBasicMaterial color={MINT} transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      {sim.position && (
      <FadeLabel position={[0, 2.0, 0]} fadeStart={60} fadeEnd={100} zIndex={6}>
        <span
          className="rounded-full border border-amber/40 bg-ink-950/85 font-semibold text-amber backdrop-blur"
          style={{ padding: "2px 8px", fontSize: 10.5, whiteSpace: "nowrap", letterSpacing: "0.02em" }}
        >
          Simulierte Position
        </span>
      </FadeLabel>
      )}
    </group>
  );
}
