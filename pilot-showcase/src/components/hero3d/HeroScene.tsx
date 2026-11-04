import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { useMediaQuery } from "../../lib/useMediaQuery";
import type { SceneState } from "./StoreParts";
import { Beacons, Floor, ProductBeam, ProductBlock, RouteRibbon, Shelves, Shopper, AMBER, makeSceneState, useRouteCurve } from "./StoreParts";
import { hasFinePointer, useInView } from "./gate";
import { PRODUCT } from "./storeLayout";
import { CAMERA_KEYS, LOOP, clamp01, phasesAt, sampleKeys, smoothstep } from "./timeline";

const QUERY = "Hafermilch";

/** Drives time, camera, scroll/mouse parallax and the wrapper fade. Runs before the other parts. */
function Director({ state, wrap, onFrame }: { state: SceneState; wrap: React.RefObject<HTMLDivElement | null>; onFrame: () => void }) {
  const { camera, size } = useThree();
  const t = useRef(0);
  const mouse = useRef({ x: 0, y: 0, cx: 0, cy: 0 });
  const first = useRef(true);
  const look = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const aspect = size.width / Math.max(1, size.height);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = aspect < 0.8 ? 52 : aspect < 1.3 ? 44 : 38;
    cam.near = 0.3;
    cam.far = 120;
    // Move the scene to the right (desktop, text on the left) or up (mobile, text below).
    if (aspect >= 1.15) cam.setViewOffset(size.width, size.height, -size.width * 0.16, 0, size.width, size.height);
    else cam.setViewOffset(size.width, size.height, 0, size.height * 0.17, size.width, size.height);
    cam.updateProjectionMatrix();
    return () => cam.clearViewOffset();
  }, [camera, size.width, size.height, aspect]);

  useEffect(() => {
    if (!hasFinePointer()) return;
    const onMove = (e: PointerEvent) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    t.current += dt;
    // test/debug hook: pin the loop time (used by screenshot scripts, harmless in production)
    const pinned = (window as unknown as { __hero3dT?: number }).__hero3dT;
    if (typeof pinned === "number") t.current = pinned;
    state.time += dt;
    Object.assign(state, phasesAt(t.current % LOOP));
    if (first.current) {
      first.current = false;
      onFrame();
    }
    const s = sampleKeys(CAMERA_KEYS, t.current % LOOP);
    const k = aspect < 0.8 ? 1.5 : aspect < 1.3 ? 1.2 : 1;
    look.set(s.look[0], s.look[1], s.look[2]);
    pos.set(s.pos[0], s.pos[1], s.pos[2]);
    pos.sub(look).multiplyScalar(k).add(look);

    // scroll: tilt down + pull up while the hero scrolls away
    const p = clamp01(window.scrollY / Math.max(1, window.innerHeight * 0.9));
    const m = mouse.current;
    m.cx += (m.x - m.cx) * 0.05;
    m.cy += (m.y - m.cy) * 0.05;
    pos.x += m.cx * 0.9;
    pos.y += -m.cy * 0.45 + p * 9;
    pos.z += p * 5;
    look.y -= p * 1.2;
    const dbg = (window as unknown as { __hero3dCam?: number[] }).__hero3dCam;
    if (dbg) {
      pos.set(dbg[0]!, dbg[1]!, dbg[2]!);
      look.set(dbg[3]!, dbg[4]!, dbg[5]!);
    }
    camera.position.copy(pos);
    camera.lookAt(look);

    const el = wrap.current;
    if (el) {
      const scrollFade = 1 - smoothstep(0.15, 0.95, p);
      el.style.opacity = String(scrollFade);
    }
  });
  return null;
}

/** The 3D search card ("Hafermilch · Regal 4 · Meter 2") that pops up above the shelf. */
function SearchMoment({ state }: { state: SceneState }) {
  const card = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const line = useRef<THREE.Mesh>(null);
  const lineMat = useRef<THREE.MeshBasicMaterial>(null);
  const lastN = useRef(-1);
  useFrame(() => {
    const c = state.card;
    if (card.current) {
      card.current.style.opacity = String(Math.min(1, c * 1.4));
      card.current.style.transform = `translateY(${(1 - c) * 18}px) scale(${0.82 + 0.18 * c})`;
      card.current.style.visibility = c < 0.01 ? "hidden" : "visible";
    }
    const n = Math.ceil(state.typing * QUERY.length);
    if (text.current && n !== lastN.current) {
      lastN.current = n;
      text.current.textContent = QUERY.slice(0, n);
    }
    if (result.current) {
      const r = smoothstep(0.85, 1, state.typing);
      result.current.style.opacity = String(r);
      result.current.style.transform = `translateY(${(1 - r) * 6}px)`;
    }
    if (line.current && lineMat.current) {
      line.current.scale.y = Math.max(0.001, Math.min(1, c));
      lineMat.current.opacity = 0.7 * Math.min(1, c);
    }
  });
  return (
    <group position={[PRODUCT[0], 0, PRODUCT[2] + 0.02]}>
      <mesh ref={line} position={[0, 1.2, 0]}>
        <boxGeometry args={[0.025, 1.6, 0.025]} />
        <meshBasicMaterial ref={lineMat} color={AMBER} transparent opacity={0} toneMapped={false} />
      </mesh>
      <Html position={[0, 3.6, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
        <div
          ref={card}
          className="w-[15.5rem] overflow-hidden rounded-2xl bg-ink-900/85 text-left shadow-[0_24px_60px_-12px_rgb(0_0_0/0.7)] ring-1 ring-inset ring-white/12 backdrop-blur-xl"
          style={{ opacity: 0, visibility: "hidden", transformOrigin: "50% 100%" }}
        >
          <div className="flex items-center gap-2.5 px-3.5 pb-2.5 pt-3">
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-mint" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="min-h-[1.2em] text-[15px] font-medium tracking-tight text-white">
              <span ref={text} />
              <span className="ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-mint" />
            </span>
          </div>
          <div ref={result} className="flex items-center gap-3 border-t border-white/10 bg-white/[0.04] px-3.5 py-2.5" style={{ opacity: 0 }}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber/15 ring-1 ring-inset ring-amber/40">
              <span className="size-2.5 rounded-full bg-amber shadow-[0_0_10px_2px_rgb(232_184_109/0.7)]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight text-white">Hafermilch</span>
              <span className="mt-0.5 block text-[11.5px] leading-tight text-ink-200">Regal 4 · Meter 2</span>
            </span>
          </div>
        </div>
      </Html>
    </group>
  );
}

function World({ state, mobile }: { state: SceneState; mobile: boolean }) {
  const curve = useRouteCurve();
  return (
    <>
      <fog attach="fog" args={["#050c10", 44, 90]} />
      <hemisphereLight args={["#a8e0ec", "#06141a", 0.85]} />
      <directionalLight color="#d8ecff" intensity={1.5} position={[-9, 15, 11]} />
      <pointLight color="#63E6B4" intensity={60} distance={22} decay={2} position={[-2, 5.5, 2]} />
      <pointLight color="#8CC8FF" intensity={40} distance={20} decay={2} position={[9, 5, -5]} />
      <Floor low={mobile} />
      <Shelves density={mobile ? 0.55 : 1} />
      <Beacons state={state} />
      <ProductBlock state={state} />
      <RouteRibbon curve={curve} state={state} segments={mobile ? 160 : 260} />
      <ProductBeam state={state} />
      <Shopper curve={curve} state={state} />
      <SearchMoment state={state} />
    </>
  );
}

/** Full-bleed cinematic store scene. Default export so it can be React.lazy-loaded. */
export default function HeroScene({ onReady }: { onReady?: () => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, "50px");
  const mobile = useMediaQuery("(max-width: 1023px)");
  const state = useMemo(() => makeSceneState(), []);
  const shown = useRef(false);
  const [ready, setReady] = useState(false);

  const onFrame = () => {
    if (shown.current) return;
    shown.current = true;
    requestAnimationFrame(() => {
      setReady(true);
      onReady?.();
    });
  };

  return (
    <div ref={wrap} data-testid="hero-canvas" aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute inset-0 transition-opacity duration-[1100ms] ease-out" style={{ opacity: ready ? 1 : 0 }} data-ready={ready}>
      <Canvas
        dpr={mobile ? [1, 1.5] : [1, 2]}
        frameloop={inView ? "always" : "never"}
        gl={{ antialias: !mobile, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 34, position: [15, 12.5, 21], near: 0.3, far: 120 }}
        style={{ pointerEvents: "none" }}
      >
        <Director state={state} wrap={wrap} onFrame={onFrame} />
        <World state={state} mobile={mobile} />
      </Canvas>
      </div>
    </div>
  );
}
