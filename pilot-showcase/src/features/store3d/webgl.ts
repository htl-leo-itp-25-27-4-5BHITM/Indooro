/** True if the browser can create a WebGL context (no React, safe to call during render). */
export function supportsWebGLSync(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
