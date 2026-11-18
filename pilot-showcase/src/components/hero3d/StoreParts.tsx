/**
 * Procedural building blocks shared by the hero and "So funktioniert's" scenes.
 * Everything is generated in code (no remote assets): floor texture, shelves, beacons, route ribbon, beam.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { BEACONS, PRODUCT, PRODUCT_AISLE, ROUTE_POINTS, SHELVES, SHELF_DEPTH, SHELF_HEIGHT, STORE_D, STORE_W, TINTS, rand } from "./storeLayout";
import { type Phases, clamp01 } from "./timeline";

export const MINT = "#63E6B4";
export const AMBER = "#E8B86D";
/** Materials whose opacity is animated by their own part; layer fading must leave them alone. */
export const NOFADE = { noFade: true };

/** Mutable state shared between the director and the parts (read every frame, never React state). */
export interface SceneState extends Phases {
  /** ambient seconds, keeps running for beacon pulses */
  time: number;
}

export function makeSceneState(): SceneState {
  return { card: 0, typing: 0, route: 0, beam: 0, ripple: 0, puck: 0, fade: 1, intro: 1, time: 0 };
}

/* ---------------------------------------------------------------- floor */

const FLOOR_W = 46;
const FLOOR_D = 32;

function drawFloor(): HTMLCanvasElement {
  const S = 44; // px per metre
  const c = document.createElement("canvas");
  c.width = FLOOR_W * S;
  c.height = FLOOR_D * S;
  const g = c.getContext("2d")!;
  const px = (x: number) => (x + FLOOR_W / 2) * S;
  const pz = (z: number) => (z + FLOOR_D / 2) * S;

  // store slab
  g.fillStyle = "rgba(17,36,43,0.92)";
  g.fillRect(px(-STORE_W / 2), pz(-STORE_D / 2), STORE_W * S, STORE_D * S);
  // aisle lanes (slightly lighter)
  g.fillStyle = "rgba(41,69,77,0.18)";
  for (const z of [-5.1, -1.7, 1.7, 5.1, 8.5]) g.fillRect(px(-STORE_W / 2), pz(z - 1.0), STORE_W * S, 2.0 * S);
  // 1 m grid
  g.lineWidth = 1;
  for (let x = -FLOOR_W / 2; x <= FLOOR_W / 2; x++) {
    g.strokeStyle = x % 5 === 0 ? "rgba(99,230,180,0.13)" : "rgba(99,230,180,0.055)";
    g.beginPath();
    g.moveTo(px(x), 0);
    g.lineTo(px(x), c.height);
    g.stroke();
  }
  for (let z = -FLOOR_D / 2; z <= FLOOR_D / 2; z++) {
    g.strokeStyle = z % 5 === 0 ? "rgba(99,230,180,0.13)" : "rgba(99,230,180,0.055)";
    g.beginPath();
    g.moveTo(0, pz(z));
    g.lineTo(c.width, pz(z));
    g.stroke();
  }
  // soft contact shadows under the shelves
  g.save();
  g.shadowColor = "rgba(0,0,0,0.85)";
  g.shadowBlur = 0.55 * S;
  g.fillStyle = "rgba(0,0,0,0.7)";
  for (const s of SHELVES) g.fillRect(px(s.x - s.length / 2), pz(s.z - SHELF_DEPTH / 2), s.length * S, SHELF_DEPTH * S);
  g.restore();
  // store outline + entrance marker
  g.strokeStyle = "rgba(214,224,224,0.22)";
  g.lineWidth = 2;
  g.strokeRect(px(-STORE_W / 2), pz(-STORE_D / 2), STORE_W * S, STORE_D * S);
  g.fillStyle = "rgba(99,230,180,0.85)";
  g.fillRect(px(-STORE_W / 2) - 2, pz(7.7), 5, 2.0 * S);
  // fade the whole thing out towards the edges
  g.globalCompositeOperation = "destination-in";
  const rg = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.18, c.width / 2, c.height / 2, c.height * 0.5);
  rg.addColorStop(0, "rgba(0,0,0,1)");
  rg.addColorStop(0.62, "rgba(0,0,0,0.9)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

export function Floor({ low = false }: { low?: boolean }) {
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(drawFloor());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = low ? 2 : 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  }, [low]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[FLOOR_W, FLOOR_D]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/* -------------------------------------------------------------- shelves */

const LEVELS = [0.42, 0.84, 1.26] as const;

export function Shelves({ density = 1, withProducts = true }: { density?: number; withProducts?: boolean }) {
  const products = useRef<THREE.InstancedMesh>(null);
  const strips = useRef<THREE.InstancedMesh>(null);

  const { productData, stripData } = useMemo(() => {
    const pd: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const sd: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const o = new THREE.Object3D();
    const step = 0.5 / density;
    let seed = 1;
    for (const s of SHELVES) {
      const tint = new THREE.Color(s.tint);
      for (const side of [1, -1]) {
        LEVELS.forEach((y) => {
          // thin light strip along the front of each level
          o.position.set(s.x, y - 0.22, s.z + side * (SHELF_DEPTH / 2 + 0.005));
          o.scale.set(s.length - 0.3, 0.035, 0.012);
          o.rotation.set(0, 0, 0);
          o.updateMatrix();
          sd.push({ m: o.matrix.clone(), c: tint.clone().multiplyScalar(0.55) });
          if (!withProducts) return;
          const n = Math.floor((s.length - 0.5) / step);
          for (let i = 0; i < n; i++) {
            seed++;
            if (rand(seed) < 0.07) continue; // a few gaps look real
            const h = 0.22 + rand(seed + 11) * 0.14;
            const w = 0.3 + rand(seed + 5) * 0.12;
            o.position.set(s.x - s.length / 2 + 0.35 + i * step, y - 0.2 + h / 2, s.z + side * (SHELF_DEPTH / 2 + 0.06));
            o.scale.set(w, h, 0.22);
            o.updateMatrix();
            const base = rand(seed + 23) < 0.6 ? tint : new THREE.Color(TINTS[Math.floor(rand(seed + 31) * TINTS.length)]);
            const col = base.clone().multiplyScalar(0.5 + rand(seed + 41) * 0.5);
            pd.push({ m: o.matrix.clone(), c: col });
          }
        });
      }
    }
    return { productData: pd, stripData: sd };
  }, [density, withProducts]);

  useLayoutEffect(() => {
    const fill = (mesh: THREE.InstancedMesh | null, data: { m: THREE.Matrix4; c: THREE.Color }[]) => {
      if (!mesh) return;
      data.forEach((d, i) => {
        mesh.setMatrixAt(i, d.m);
        mesh.setColorAt(i, d.c);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    fill(products.current, productData);
    fill(strips.current, stripData);
  }, [productData, stripData]);

  return (
    <group>
      {SHELVES.map((s) => (
        <group key={s.id} position={[s.x, 0, s.z]}>
          <RoundedBox args={[s.length, SHELF_HEIGHT, SHELF_DEPTH]} radius={0.1} smoothness={3} position={[0, SHELF_HEIGHT / 2, 0]}>
            <meshStandardMaterial color="#1b3641" roughness={0.42} metalness={0.25} />
          </RoundedBox>
          {/* emissive category edges along the top (front and back) */}
          {[1, -1].map((side) => (
            <mesh key={side} position={[0, SHELF_HEIGHT + 0.012, side * (SHELF_DEPTH / 2 - 0.07)]}>
              <boxGeometry args={[s.length - 0.2, 0.035, 0.07]} />
              <meshBasicMaterial color={s.tint} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[s.length + 0.04, 0.05, SHELF_DEPTH + 0.04]} />
            <meshBasicMaterial color={s.tint} transparent opacity={0.5} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <instancedMesh ref={strips} args={[undefined, undefined, stripData.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {withProducts ? (
        <instancedMesh ref={products} args={[undefined, undefined, productData.length]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.55} metalness={0.05} />
        </instancedMesh>
      ) : null}
    </group>
  );
}

/* -------------------------------------------------------------- beacons */

export function Beacons({ y = 1.95, state, maxRadius = 3.4, gain }: { y?: number; state: SceneState; maxRadius?: number; gain?: () => number }) {
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const items = useMemo(() => BEACONS.flatMap(([x, z], i) => [0, 1].map((k) => ({ x, z, offset: i * 0.173 + k * 0.5 }))), []);
  useFrame(() => {
    items.forEach((it, i) => {
      const m = rings.current[i];
      if (!m) return;
      const ph = (state.time * 0.32 + it.offset) % 1;
      const r = 0.25 + ph * maxRadius;
      m.scale.set(r, r, r);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - ph, 1.7) * 0.55 * (gain ? gain() : 1);
    });
  });
  return (
    <group>
      {BEACONS.map(([x, z]) => (
        <group key={`${x}_${z}`} position={[x, y, z]}>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.17, 0.2, 0.08, 20]} />
            <meshStandardMaterial color="#d6e0e0" roughness={0.3} metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.095, 0]}>
            <sphereGeometry args={[0.065, 12, 8]} />
            <meshBasicMaterial color={MINT} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {items.map((it, i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          position={[it.x, y + 0.04, it.z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.96, 1, 64]} />
          <meshBasicMaterial color={MINT} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} userData={NOFADE} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------------------------------------------------------- route */

const RIBBON_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const RIBBON_FRAG = /* glsl */ `
uniform float uProgress; uniform vec3 uColor; uniform float uAlpha; uniform float uTime; uniform float uSoft; uniform float uCurtain;
varying vec2 vUv;
void main(){
  if (vUv.x > uProgress) discard;
  float head = smoothstep(0.07, 0.0, uProgress - vUv.x);
  float flow = 0.5 + 0.5 * sin(vUv.x * 120.0 - uTime * 5.0);
  vec3 c = uColor * (0.85 + 0.35 * flow) + vec3(1.0) * head * 0.7;
  float a = uAlpha * mix(0.9 + 0.1 * flow, 1.0, head);
  // soft tube: fade towards the silhouette
  float edge = abs(vUv.y - 0.5) * 2.0;
  a *= mix(1.0, 1.0 - smoothstep(0.2, 1.0, edge), uSoft);
  if (uCurtain > 0.5) { a = uAlpha * pow(1.0 - vUv.y, 1.5) * (0.55 + 0.25 * flow); c = uColor; }
  gl_FragColor = vec4(c, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function useRouteCurve() {
  return useMemo(() => new THREE.CatmullRomCurve3(ROUTE_POINTS.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, "centripetal"), []);
}

function ribbonMaterial(color: string, soft: number, alpha: number, curtain = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: curtain ? THREE.DoubleSide : THREE.FrontSide,
    userData: NOFADE,
    uniforms: {
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: alpha },
      uTime: { value: 0 },
      uSoft: { value: soft },
      uCurtain: { value: curtain }
    }
  });
}

/** Self-drawing mint light ribbon with a wider glow tube underneath. */
export function RouteRibbon({ curve, state, tube = 0.13, glow = 0.3, segments = 260, progress, alpha }: { curve: THREE.CatmullRomCurve3; state: SceneState; tube?: number; glow?: number; segments?: number; progress?: (s: SceneState) => number; alpha?: () => number }) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, segments, tube, 10, false), [curve, segments, tube]);
  const geoGlow = useMemo(() => new THREE.TubeGeometry(curve, segments, glow, 10, false), [curve, segments, glow]);
  const core = useMemo(() => ribbonMaterial(MINT, 0.35, 1), []);
  const halo = useMemo(() => ribbonMaterial(MINT, 1, 0.2), []);
  const wall = useMemo(() => ribbonMaterial(MINT, 0, 0.6, 1), []);
  /** A low vertical light curtain under the route: keeps it readable from shallow camera angles. */
  const curtain = useMemo(() => {
    const n = segments;
    const pts = curve.getSpacedPoints(n);
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    pts.forEach((p, i) => {
      pos.push(p.x, 0.04, p.z, p.x, 1.05, p.z);
      uv.push(i / n, 0, i / n, 1);
      if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, [curve, segments]);
  useEffect(
    () => () => {
      geo.dispose();
      geoGlow.dispose();
      core.dispose();
      halo.dispose();
      wall.dispose();
      curtain.dispose();
    },
    [geo, geoGlow, core, halo, wall, curtain]
  );
  useFrame(() => {
    const p = progress ? progress(state) : state.route;
    const a = alpha ? alpha() : progress ? 1 : state.fade;
    for (const m of [core, halo, wall]) {
      m.uniforms.uProgress!.value = p;
      m.uniforms.uTime!.value = state.time;
    }
    core.uniforms.uAlpha!.value = a;
    halo.uniforms.uAlpha!.value = 0.12 * a;
    wall.uniforms.uAlpha!.value = 0.6 * a;
  });
  return (
    <group>
      <mesh geometry={curtain} material={wall} frustumCulled={false} renderOrder={2} />
      <mesh geometry={geoGlow} material={halo} frustumCulled={false} renderOrder={3} />
      <mesh geometry={geo} material={core} frustumCulled={false} renderOrder={4} />
    </group>
  );
}

/* ---------------------------------------------------- beam + ripple pin */

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha;
varying vec2 vUv;
void main(){
  float a = pow(1.0 - vUv.y, 1.35) * uAlpha;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function ProductBeam({ state, height = 7, scale = 1, visible, gain }: { state: SceneState; height?: number; scale?: number; visible?: (s: SceneState) => number; gain?: () => number }) {
  const beam = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const pulse = useRef<THREE.Mesh>(null);
  const outer = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.14, 0.42, height, 28, 1, true);
    g.translate(0, height / 2, 0);
    return g;
  }, [height]);
  const inner = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.04, 0.1, height, 20, 1, true);
    g.translate(0, height / 2, 0);
    return g;
  }, [height]);
  const mats = useMemo(() => {
    const mk = (alpha: number) =>
      new THREE.ShaderMaterial({
        vertexShader: BEAM_VERT,
        fragmentShader: BEAM_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        userData: NOFADE,
        uniforms: { uColor: { value: new THREE.Color(AMBER) }, uAlpha: { value: alpha } }
      });
    return { outer: mk(0.42), inner: mk(0.9) };
  }, []);
  useEffect(
    () => () => {
      outer.dispose();
      inner.dispose();
      mats.outer.dispose();
      mats.inner.dispose();
    },
    [outer, inner, mats]
  );
  useFrame(() => {
    const v = visible ? visible(state) : state.beam;
    const f = gain ? gain() : visible ? 1 : state.fade;
    if (beam.current) beam.current.scale.set(1, Math.max(0.001, v), 1);
    mats.outer.uniforms.uAlpha!.value = 0.2 * f;
    mats.inner.uniforms.uAlpha!.value = 0.6 * f;
    const rp = visible ? (state.time * 0.4) % 1 : state.ripple;
    rings.current.forEach((m, i) => {
      if (!m) return;
      const ph = visible ? (rp + i * 0.5) % 1 : (rp * 2.6 + i * 0.5) % 1;
      const r = 0.3 + ph * 3.3;
      m.scale.set(r, r, r);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - ph, 1.6) * 0.75 * Math.min(1, v * 2) * f;
    });
    if (pulse.current) {
      const s = 1 + 0.25 * Math.sin(state.time * 5);
      pulse.current.scale.setScalar(s * Math.min(1, v * 3));
    }
  });
  return (
    <group position={[PRODUCT_AISLE[0], 0.04, PRODUCT_AISLE[2] - 0.2]} scale={scale}>
      <group ref={beam}>
        <mesh geometry={outer} material={mats.outer} renderOrder={5} />
        <mesh geometry={inner} material={mats.inner} renderOrder={6} />
      </group>
      <mesh ref={pulse} position={[0, 0.06, 0]}>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshBasicMaterial color={AMBER} toneMapped={false} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh
          key={i}
          ref={(el) => {
            rings.current[i] = el;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.03, 0]}
        >
          <ringGeometry args={[0.94, 1, 64]} />
          <meshBasicMaterial color={AMBER} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} userData={NOFADE} />
        </mesh>
      ))}
    </group>
  );
}

/** The product on the shelf: an amber, softly glowing block. */
export function ProductBlock({ state }: { state: SceneState }) {
  const m = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (m.current) m.current.color.set(AMBER).multiplyScalar(0.55 + 0.45 * state.beam * state.fade + 0.12 * Math.sin(state.time * 4));
  });
  return (
    <mesh position={[PRODUCT[0], PRODUCT[1], PRODUCT[2] + 0.01]}>
      <boxGeometry args={[0.36, 0.4, 0.24]} />
      <meshBasicMaterial ref={m} color={AMBER} toneMapped={false} />
    </mesh>
  );
}

/* -------------------------------------------------------------- shopper */

/** Shopper puck (simulated position): glowing disc, halo and heading cone, moving along the curve. */
export function Shopper({ curve, state, progress, opacity, label = true }: { curve: THREE.CatmullRomCurve3; state: SceneState; progress?: (s: SceneState) => number; opacity?: (s: SceneState) => number; label?: boolean }) {
  const tag = useRef<HTMLDivElement>(null);
  const group = useRef<THREE.Group>(null);
  const heading = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  const light = useRef<THREE.PointLight>(null);
  const p = useMemo(() => new THREE.Vector3(), []);
  const tan = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const u = clamp01(progress ? progress(state) : state.puck);
    curve.getPointAt(u, p);
    curve.getTangentAt(Math.min(u + 0.002, 1), tan);
    if (group.current) group.current.position.copy(p);
    if (heading.current) heading.current.rotation.y = Math.atan2(tan.x, tan.z);
    const a = opacity ? opacity(state) : state.fade * state.intro;
    mats.current.forEach((m, i) => (m.opacity = a * (i === 2 ? 0.55 : 1)));
    if (halo.current) {
      const ph = (state.time * 0.9) % 1;
      halo.current.scale.setScalar(0.4 + ph * 1.3);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = (1 - ph) * 0.6 * a;
    }
    if (light.current) light.current.intensity = 5 * a;
    if (tag.current) tag.current.style.opacity = String(a);
  });
  const reg = (i: number) => (m: THREE.MeshBasicMaterial | null) => {
    if (m) mats.current[i] = m;
  };
  return (
    <group ref={group}>
      <group ref={heading}>
        <mesh position={[0, 0.07, 0]}>
          <cylinderGeometry args={[0.34, 0.38, 0.12, 32]} />
          <meshBasicMaterial ref={reg(0)} color={MINT} transparent toneMapped={false} userData={NOFADE} />
        </mesh>
        <mesh position={[0, 0.14, 0]}>
          <cylinderGeometry args={[0.17, 0.17, 0.05, 24]} />
          <meshBasicMaterial ref={reg(1)} color="#ffffff" transparent toneMapped={false} userData={NOFADE} />
        </mesh>
        <mesh position={[0, 0.1, 0.62]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.2, 0.42, 4]} />
          <meshBasicMaterial ref={reg(2)} color={MINT} transparent toneMapped={false} userData={NOFADE} />
        </mesh>
      </group>
      <mesh ref={halo} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial color={MINT} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} userData={NOFADE} />
      </mesh>
      <pointLight ref={light} color={MINT} position={[0, 0.9, 0]} intensity={5} distance={6} decay={2} />
      {label ? (
        <Html position={[0, 1.15, 0]} center zIndexRange={[12, 0]} style={{ pointerEvents: "none" }}>
          <div
            ref={tag}
            className="whitespace-nowrap rounded-full bg-ink-900/80 px-2.5 py-1 text-[10.5px] font-medium tracking-wide text-mint ring-1 ring-inset ring-mint/30 backdrop-blur"
            style={{ opacity: 0, transform: "translateY(-6px)" }}
          >
            Simulierte Position
          </div>
        </Html>
      ) : null}
    </group>
  );
}
