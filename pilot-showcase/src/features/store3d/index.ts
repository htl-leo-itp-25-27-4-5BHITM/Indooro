import { lazy } from "react";

export type { Store3DViewProps } from "./types";
/** Lazy so three.js only loads when the 3D view is shown. */
export const Store3DView = lazy(() => import("./Store3DView"));

/** True if the browser can create a WebGL context. */
export function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
