import { createContext, useContext, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Vector3 } from "three";

/** Scales label fade distances with the overview distance of the camera (bigger on narrow screens). */
export const LabelScaleContext = createContext(1);
/** DOM container for the labels (stable portal target, avoids drei re-targeting during unmount). */
export const LabelRootContext = createContext<RefObject<HTMLElement | null> | null>(null);

interface FadeLabelProps {
  position: [number, number, number];
  children: ReactNode;
  /** camera distance at which the label is fully visible / fully hidden */
  fadeStart?: number;
  fadeEnd?: number;
  /** Hide completely while the camera is closer than this (declutter in follow mode) */
  nearHide?: number;
  zIndex?: number;
}

/** drei <Html> that fades out with camera distance (updated directly on the DOM node, no re-render). */
export function FadeLabel({ position, children, fadeStart = 36, fadeEnd = 58, nearHide = 0, zIndex = 0 }: FadeLabelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = useContext(LabelScaleContext);
  const portal = useContext(LabelRootContext);
  const v = useMemo(() => new Vector3(...position), [position]);
  useFrame(({ camera }) => {
    const el = ref.current;
    if (!el) return;
    const d = camera.position.distanceTo(v) / scale;
    let o = d <= fadeStart ? 1 : Math.max(0, 1 - (d - fadeStart) / Math.max(0.001, fadeEnd - fadeStart));
    if (nearHide && d < nearHide) o = Math.min(o, d / nearHide);
    el.style.opacity = o.toFixed(2);
    el.style.visibility = o < 0.02 ? "hidden" : "visible";
  });
  return (
    <Html portal={(portal ?? undefined) as RefObject<HTMLElement> | undefined} position={position} center zIndexRange={[20 + zIndex, 0]} style={{ pointerEvents: "none" }}>
      <div ref={ref} style={{ transition: "opacity 120ms linear" }}>
        {children}
      </div>
    </Html>
  );
}
