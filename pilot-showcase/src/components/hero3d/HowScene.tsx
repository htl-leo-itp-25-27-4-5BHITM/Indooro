import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { useMediaQuery } from "../../lib/useMediaQuery";
import type { SceneState } from "./StoreParts";
import { Beacons, Floor, MINT, NOFADE, ProductBeam, ProductBlock, RouteRibbon, Shelves, makeSceneState, useRouteCurve } from "./StoreParts";
import { useInView } from "./gate";
import { STEP_COUNT, activeStep, explodeAmount, layerOpacity, layerVisibility, layerY } from "./howLayers";
import { STORE_D, STORE_W } from "./storeLayout";
import { clamp01, lerp, segment, smoothstep } from "./timeline";

const SCALE = 0.5;
const PW = STORE_W * SCALE + 0.8;
const PD = STORE_D * SCALE + 0.6;

const LABELS = ["1  Grundriss", "2  Beacons", "3  Suche", "4  Route"];

interface How {
  p: number;
  e: number;
}

/** Fades every (non-flagged) material below `g` and hides the group when fully transparent. */
function applyOpacity(g: THREE.Object3D, o: number) {
  g.visible = o > 0.004;
  if (!g.visible) return;
  let list = g.userData.fadeMats as { m: THREE.Material; base: number }[] | undefined;
  if (!list) {
    list = [];
    g.traverse((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (m.userData?.noFade) continue;
        m.transparent = true;
        m.needsUpdate = true;
        list!.push({ m, base: m.opacity });
      }
    });
    g.userData.fadeMats = list;
  }
  for (const it of list) it.m.opacity = it.base * o;
}

function Plate({ active }: { active?: boolean }) {
  const outline = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-PW / 2, 0, -PD / 2), new THREE.Vector3(PW / 2, 0, -PD / 2), new THREE.Vector3(PW / 2, 0, PD / 2), new THREE.Vector3(-PW / 2, 0, PD / 2)]);
    return g;
  }, []);
  useEffect(() => () => outline.dispose(), [outline]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[PW, PD]} />
        <meshBasicMaterial color={active ? "#0f2a30" : "#0c1d23"} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
      </mesh>
      <lineLoop geometry={outline}>
        <lineBasicMaterial color={MINT} transparent opacity={0.55} toneMapped={false} />
      </lineLoop>
    </group>
  );
}

function Layer({ k, how, children }: { k: number; how: React.RefObject<How>; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const tag = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const { p, e } = how.current;
    const vis = layerVisibility(p, k);
    const o = layerOpacity(p, k);
    const grp = g.current;
    if (grp) {
      grp.position.y = layerY(k, e) - (1 - vis) * 1.6;
      applyOpacity(grp, o);
    }
    const t = tag.current;
    if (t) {
      const active = activeStep(p) === k;
      t.style.opacity = String(vis * (active ? 1 : 0.55));
      t.style.color = active ? "#63E6B4" : "#9db0b2";
      t.style.boxShadow = active ? "inset 0 0 0 1px rgba(99,230,180,.5)" : "inset 0 0 0 1px rgba(255,255,255,.12)";
    }
  });
  return (
    <group ref={g}>
      {children}
      <Html position={[-PW / 2 + 1.6, 0.15, PD / 2 + 0.4]} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div ref={tag} className="whitespace-nowrap rounded-full bg-ink-900/80 px-2.5 py-1 text-[11px] font-medium tracking-wide backdrop-blur" style={{ opacity: 0 }}>
          {LABELS[k]}
        </div>
      </Html>
    </group>
  );
}

function drawPhone(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 360;
  c.height = 740;
  const g = c.getContext("2d")!;
  const rr = (x: number, y: number, w: number, h: number, r: number) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  };
  g.fillStyle = "#071117";
  g.fillRect(0, 0, 360, 740);
  const glow = g.createRadialGradient(300, 60, 10, 300, 60, 340);
  glow.addColorStop(0, "rgba(99,230,180,0.22)");
  glow.addColorStop(1, "rgba(99,230,180,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, 360, 740);
  g.fillStyle = "#9db0b2";
  g.font = "600 22px Inter, system-ui, sans-serif";
  g.fillText("Fiktiver Demomarkt", 28, 92);
  // search field
  g.fillStyle = "rgba(255,255,255,0.08)";
  rr(24, 118, 312, 64, 20);
  g.fill();
  g.strokeStyle = "rgba(99,230,180,0.6)";
  g.lineWidth = 2;
  rr(24, 118, 312, 64, 20);
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = "600 28px Inter, system-ui, sans-serif";
  g.fillText("Hafermilch", 58, 160);
  // result
  g.fillStyle = "rgba(255,255,255,0.06)";
  rr(24, 212, 312, 96, 22);
  g.fill();
  g.fillStyle = "rgba(232,184,109,0.18)";
  rr(42, 232, 56, 56, 16);
  g.fill();
  g.fillStyle = "#E8B86D";
  g.beginPath();
  g.arc(70, 260, 11, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#ffffff";
  g.font = "600 25px Inter, system-ui, sans-serif";
  g.fillText("Hafermilch", 116, 255);
  g.fillStyle = "#9db0b2";
  g.font = "500 21px Inter, system-ui, sans-serif";
  g.fillText("Regal 4 · Meter 2", 116, 287);
  // button
  g.fillStyle = "#63E6B4";
  rr(24, 330, 312, 70, 35);
  g.fill();
  g.fillStyle = "#050c10";
  g.font = "700 25px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.fillText("Route starten", 180, 374);
  g.textAlign = "left";
  g.fillStyle = "#5a777a";
  g.font = "500 18px Inter, system-ui, sans-serif";
  g.fillText("Simulation", 28, 700);
  return c;
}

function Phone({ state }: { state: SceneState }) {
  const grp = useRef<THREE.Group>(null);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(drawPhone());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame(() => {
    if (!grp.current) return;
    grp.current.rotation.y = -0.35 + Math.sin(state.time * 0.6) * 0.18;
    grp.current.position.y = 1.7 + Math.sin(state.time * 0.9) * 0.1;
  });
  return (
    <group ref={grp} position={[0, 1.7, 0.6]}>
      <RoundedBox args={[1.7, 3.4, 0.16]} radius={0.22} smoothness={4}>
        <meshStandardMaterial color="#10222a" roughness={0.3} metalness={0.7} />
      </RoundedBox>
      <mesh position={[0, 0, 0.085]}>
        <planeGeometry args={[1.54, 3.2]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* soft pad under the floating phone */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.68, 0]}>
        <circleGeometry args={[1.4, 40]} />
        <meshBasicMaterial color={MINT} transparent opacity={0.1} depthWrite={false} toneMapped={false} userData={NOFADE} />
      </mesh>
    </group>
  );
}

function Connectors({ how }: { how: React.RefObject<How> }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const corners: [number, number][] = [
    [-PW / 2, -PD / 2],
    [PW / 2, -PD / 2],
    [PW / 2, PD / 2],
    [-PW / 2, PD / 2]
  ];
  useFrame(() => {
    const { p, e } = how.current;
    const top = layerY(STEP_COUNT - 1, e);
    const vis = layerVisibility(p, STEP_COUNT - 1);
    const h = Math.max(0.001, top * Math.max(vis, layerVisibility(p, 1) * 0.5));
    refs.current.forEach((m) => {
      if (!m) return;
      m.scale.y = h;
      m.position.y = h / 2;
    });
  });
  return (
    <group>
      {corners.map(([x, z], i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={[x, 0, z]}
        >
          <boxGeometry args={[0.02, 1, 0.02]} />
          <meshBasicMaterial color={MINT} transparent opacity={0.22} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Director({ progress, how, state, onFrame }: { progress: { current: number }; how: React.RefObject<How>; state: SceneState; onFrame: () => void }) {
  const { camera, size } = useThree();
  const smooth = useRef(progress.current);
  const first = useRef(true);
  const aspect = size.width / Math.max(1, size.height);
  const look = useMemo(() => new THREE.Vector3(), []);
  useEffect(() => {
    (camera as THREE.PerspectiveCamera).fov = aspect < 0.9 ? 40 : 34;
    camera.updateProjectionMatrix();
  }, [camera, aspect]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.time += dt;
    smooth.current += (clamp01(progress.current) - smooth.current) * Math.min(1, dt * 5);
    const p = smooth.current;
    const e = explodeAmount(p);
    how.current!.p = p;
    how.current!.e = e;
    // route layer drives the shared scene state (ribbon, beam, product highlight)
    state.route = segment(p, 0.76, 0.93);
    state.beam = segment(p, 0.9, 0.99);
    state.fade = 1;
    state.puck = 0;
    if (first.current) {
      first.current = false;
      onFrame();
    }
    const a = lerp(-0.6, 0.5, p);
    const R = aspect < 0.9 ? 36 : aspect < 1.4 ? 29 : 26;
    const cy = layerY(STEP_COUNT - 1, e) * 0.5 + 0.4;
    look.set(0, cy - 0.6, 0);
    camera.position.set(Math.sin(a) * R, cy + 12.5 + 2.5 * smoothstep(0, 0.25, p), Math.cos(a) * R);
    camera.lookAt(look);
  });
  return null;
}

function World({ state, how, mobile }: { state: SceneState; how: React.RefObject<How>; mobile: boolean }) {
  const curve = useRouteCurve();
  const gain = (k: number) => () => layerOpacity(how.current!.p, k);
  return (
    <>
      <hemisphereLight args={["#a8e0ec", "#06141a", 0.9]} />
      <directionalLight color="#d8ecff" intensity={1.5} position={[-8, 16, 10]} />
      <pointLight color="#63E6B4" intensity={50} distance={26} decay={2} position={[0, 8, 4]} />
      <Connectors how={how} />

      <Layer k={0} how={how}>
        <Plate active />
        <group scale={SCALE}>
          <Floor low={mobile} />
          <Shelves density={mobile ? 0.4 : 0.6} />
        </group>
      </Layer>

      <Layer k={1} how={how}>
        <Plate />
        <group scale={SCALE}>
          <Beacons y={1.2} state={state} maxRadius={3.2} gain={gain(1)} />
        </group>
      </Layer>

      <Layer k={2} how={how}>
        <Plate />
        <Phone state={state} />
      </Layer>

      <Layer k={3} how={how}>
        <Plate />
        <group scale={SCALE}>
          <RouteRibbon curve={curve} state={state} segments={mobile ? 140 : 220} tube={0.14} glow={0.42} alpha={gain(3)} />
          <ProductBeam state={state} height={6} gain={gain(3)} />
          <group position={[0, 0.1, 0]}>
            <ProductBlock state={state} />
          </group>
        </group>
      </Layer>
    </>
  );
}

/** Exploded, scroll-driven illustration of the system. Default export so it can be React.lazy-loaded. */
export default function HowScene({ progress, onReady }: { progress: { current: number }; onReady?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, "80px");
  const mobile = useMediaQuery("(max-width: 1023px)");
  const state = useMemo(() => makeSceneState(), []);
  const how = useRef<How>({ p: 0, e: 0 });
  const [ready, setReady] = useState(false);
  const shown = useRef(false);
  const onFrame = () => {
    if (shown.current) return;
    shown.current = true;
    requestAnimationFrame(() => {
      setReady(true);
      onReady?.();
    });
  };
  return (
    <div ref={wrap} data-testid="how-canvas" aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 transition-opacity duration-700 ease-out" style={{ opacity: ready ? 1 : 0 }}>
        <Canvas
          dpr={mobile ? [1, 1.5] : [1, 2]}
          frameloop={inView ? "always" : "never"}
          gl={{ antialias: !mobile, alpha: true, powerPreference: "high-performance" }}
          camera={{ fov: 30, position: [-14, 12, 22], near: 0.3, far: 120 }}
          style={{ pointerEvents: "none" }}
        >
          <Director progress={progress} how={how} state={state} onFrame={onFrame} />
          <World state={state} how={how} mobile={mobile} />
        </Canvas>
      </div>
    </div>
  );
}

