import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createCtx, resolveTarget, TourAborted } from "./actions";
import { approach, clipToViewport, inflate, placeCard, scrollTargetFor } from "./geometry";
import type { Rect } from "./geometry";
import { STEPS, restoreAfterTour } from "./steps";
import type { TourStep } from "./steps";
import { tourStore, useTour } from "./store";
import { TourCard } from "./TourCard";

const PAD = 10;
const RADIUS = 18;
const MOBILE_MAX = 640;
const NAV_H = 72;

const isEditable = (t: EventTarget | null) => {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
};

/** Mounts the overlay only while the tour runs. Rendered once in App. */
export function TourOverlay() {
  const { active } = useTour();
  return createPortal(<AnimatePresence>{active ? <TourStage key="stage" /> : null}</AnimatePresence>, document.body);
}

function TourStage() {
  const { index, presentation } = useTour();
  const reduce = !!useReducedMotion();
  const step = STEPS[index];
  const maskId = useId();
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const cutRef = useRef<SVGRectElement>(null);
  const ringRef = useRef<SVGRectElement>(null);
  const stepRef = useRef<TourStep>(step);
  stepRef.current = step;
  const presRef = useRef(presentation);
  presRef.current = presentation;

  // Focus management: move focus into the card, give it back afterwards.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raf = requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(raf);
      restoreAfterTour();
      const d = document.documentElement;
      delete d.dataset.tourPresentation;
      if (previous && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const d = document.documentElement;
    if (presentation) d.dataset.tourPresentation = "1";
    else delete d.dataset.tourPresentation;
  }, [presentation]);

  // Keyboard: arrows and Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        tourStore.stop();
        return;
      }
      if (isEditable(e.target)) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        tourStore.next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        tourStore.prev();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /** Smoothly scrolls the current target into the free area (above the mobile sheet). */
  const scrollToTarget = useCallback(
    (s: TourStep) => {
      const el = resolveTarget(s.target);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const mobile = window.innerWidth < MOBILE_MAX;
      const cardH = mobile ? (cardRef.current?.offsetHeight ?? 260) + 24 : 16;
      const freeTop = presRef.current ? 24 : NAV_H;
      const freeBottom = vh - cardH;
      const rect: Rect = { x: r.left, y: r.top, w: r.width, h: r.height };
      const inside = rect.y >= freeTop + 12 && rect.y + rect.h <= freeBottom - 12;
      if (inside) return;
      const top = scrollTargetFor(rect, window.scrollY, freeTop, freeBottom);
      window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    },
    [reduce]
  );

  // Run the step script (idempotent), then settle the scroll position.
  useEffect(() => {
    const ac = new AbortController();
    const ctx = createCtx(ac.signal, reduce);
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        scrollToTarget(step);
        await step.onEnter?.(ctx);
        if (cancelled) return;
        await ctx.sleep(80);
        scrollToTarget(step);
      } catch (e) {
        if (!(e instanceof TourAborted)) console.warn("[tour] step failed", step.id, e);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [step, reduce, scrollToTarget]);

  // Optional auto-advance (unused by the default script, supported by the step contract).
  useEffect(() => {
    if (!step.autoAdvanceMs) return;
    const t = window.setTimeout(tourStore.next, step.autoAdvanceMs);
    return () => window.clearTimeout(t);
  }, [step]);

  // Animation loop: eased spotlight + card position, follows scroll and resize.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const cur = { x: window.innerWidth / 2, y: window.innerHeight / 2, w: 0, h: 0, on: 0 };
    const cardPos = { x: 0, y: 0, init: false };
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(64, now - last);
      last = now;
      const vp = { w: window.innerWidth, h: window.innerHeight };
      const s = stepRef.current;
      const el = resolveTarget(s.target);
      let goal: Rect | null = null;
      if (el) {
        const r = el.getBoundingClientRect();
        goal = clipToViewport(inflate({ x: r.left, y: r.top, w: r.width, h: r.height }, PAD), vp);
      }
      const hl = reduce ? 0 : 80;
      if (goal) {
        if (cur.on < 0.02) {
          cur.x = goal.x;
          cur.y = goal.y;
          cur.w = goal.w;
          cur.h = goal.h;
        }
        cur.x = approach(cur.x, goal.x, dt, hl);
        cur.y = approach(cur.y, goal.y, dt, hl);
        cur.w = approach(cur.w, goal.w, dt, hl);
        cur.h = approach(cur.h, goal.h, dt, hl);
        cur.on = approach(cur.on, 1, dt, reduce ? 0 : 120);
      } else {
        cur.on = approach(cur.on, 0, dt, reduce ? 0 : 120);
      }
      const cut = cutRef.current;
      const ring = ringRef.current;
      if (cut && ring) {
        for (const n of [cut, ring]) {
          n.setAttribute("x", String(cur.x));
          n.setAttribute("y", String(cur.y));
          n.setAttribute("width", String(Math.max(0, cur.w)));
          n.setAttribute("height", String(Math.max(0, cur.h)));
        }
        cut.setAttribute("fill-opacity", cur.on.toFixed(3));
        ring.setAttribute("stroke-opacity", (cur.on * 0.75).toFixed(3));
      }
      const card = cardRef.current;
      if (card) {
        if (vp.w < MOBILE_MAX) {
          card.style.transform = "none";
        } else {
          const size = { w: card.offsetWidth, h: card.offsetHeight };
          const p = placeCard(goal, size, vp, s.placement, { topInset: presRef.current ? 16 : NAV_H });
          if (!cardPos.init || reduce) {
            cardPos.x = p.x;
            cardPos.y = p.y;
            cardPos.init = true;
          } else {
            cardPos.x = approach(cardPos.x, p.x, dt, 110);
            cardPos.y = approach(cardPos.y, p.y, dt, 110);
          }
          card.style.transform = `translate3d(${cardPos.x.toFixed(1)}px, ${cardPos.y.toFixed(1)}px, 0)`;
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  const onCta = useCallback((href: string) => {
    tourStore.stop();
    const el = document.getElementById(href.replace(/^#/, ""));
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (history.replaceState) history.replaceState(null, "", href);
  }, []);

  return (
    <motion.div
      data-testid="tour-overlay"
      data-step={step.id}
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="pointer-events-none fixed inset-0 z-[70]"
    >
      <svg aria-hidden className="absolute inset-0 size-full">
        <defs>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="white" />
            <rect ref={cutRef} rx={RADIUS} fill="black" fillOpacity={0} />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#050c10" fillOpacity={0.66} mask={`url(#${maskId})`} />
        <rect ref={ringRef} rx={RADIUS} fill="none" stroke="#63e6b4" strokeWidth={1.5} strokeOpacity={0} />
      </svg>
      <TourCard
        ref={cardRef}
        step={step}
        index={index}
        busy={busy}
        presentation={presentation}
        reduce={reduce}
        onNext={tourStore.next}
        onPrev={tourStore.prev}
        onClose={tourStore.stop}
        onGoto={tourStore.goto}
        onTogglePresentation={tourStore.togglePresentation}
        onCta={onCta}
      />
    </motion.div>
  );
}
