import { forwardRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, MonitorPlay, X } from "lucide-react";
import { chapterInfo } from "./machine";
import { STEPS } from "./steps";
import type { TourStep } from "./steps";

interface Props {
  step: TourStep;
  index: number;
  busy: boolean;
  presentation: boolean;
  reduce: boolean;
  onNext(): void;
  onPrev(): void;
  onClose(): void;
  onGoto(i: number): void;
  onTogglePresentation(): void;
  onCta(href: string): void;
}

/** Dark glass coach card. Position is driven by the overlay's animation loop (transform), not by React. */
export const TourCard = forwardRef<HTMLDivElement, Props>(function TourCard(
  { step, index, busy, presentation, reduce, onNext, onPrev, onClose, onGoto, onTogglePresentation, onCta },
  ref
) {
  const total = STEPS.length;
  const info = chapterInfo(STEPS, index);
  const last = index === total - 1;
  const btn =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-[background-color,box-shadow,opacity] duration-300 disabled:pointer-events-none disabled:opacity-35";

  return (
    <motion.div
      ref={ref}
      data-testid="tour-card"
      data-step={step.id}
      data-busy={busy ? "true" : "false"}
      role="dialog"
      aria-modal="false"
      aria-label="Geführte Tour"
      tabIndex={-1}
      initial={reduce ? false : { opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={`on-dark pointer-events-auto fixed left-0 top-0 z-[2] overflow-hidden rounded-3xl bg-ink-950/88 text-white shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7),0_0_0_1px_rgb(255_255_255/0.1)] outline-none backdrop-blur-2xl backdrop-saturate-150 max-sm:!inset-x-2 max-sm:!bottom-2 max-sm:!top-auto max-sm:w-auto ${
        presentation ? "w-[480px]" : "w-[380px]"
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-mint/12 blur-3xl" />

      <div className="relative px-5 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-mint">
            <span aria-hidden className={`size-1.5 rounded-full bg-mint ${busy && !reduce ? "animate-pulse" : ""}`} />
            <span>
              {info.number}/{info.total} · {info.chapter}
            </span>
          </p>
          <button
            type="button"
            data-testid="tour-close"
            onClick={onClose}
            aria-label="Tour beenden"
            className="-mr-2 -mt-2 grid size-10 shrink-0 place-items-center rounded-full text-ink-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        </div>

        <div aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.12 } }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 data-testid="tour-title" className={`mt-2 font-semibold leading-tight tracking-[-0.025em] ${presentation ? "text-[1.7rem]" : "text-[1.3rem]"}`}>
                {step.title}
              </h2>
              <p className={`mt-2 leading-relaxed text-ink-200 ${presentation ? "text-[17px]" : "text-[14.5px]"}`}>{step.body}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-4 flex items-center gap-[3px]" role="group" aria-label="Fortschritt der Tour">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onGoto(i)}
              aria-label={`Schritt ${i + 1} von ${total}: ${s.title}`}
              aria-current={i === index ? "step" : undefined}
              className="group/dot flex h-5 min-w-0 flex-1 items-center"
            >
              <span
                className={`block h-[3px] w-full rounded-full transition-[background-color,height] duration-500 group-hover/dot:h-[5px] ${
                  i === index ? "bg-mint" : i < index ? "bg-mint/45" : "bg-white/16"
                }`}
              />
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p data-testid="tour-step" className="text-[12.5px] tabular-nums text-ink-300">
            Schritt {index + 1} von {total}
          </p>
          <button
            type="button"
            data-testid="tour-presentation"
            aria-pressed={presentation}
            onClick={onTogglePresentation}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium transition-colors ${
              presentation ? "bg-mint/15 text-mint" : "text-ink-200 hover:bg-white/8 hover:text-white"
            }`}
          >
            <MonitorPlay className="size-3.5" aria-hidden /> Präsentationsmodus
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button type="button" data-testid="tour-prev" onClick={onPrev} disabled={index === 0} className={`${btn} text-ink-100 ring-1 ring-inset ring-white/14 hover:bg-white/8`}>
            <ArrowLeft className="size-4" aria-hidden /> Zurück
          </button>
          {step.cta ? (
            <button
              type="button"
              data-testid="tour-cta"
              onClick={() => onCta(step.cta!.href)}
              className={`${btn} flex-1 bg-mint text-ink-950 shadow-[0_8px_24px_-8px_rgb(99_230_180/0.6)] hover:bg-mint-soft`}
            >
              {step.cta.label} <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : (
            <button type="button" data-testid="tour-next" onClick={onNext} className={`${btn} flex-1 bg-mint text-ink-950 shadow-[0_8px_24px_-8px_rgb(99_230_180/0.6)] hover:bg-mint-soft`}>
              Weiter <ArrowRight className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {last ? (
          <button type="button" data-testid="tour-finish" onClick={onClose} className="mt-2 w-full rounded-full py-2 text-[13px] font-medium text-ink-200 transition-colors hover:text-white">
            Tour beenden
          </button>
        ) : null}
      </div>
    </motion.div>
  );
});
