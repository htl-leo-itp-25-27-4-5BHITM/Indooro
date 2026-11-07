/** Scroll-driven maths for the exploded "So funktioniert's" illustration. p is 0..1 over the 4 steps. */
import { clamp01, easeOutCubic, smoothstep } from "./timeline";

export const STEP_COUNT = 4;

/** Index of the step the scroll position is in. */
export function activeStep(p: number): number {
  return Math.min(STEP_COUNT - 1, Math.max(0, Math.floor(clamp01(p) * STEP_COUNT)));
}

/** 0 = layers stacked tightly, 1 = fully exploded. Opens at the start, closes slightly at the end ("assemble"). */
export function explodeAmount(p: number): number {
  const open = easeOutCubic(clamp01(p / 0.18));
  const close = smoothstep(0.9, 1, p) * 0.35;
  return open - close;
}

/** Visibility 0..1 of layer k (0 = floor plan, always there). Layer k appears when step k starts. */
export function layerVisibility(p: number, k: number): number {
  if (k === 0) return 1;
  const at = k / STEP_COUNT;
  return smoothstep(at - 0.07, at + 0.02, p);
}

/** Opacity of layer k: full when active, dimmed once another step is active, 0 while not yet visible. */
export function layerOpacity(p: number, k: number): number {
  const vis = layerVisibility(p, k);
  const active = activeStep(p) === k;
  return vis * (active ? 1 : 0.42);
}

export function layerY(k: number, explode: number): number {
  return k * (0.9 + 3.1 * explode);
}
