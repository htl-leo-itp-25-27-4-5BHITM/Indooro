import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Play } from "lucide-react";
import { tourStore, useTour } from "./store";

/** Floating "Geführte Tour" pill, visible once the hero is scrolled past and while no tour runs. */
export function TourLauncher() {
  const { active, presentation } = useTour();
  const reduce = useReducedMotion();
  const [past, setPast] = useState(false);

  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const show = past && !active && !presentation;
  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          key="launcher"
          type="button"
          data-testid="tour-launcher"
          onClick={() => tourStore.start(0)}
          initial={reduce ? false : { opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, transition: { duration: 0.2 } }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="on-dark fixed bottom-4 right-4 z-[50] inline-flex min-h-12 items-center gap-2.5 rounded-full bg-ink-950/90 py-2 pl-2 pr-5 text-[14px] font-semibold text-white shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.12)] backdrop-blur-xl transition-colors hover:bg-ink-900 sm:bottom-6 sm:right-6"
        >
          <span className="grid size-8 place-items-center rounded-full bg-mint text-ink-950">
            <Play className="size-3.5 translate-x-px fill-current" aria-hidden />
          </span>
          Geführte Tour
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
