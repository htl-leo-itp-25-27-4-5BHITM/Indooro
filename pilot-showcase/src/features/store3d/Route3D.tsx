import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { motion } from "motion/react";
import { AdditiveBlending, NormalBlending, CatmullRomCurve3, Color, DoubleSide, ShaderMaterial, TubeGeometry, Vector3 } from "three";
import type { PlannedRoute } from "../../domain/types";
import { buildRouteModel, routeSignature } from "../navigation/routeModel";
import type { NavigationSimulation } from "../navigation";
import { ROUTE_HEIGHT, routeToWorld, tubeSegments } from "./curve";
import { dampFactor, easeOutExpo } from "./camera";
import { toWorld, type GridSize } from "./transforms";
import { AMBER, MINT } from "./theme";
import { FadeLabel } from "./FadeLabel";

const DRAW_SECONDS = 1.2;

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uDraw;
  uniform float uProgress;
  uniform float uTime;
  uniform float uLen;
  uniform float uGlow;
  uniform vec3 uColor;
  uniform vec3 uDim;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float d = vUv.x;
    if (d > uDraw) discard;
    float done = smoothstep(uProgress + 0.003, uProgress - 0.003, d);
    // light pulses travelling in walking direction (period ~3.4 m)
    float wave = 0.5 + 0.5 * sin((d * uLen - uTime * 2.6) * 1.848);
    float flow = pow(wave, 4.0);
    float rim = pow(clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), uGlow > 0.5 ? 1.6 : 0.6);
    vec3 live = uColor * (0.85 + 0.9 * flow);
    vec3 col = mix(live, uDim, done);
    float lead = exp(-(uDraw - d) * uLen * 0.9) * step(uDraw, 0.999);
    col += lead * 0.9;
    float a;
    if (uGlow > 0.5) {
      a = rim * mix(0.34 + 0.22 * flow, 0.05, done);
    } else {
      a = mix(1.0, 0.38, done);
    }
    gl_FragColor = vec4(col * (uGlow > 0.5 ? 1.0 : 1.0), a);
  }
`;

function makeMaterial(glow: boolean, length: number): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    blending: glow ? AdditiveBlending : NormalBlending,
    side: DoubleSide,
    toneMapped: false,
    uniforms: {
      uDraw: { value: 0 },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uLen: { value: length },
      uGlow: { value: glow ? 1 : 0 },
      uColor: { value: new Color(MINT) },
      uDim: { value: new Color("#3b5a63") }
    }
  });
}

interface RouteProps {
  route: PlannedRoute;
  sim: NavigationSimulation;
  grid: GridSize;
  reduce: boolean;
  compact: boolean;
  stopNames: ReadonlyMap<string, string>;
}

/** Glowing mint route tube that draws itself on, dims behind the walker and carries flowing light pulses. */
export function Route3D({ route, sim, grid, reduce, compact, stopNames }: RouteProps) {
  const sig = routeSignature(route);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => buildRouteModel(route), [sig]);

  const built = useMemo(() => {
    const pts = routeToWorld(model.geometry.points, grid, ROUTE_HEIGHT);
    if (pts.length < 2) return null;
    const curve = new CatmullRomCurve3(
      pts.map((p) => new Vector3(...p)),
      false,
      "centripetal"
    );
    curve.arcLengthDivisions = Math.min(4000, pts.length * 6);
    const segs = tubeSegments(model.length);
    const core = new TubeGeometry(curve, segs, 0.07, 8, false);
    const glow = new TubeGeometry(curve, segs, 0.26, 10, false);
    return { core, glow, coreMat: makeMaterial(false, model.length), glowMat: makeMaterial(true, model.length) };
  }, [model, grid]);

  useEffect(
    () => () => {
      built?.core.dispose();
      built?.glow.dispose();
      built?.coreMat.dispose();
      built?.glowMat.dispose();
    },
    [built]
  );

  const state = useRef({ draw: reduce ? 1 : 0, prog: 0, t0: -1 });
  useEffect(() => {
    state.current.draw = reduce ? 1 : 0;
    state.current.t0 = -1;
  }, [sig, reduce]);

  const progressRef = useRef(sim.progress);
  progressRef.current = sim.state === "idle" ? 0 : sim.progress;

  useFrame(({ clock }, rawDt) => {
    if (!built) return;
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    if (s.t0 < 0) s.t0 = clock.elapsedTime;
    if (!reduce) s.draw = Math.min(1, easeOutExpo((clock.elapsedTime - s.t0) / DRAW_SECONDS));
    s.prog += (progressRef.current - s.prog) * dampFactor(10, dt);
    for (const m of [built.coreMat, built.glowMat]) {
      m.uniforms.uDraw.value = s.draw;
      m.uniforms.uProgress.value = s.prog;
      m.uniforms.uTime.value = reduce ? 0 : clock.elapsedTime;
    }
  });

  const stops = useMemo(
    () =>
      route.order.map((stop, i) => {
        const w = toWorld(stop.cell.x + 0.5, stop.cell.y + 0.5, grid);
        return { id: stop.id, x: w.x, z: w.z, frac: model.length > 0 ? model.stopDistances[i] / model.length : 0 };
      }),
    [route, model, grid]
  );

  const first = route.path[0];
  const last = route.path[route.path.length - 1];
  const startW = first ? toWorld(first.x + 0.5, first.y + 0.5, grid) : null;
  const endW = last ? toWorld(last.x + 0.5, last.y + 0.5, grid) : null;
  const lastStop = stops[stops.length - 1];
  const showEnd = endW && (!lastStop || Math.hypot(endW.x - lastStop.x, endW.z - lastStop.z) > 1.6);

  if (!built) return null;
  return (
    <group>
      <mesh geometry={built.glow} material={built.glowMat} renderOrder={2} raycast={() => null} />
      <mesh geometry={built.core} material={built.coreMat} renderOrder={3} raycast={() => null} />

      {startW && <EndMarker x={startW.x} z={startW.z} label="Start" color={MINT} reduce={reduce} />}
      {showEnd && endW && <EndMarker x={endW.x} z={endW.z} label="Ziel" color={MINT} reduce={reduce} />}

      {stops.map((s, i) => {
        const reached = sim.reachedStopIds.has(s.id);
        const active = i === sim.activeStopIndex && !reached;
        return (
          <group key={s.id + i} position={[s.x, 0, s.z]}>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} raycast={() => null}>
              <ringGeometry args={[0.28, 0.4, 40]} />
              <meshBasicMaterial color={reached ? MINT : active ? AMBER : "#bff5df"} transparent opacity={reached ? 0.55 : 0.9} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0.45, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.012, 0.012, 0.8, 4]} />
              <meshBasicMaterial color={active ? AMBER : MINT} transparent opacity={0.6} toneMapped={false} />
            </mesh>
            <FadeLabel position={[0, 1.0, 0]} fadeStart={44} fadeEnd={80} zIndex={4}>
              <motion.div
                initial={reduce ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: active ? 1.12 : 1, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { delay: 0.25 + s.frac * DRAW_SECONDS, type: "spring", stiffness: 380, damping: 22 }}
                className="flex items-center gap-1.5"
              >
                <span
                  className="grid place-items-center rounded-full border font-bold tabular-nums"
                  style={{
                    width: compact ? 22 : 26,
                    height: compact ? 22 : 26,
                    fontSize: compact ? 11 : 12.5,
                    background: reached ? MINT : "#071117",
                    color: reached ? "#071117" : active ? AMBER : MINT,
                    borderColor: active ? AMBER : MINT,
                    borderWidth: 1.5,
                    boxShadow: active ? `0 0 0 4px ${AMBER}33, 0 6px 16px -4px #000` : "0 6px 16px -4px #000"
                  }}
                  data-testid="store3d-stop"
                  data-reached={reached ? "true" : undefined}
                >
                  {reached ? "✓" : i + 1}
                </span>
                {active && !compact && (
                  <span className="rounded-full border border-white/10 bg-ink-950/85 px-2 py-0.5 text-[11px] font-semibold text-white" style={{ whiteSpace: "nowrap" }}>
                    {stopNames.get(s.id) ?? route.order[i].label}
                  </span>
                )}
              </motion.div>
            </FadeLabel>
          </group>
        );
      })}
    </group>
  );
}

function EndMarker({ x, z, label, color, reduce }: { x: number; z: number; label: string; color: string; reduce: boolean }) {
  return (
    <group position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]} raycast={() => null}>
        <circleGeometry args={[0.22, 28]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} raycast={() => null}>
        <ringGeometry args={[0.38, 0.46, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <FadeLabel position={[0, 0.75, 0]} fadeStart={40} fadeEnd={70}>
        <motion.span
          initial={reduce ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-full border border-white/10 bg-ink-950/80 px-2 py-0.5 text-[10.5px] font-semibold text-mint"
          style={{ display: "inline-block", whiteSpace: "nowrap" }}
        >
          {label}
        </motion.span>
      </FadeLabel>
    </group>
  );
}
