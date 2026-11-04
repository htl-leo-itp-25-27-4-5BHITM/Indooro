import { useEffect, useState } from "react";
import type { RefObject } from "react";

/** True if the browser can create a WebGL context. */
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Whether to render a 3D scene at all: needs WebGL and no reduced-motion preference. Decided once. */
export function useScene3dEnabled(): boolean {
  const [enabled] = useState(() => typeof document !== "undefined" && !prefersReducedMotion() && supportsWebGL());
  return enabled;
}

/** Fine pointer with hover (desktop): enables mouse parallax. */
export function hasFinePointer(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Tracks whether `ref` is (nearly) on screen so rendering can pause when it is not. */
export function useInView(ref: RefObject<Element | null>, rootMargin = "100px"): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setInView(e?.isIntersecting ?? true), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

/** True once `ref` has come within `rootMargin` of the viewport (stays true). Used to defer loading three.js. */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin = "600px"): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return near;
}
