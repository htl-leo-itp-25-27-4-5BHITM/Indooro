import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { DEG, clamp, dampFactor, easeOutExpo, followPose, introPose, type Pose3 } from "./camera";
import type { ShopperPose } from "./Shopper3D";

interface RigProps {
  home: Pose3;
  width: number;
  depth: number;
  /** changes → intro fly-in (first appearance / market switch) */
  marketKey: string;
  reduce: boolean;
  compact: boolean;
  following: boolean;
  /** user wished to follow (button state); used to decide whether to fly home when the sim ends */
  followWanted: boolean;
  shopper: MutableRefObject<ShopperPose>;
  /** increments on "Übersicht" */
  overviewNonce: number;
  /** product focus: key + world position */
  focus: { key: string; x: number; z: number } | null;
  /** called when the user starts orbiting while following */
  onUserInteract?(): void;
}

const FOV = 38;

export function CameraRig({ home, width, depth, marketKey, reduce, compact, following, followWanted, shopper, overviewNonce, focus }: RigProps) {
  const { camera, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const homeDist = useMemo(() => new Vector3(...home.position).distanceTo(new Vector3(...home.target)), [home]);

  const anim = useRef<{ from: Pose3; to: Pose3; t0: number; dur: number } | null>(null);
  const clockT = useRef(0);
  const interacting = useRef(false);
  const lastInteract = useRef(-100);
  const userMoved = useRef(false);
  const idleT = useRef(0);
  const prevFollowDesired = useRef(new Vector3());
  const followWasActive = useRef(false);
  const homeRef = useRef(home);
  homeRef.current = home;

  const tmpA = useMemo(() => new Vector3(), []);
  const tmpB = useMemo(() => new Vector3(), []);

  const currentPose = (): Pose3 => {
    const c = controls.current;
    return {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: c ? [c.target.x, c.target.y, c.target.z] : [0, 0, 0]
    };
  };

  const flyTo = (to: Pose3, dur: number) => {
    if (reduce) {
      camera.position.set(...to.position);
      controls.current?.target.set(...to.target);
      controls.current?.update();
      anim.current = null;
      invalidate();
      return;
    }
    anim.current = { from: currentPose(), to, t0: clockT.current, dur };
  };

  // intro fly-in on mount and whenever the market changes
  useEffect(() => {
    const h = homeRef.current;
    userMoved.current = false;
    const start = reduce ? h : introPose(h);
    camera.position.set(...start.position);
    controls.current?.target.set(...start.target);
    controls.current?.update();
    if (!reduce) anim.current = { from: start, to: h, t0: clockT.current, dur: 1.6 };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketKey, reduce]);

  // viewport changed and the user did not move the camera yet → re-frame
  useEffect(() => {
    if (!userMoved.current && !anim.current && !following) {
      camera.position.set(...home.position);
      controls.current?.target.set(...home.target);
      controls.current?.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  // "Übersicht"
  const firstNonce = useRef(overviewNonce);
  useEffect(() => {
    if (firstNonce.current === overviewNonce) return;
    firstNonce.current = overviewNonce;
    userMoved.current = false;
    flyTo(homeRef.current, 1.3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewNonce]);

  // focus on a selected product
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focus) {
      lastFocus.current = null;
      return;
    }
    if (lastFocus.current === focus.key || following) return;
    lastFocus.current = focus.key;
    const c = controls.current;
    if (!c) return;
    const target = new Vector3(focus.x, 1.0, focus.z);
    const off = camera.position.clone().sub(c.target);
    const dist = clamp(off.length() * 0.7, 9, Math.max(9, homeDist * 0.7));
    off.normalize();
    off.y = Math.max(off.y, 0.55);
    off.normalize().multiplyScalar(dist);
    userMoved.current = true;
    flyTo({ position: [target.x + off.x, target.y + off.y, target.z + off.z], target: [target.x, target.y, target.z] }, 1.1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key, following]);

  // follow mode ended because the simulation was reset/finished → glide back to the overview
  useEffect(() => {
    if (followWasActive.current && !following && followWanted) {
      userMoved.current = false;
      flyTo(homeRef.current, 1.6);
    }
    followWasActive.current = following;
    if (following) {
      anim.current = null;
      prevFollowDesired.current.set(0, 0, 0);
      prevFollowDesired.current.setScalar(Number.NaN);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following]);

  useFrame((state, rawDt) => {
    const c = controls.current;
    if (!c) return;
    const dt = Math.min(rawDt, 0.05);
    clockT.current = state.clock.elapsedTime;
    const now = clockT.current;

    // scripted animation (intro, overview, focus)
    const a = anim.current;
    if (a) {
      const t = (now - a.t0) / a.dur;
      const k = easeOutExpo(Math.min(1, t));
      camera.position.set(a.from.position[0] + (a.to.position[0] - a.from.position[0]) * k, a.from.position[1] + (a.to.position[1] - a.from.position[1]) * k, a.from.position[2] + (a.to.position[2] - a.from.position[2]) * k);
      c.target.set(a.from.target[0] + (a.to.target[0] - a.from.target[0]) * k, a.from.target[1] + (a.to.target[1] - a.from.target[1]) * k, a.from.target[2] + (a.to.target[2] - a.from.target[2]) * k);
      if (t >= 1) anim.current = null;
      c.enabled = false;
      lastInteract.current = now - 3;
      return;
    }
    c.enabled = true;

    const grace = interacting.current || now - lastInteract.current < 2.5;

    if (following && shopper.current.active) {
      const sp = shopper.current;
      const pose = followPose({ x: sp.x, z: sp.z }, (sp.heading * 180) / Math.PI, compact ? 12.5 : 11, 46, 2.0);
      tmpA.set(...pose.target);
      if (Number.isNaN(prevFollowDesired.current.x)) prevFollowDesired.current.copy(tmpA);
      if (grace) {
        // user is looking around: only translate with the walker, keep their orbit
        tmpB.copy(tmpA).sub(prevFollowDesired.current);
        c.target.add(tmpB);
        camera.position.add(tmpB);
      } else {
        const kp = reduce ? 1 : dampFactor(2.4, dt);
        const kt = reduce ? 1 : dampFactor(4, dt);
        c.target.lerp(tmpA, kt);
        tmpB.set(...pose.position);
        camera.position.lerp(tmpB, kp);
      }
      prevFollowDesired.current.copy(tmpA);
      userMoved.current = true;
    } else if (!reduce && !grace && !userMoved.current) {
      // idle drift: gentle pendulum around the store centre, never a full turn
      idleT.current += dt;
      const w = (Math.PI * 2) / 30;
      const dAz = 7 * DEG * w * Math.cos(idleT.current * w) * dt;
      tmpA.copy(camera.position).sub(c.target);
      const cos = Math.cos(dAz);
      const sin = Math.sin(dAz);
      const x = tmpA.x * cos + tmpA.z * sin;
      const z = -tmpA.x * sin + tmpA.z * cos;
      camera.position.set(c.target.x + x, camera.position.y, c.target.z + z);
    }

    // keep the target inside the store footprint (pan limit)
    const px = clamp(c.target.x, -width / 2 - 2, width / 2 + 2);
    const pz = clamp(c.target.z, -depth / 2 - 2, depth / 2 + 2);
    const py = clamp(c.target.y, 0, 3);
    if (px !== c.target.x || pz !== c.target.z || py !== c.target.y) {
      camera.position.x += px - c.target.x;
      camera.position.z += pz - c.target.z;
      camera.position.y += py - c.target.y;
      c.target.set(px, py, pz);
    }
  });

  return (
    <>
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.6}
        zoomSpeed={0.7}
        panSpeed={0.8}
        minDistance={4}
        maxDistance={homeDist * 1.45}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 - 0.1}
        screenSpacePanning={false}
        onStart={() => {
          interacting.current = true;
          userMoved.current = true;
          lastInteract.current = clockT.current;
        }}
        onEnd={() => {
          interacting.current = false;
          lastInteract.current = clockT.current;
        }}
      />
    </>
  );
}

export const FOV_DEG = FOV;
