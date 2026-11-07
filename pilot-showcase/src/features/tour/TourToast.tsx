import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { tourStore, useTour } from "./store";

const KEY = "indooro-pilot-tour-hint";

function seen(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
function remember() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

/** First-visit hint: appears 6 s after the demo section comes into view. Dismissible and remembered. */
export function TourToast() {
  const { active } = useTour();
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (seen()) return;
    const demo = document.getElementById("demo");
    if (!demo) return;
    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!timer) timer = window.setTimeout(() => setVisible(true), 6000);
        } else if (timer && !visible) {
          window.clearTimeout(timer);
          timer = 0;
        }
      },
      { threshold: 0.15 }
    );
    io.observe(demo);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [visible]);

  useEffect(() => {
    if (active && visible) {
      setVisible(false);
      remember();
    }
  }, [active, visible]);

  const dismiss = () => {
    remember();
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && !active ? (
        <motion.div
          key="toast"
          role="status"
          data-testid="tour-toast"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="on-dark fixed bottom-20 right-4 z-[50] flex max-w-[20rem] items-start gap-3 rounded-2xl bg-ink-950/92 p-4 text-white shadow-[0_18px_40px_-12px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.12)] backdrop-blur-xl sm:bottom-24 sm:right-6"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold">Neu hier?</p>
            <p className="mt-0.5 text-[13.5px] leading-snug text-ink-200">Starten Sie die geführte Tour.</p>
            <button
              type="button"
              data-testid="tour-toast-start"
              onClick={() => {
                dismiss();
                tourStore.start(0);
              }}
              className="mt-3 inline-flex min-h-10 items-center rounded-full bg-mint px-4 text-[13.5px] font-semibold text-ink-950 hover:bg-mint-soft"
            >
              Tour starten
            </button>
          </div>
          <button type="button" aria-label="Hinweis schließen" onClick={dismiss} className="-mr-1.5 -mt-1.5 grid size-10 shrink-0 place-items-center rounded-full text-ink-300 hover:bg-white/10 hover:text-white">
            <X className="size-4" aria-hidden />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
