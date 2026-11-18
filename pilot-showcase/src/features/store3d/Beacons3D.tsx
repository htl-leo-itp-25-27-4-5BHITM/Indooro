import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, InstancedMesh, Object3D, RingGeometry } from "three";
import type { LayoutElement } from "../../domain/types";
import { SHELF_TYPES } from "../../data";
import { shelfHeight, toWorld, type GridSize } from "./transforms";
import { MINT } from "./theme";

interface BeaconPos {
  x: number;
  y: number;
  z: number;
  /** 0 = standing on a shelf top, 1 = hanging in an aisle */
  hung: boolean;
}

/** Beacon devices with expanding BLE-style pulse rings (purely illustrative). */
export function Beacons3D({ elements, grid, animate }: { elements: LayoutElement[]; grid: GridSize; animate: boolean }) {
  const beacons = useMemo<BeaconPos[]>(() => {
    const shelves = elements.filter((e) => SHELF_TYPES.includes(e.type));
    return elements
      .filter((e) => e.type === "beacon")
      .map((b) => {
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        const on = shelves.find((s) => cx >= s.x && cx <= s.x + s.width && cy >= s.y && cy <= s.y + s.height);
        const w = toWorld(cx, cy, grid);
        return { x: w.x, z: w.z, y: on ? shelfHeight(on) + 0.12 : 2.5, hung: !on };
      });
  }, [elements, grid]);

  const pucks = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const ringGeo = useMemo(() => new RingGeometry(0.94, 1, 56).rotateX(-Math.PI / 2), []);
  const o = useMemo(() => new Object3D(), []);
  const col = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const m = pucks.current;
    if (!m) return;
    beacons.forEach((b, i) => {
      o.position.set(b.x, b.y, b.z);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [beacons, o]);

  const drawRings = (time: number) => {
    const m = rings.current;
    if (!m) return;
    beacons.forEach((b, i) => {
      for (let p = 0; p < 2; p++) {
        const t = (time / 3.2 + i * 0.137 + p * 0.5) % 1;
        const s = 0.25 + t * 1.9;
        o.position.set(b.x, b.y + 0.01, b.z);
        o.scale.set(s, 1, s);
        o.updateMatrix();
        m.setMatrixAt(i * 2 + p, o.matrix);
        col.set(MINT).multiplyScalar(Math.pow(1 - t, 1.6) * 0.8);
        m.setColorAt(i * 2 + p, col);
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };

  useLayoutEffect(() => {
    drawRings(0.9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beacons]);

  useFrame(({ clock }) => {
    if (animate) drawRings(clock.elapsedTime);
  });

  const stems = useMemo(() => beacons.filter((b) => b.hung), [beacons]);

  return (
    <group>
      <instancedMesh ref={pucks} args={[undefined, undefined, beacons.length]} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[0.16, 0.16, 0.07, 24]} />
        <meshBasicMaterial color={MINT} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[ringGeo, undefined, beacons.length * 2]} raycast={() => null} frustumCulled={false}>
        <meshBasicMaterial color="#ffffff" transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      {stems.map((b, i) => (
        <mesh key={i} position={[b.x, (b.y + 4.4) / 2, b.z]} raycast={() => null}>
          <cylinderGeometry args={[0.012, 0.012, 4.4 - b.y, 4]} />
          <meshBasicMaterial color={MINT} transparent opacity={0.28} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
