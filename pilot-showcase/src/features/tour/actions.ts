import { demoBridge } from "../store/demoBridge";
import type { DemoHandle } from "../store/demoBridge";

/** DOM/demo helpers used by the tour steps. All of them tolerate missing elements. */

export const tid = (id: string) => `[data-testid="${id}"]`;

export class TourAborted extends Error {
  constructor() {
    super("tour step aborted");
  }
}

export interface TourCtx {
  signal: AbortSignal;
  demo(): DemoHandle | null;
  sleep(ms: number): Promise<void>;
  /** Resolves with the first visible match or null after the timeout. */
  waitFor(selector: string, timeoutMs?: number): Promise<HTMLElement | null>;
  click(selector: string): boolean;
  /** Types into an input letter by letter (instantly when `instant`). */
  type(selector: string, text: string, instant?: boolean): Promise<void>;
  reducedMotion: boolean;
}

export function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** First visible element for a selector or a list of fallbacks. */
export function resolveTarget(target: string | readonly string[] | null | undefined): HTMLElement | null {
  if (!target) return null;
  const list = typeof target === "string" ? [target] : target;
  for (const sel of list) {
    let nodes: NodeListOf<Element>;
    try {
      nodes = document.querySelectorAll(sel);
    } catch {
      continue;
    }
    for (const n of Array.from(nodes)) if (n instanceof HTMLElement || n instanceof SVGElement) if (isVisible(n)) return n as HTMLElement;
  }
  return null;
}

/** React ignores `input.value = x`; the native setter plus an input event updates controlled inputs. */
export function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function createCtx(signal: AbortSignal, reducedMotion: boolean): TourCtx {
  const guard = () => {
    if (signal.aborted) throw new TourAborted();
  };
  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new TourAborted());
      const t = window.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        window.clearTimeout(t);
        reject(new TourAborted());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  return {
    signal,
    reducedMotion,
    demo: () => demoBridge.get(),
    sleep,
    async waitFor(selector, timeoutMs = 2500) {
      const end = performance.now() + timeoutMs;
      for (;;) {
        guard();
        const el = resolveTarget(selector);
        if (el) return el;
        if (performance.now() > end) return null;
        await sleep(60);
      }
    },
    click(selector) {
      const el = resolveTarget(selector);
      if (!el) return false;
      el.click();
      return true;
    },
    async type(selector, text, instant = false) {
      const el = await this.waitFor(selector);
      if (!(el instanceof HTMLInputElement)) return;
      if (el.value === text) return;
      if (instant || reducedMotion) {
        setNativeValue(el, text);
        return;
      }
      setNativeValue(el, "");
      for (let i = 1; i <= text.length; i++) {
        await sleep(70);
        setNativeValue(el, text.slice(0, i));
      }
    }
  };
}
