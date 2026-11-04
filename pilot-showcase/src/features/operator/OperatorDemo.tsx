import { useEffect, useReducer } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Lock, Pause, Play, RotateCcw } from "lucide-react";
import { Tag } from "../../components/ui/Tag";
import { ACCEPTANCE_CRITERIA, OPERATOR_STEPS, SIMULATION_BANNER } from "../../content/operator";
import { autoplayAction, canNext, createFlow, currentReport, flowReducer, maxReachable, STEP_COUNT, type FlowState } from "./operatorFlow";
import { StageBeacons, StageCheck, StageFix, StageLayout, StageMarket, StageProducts, StageReady, STATUS_STYLE } from "./Stages";

const STAGES = [StageMarket, StageLayout, StageBeacons, StageProducts, StageCheck, StageFix, StageReady];

function akFor(step1: number) {
  return ACCEPTANCE_CRITERIA.filter((a) => a.steps.includes(step1));
}

/** Verzögerung bis zur nächsten Autoplay-Aktion, abgestimmt auf die Animation des Schritts. */
function autoplayDelay(s: FlowState): number {
  if (!s.created) return 1400;
  if (s.step === 1) return 4300;
  if (s.step === 2) return 3600;
  if (s.step === 4 && !s.checked) return 4200;
  if (s.step === 5) return 1700;
  if (s.step === 6) return 1000;
  return 2200;
}

export function OperatorDemo() {
  const [state, dispatch] = useReducer(flowReducer, undefined, createFlow);
  const reduce = useReducedMotion();
  const report = currentReport(state);
  const reachable = maxReachable(state);
  const step1 = state.step + 1;
  const copy = OPERATOR_STEPS[state.step];
  const Stage = STAGES[state.step];
  const statusKey = state.checked ? report.status : "NONE";
  const statusText = state.checked ? report.label : "Noch nicht geprüft";

  useEffect(() => {
    if (!state.autoplay) return;
    const action = autoplayAction(state);
    if (!action) {
      dispatch({ type: "setAutoplay", on: false });
      return;
    }
    const id = window.setTimeout(() => dispatch(action), autoplayDelay(state));
    return () => window.clearTimeout(id);
  }, [state]);

  const atEnd = state.step === STEP_COUNT - 1;

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-[0_1px_0_rgba(15,31,23,0.04),0_24px_60px_-24px_rgba(15,31,23,0.22)]" data-testid="operator-demo">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber/40 bg-amber/15 px-4 py-3 sm:px-6">
        <Tag kind="simulation">Simulation</Tag>
        <p className="text-[13.5px] leading-snug text-[#5c4210]">{SIMULATION_BANNER}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[272px_minmax(0,1fr)]">
        {/* Stepper */}
        <nav aria-label="Schritte der Einrichtung" className="border-b border-line bg-paper/60 lg:border-b-0 lg:border-r">
          <ol className="flex snap-x gap-1 overflow-x-auto p-3 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-4">
            {OPERATOR_STEPS.map((s, i) => {
              const n = i + 1;
              const active = i === state.step;
              const done = i < state.step || (i < reachable && !active);
              const locked = i > reachable;
              return (
                <li key={s.title} className="shrink-0 snap-start lg:shrink">
                  <button
                    type="button"
                    data-testid={`operator-step-${n}`}
                    aria-current={active ? "step" : undefined}
                    disabled={locked}
                    onClick={() => dispatch({ type: "goto", step: i })}
                    className={`group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${active ? "bg-white shadow-sm ring-1 ring-line" : "hover:bg-white/70"} ${locked ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <span className={`grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ring-1 ring-inset ${active ? "bg-ink-900 text-white ring-ink-900" : done ? "bg-ok/20 text-[#13744a] ring-ok/40" : "text-muted ring-line"}`}>
                      {done && !active ? <Check className="size-3.5" aria-hidden /> : locked ? <Lock className="size-3" aria-hidden /> : n}
                    </span>
                    <span className="min-w-0">
                      <span className={`block whitespace-nowrap text-[14px] font-medium lg:whitespace-normal ${active ? "text-text" : "text-muted"}`}>{s.title}</span>
                      <span className="mt-0.5 hidden gap-1 lg:flex">
                        {akFor(n).map((a) => (
                          <span key={a.id} className="rounded bg-accent/10 px-1.5 text-[10.5px] font-semibold tracking-wide text-accent">
                            {a.label}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Stage */}
        <div className="flex min-w-0 flex-col p-4 sm:p-6 lg:p-8">
          <div className="h-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={1} aria-valuemax={STEP_COUNT} aria-valuenow={step1} aria-label="Fortschritt der Simulation">
            <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${(step1 / STEP_COUNT) * 100}%` }} transition={{ duration: reduce ? 0 : 0.6, ease: [0.16, 1, 0.3, 1] }} />
          </div>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                Schritt {step1} von {STEP_COUNT}
              </p>
              <h3 className="mt-1 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-text">{copy.title}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {akFor(step1).map((a) => (
                <span key={a.id} title={a.text} className="rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent ring-1 ring-inset ring-accent/20">
                  {a.label}
                </span>
              ))}
              <span data-testid="operator-status" data-status={statusKey} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold ring-1 ring-inset ${STATUS_STYLE[statusKey]}`}>
                <span aria-hidden className="size-2 rounded-full bg-current" />
                {statusText}
              </span>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{copy.intro}</p>

          <div className="mt-6 min-h-[320px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={state.step}
                initial={reduce ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <Stage state={state} dispatch={dispatch} />
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mt-6 flex flex-wrap items-start gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
            <Tag kind="umgesetzt">Im echten System umgesetzt</Tag>
            <div className="min-w-0 flex-1 basis-60">
              <p className="text-[14px] font-semibold text-text">{copy.realFeature}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{copy.realNote}</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button type="button" data-testid="operator-prev" onClick={() => dispatch({ type: "prev" })} disabled={state.step === 0} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium text-text transition hover:bg-paper disabled:opacity-40">
              <ArrowLeft className="size-4" aria-hidden /> Zurück
            </button>
            <button type="button" data-testid="operator-next" onClick={() => dispatch({ type: "next" })} disabled={!canNext(state)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-[14px] font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40">
              Weiter <ArrowRight className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              data-testid="operator-autoplay"
              aria-pressed={state.autoplay}
              onClick={() => (atEnd && !state.autoplay ? dispatch({ type: "reset" }) : dispatch({ type: "setAutoplay", on: !state.autoplay }))}
              className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-[14px] font-medium text-text transition hover:bg-paper"
            >
              {state.autoplay ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {state.autoplay ? "Automatisch abspielen anhalten" : "Automatisch abspielen"}
            </button>
            <button type="button" data-testid="operator-reset" onClick={() => dispatch({ type: "reset" })} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[13px] font-medium text-muted transition hover:text-text" aria-label="Simulation zurücksetzen">
              <RotateCcw className="size-4" aria-hidden /> Zurücksetzen
            </button>
          </div>
          {!canNext(state) && !atEnd ? <p className="mt-3 text-[12.5px] text-muted">{gateHint(state)}</p> : null}
        </div>
      </div>
    </div>
  );
}

function gateHint(s: FlowState): string {
  switch (s.step) {
    case 0:
      return "Legen Sie zuerst den Markt an, um fortzufahren.";
    case 3:
      return "Übernehmen Sie die Datei, um fortzufahren.";
    case 4:
      return "Starten Sie die Prüfung, um fortzufahren.";
    case 5:
      return "Beheben Sie die blockierenden Befunde, um fortzufahren.";
    default:
      return "";
  }
}
