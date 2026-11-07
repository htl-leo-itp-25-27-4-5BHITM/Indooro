import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { StoreDemo } from "../features/store/StoreDemo";
import { useDemoHandle } from "../features/store/demoBridge";
import { NextChapter } from "../features/tour/NextChapter";

const STEPS = [
  { n: 1, label: "Produkt suchen", hint: "z. B. „Paradeiser“" },
  { n: 2, label: "Liste füllen", hint: "mit „+ Liste“" },
  { n: 3, label: "Route starten", hint: "im Reiter Navigation" }
];

/** Live progress of the three hints, driven by what visitors actually do in the demo. */
function useHintProgress(): [boolean, boolean, boolean] {
  const demo = useDemoHandle();
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    const onInput = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLInputElement && t.dataset.testid === "search-input" && t.value.trim()) setSearched(true);
    };
    document.addEventListener("input", onInput);
    return () => document.removeEventListener("input", onInput);
  }, []);
  const hasList = (demo?.items.length ?? 0) > 0;
  return [searched || hasList || !!demo?.selectedProductId, hasList, !!demo && demo.sim.state !== "idle"];
}

/** Interactive hint chips. Separate component so that demo-handle updates do not re-render the demo itself. */
function DemoHints({ reveal }: { reveal: Record<string, unknown> }) {
  const demo = useDemoHandle();
  const done = useHintProgress();
  const act = (i: number) => {
    if (i === 0) {
      demo?.setTab("suche");
      window.setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="search-input"]')?.focus(), 120);
    } else if (i === 1) demo?.setTab("suche");
    else demo?.setTab("navigation");
  };
  return (
        <motion.ol {...reveal} className="mt-8 flex flex-wrap gap-2.5" aria-label="So probieren Sie die Demo aus">
          {STEPS.map((s, i) => (
            <li key={s.n}>
              <button
                type="button"
                data-testid={`demo-hint-${s.n}`}
                data-done={done[i] ? "true" : "false"}
                onClick={() => act(i)}
                className={`inline-flex min-h-10 items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-4 text-[13px] ring-1 transition-colors duration-500 ${
                  done[i] ? "bg-mint/10 ring-mint/40" : "bg-white/5 ring-white/10 hover:bg-white/8"
                }`}
              >
                <span className={`grid size-6 place-items-center rounded-full text-xs font-bold transition-colors duration-500 ${done[i] ? "bg-mint text-ink-950" : "bg-white/12 text-white"}`}>
                  {done[i] ? <Check className="size-3.5" strokeWidth={3} aria-label="erledigt" /> : s.n}
                </span>
                <span className="font-semibold text-white">{s.label}</span>
                <span className="hidden text-ink-300 sm:inline">{s.hint}</span>
              </button>
            </li>
          ))}
        </motion.ol>
  );
}

export function DemoSection() {
  const reduce = useReducedMotion();
  const reveal = (delay = 0) => ({
    initial: reduce ? false : { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] as const }
  });

  return (
    <section id="demo" aria-labelledby="demo-title" className="relative isolate overflow-hidden bg-ink-950 py-20 text-white sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(39,185,171,0.16),transparent_70%)]"
      />
      <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <motion.p {...reveal()} className="text-[13px] font-semibold uppercase tracking-[0.14em] text-mint">
            Interaktive Demo
          </motion.p>
          <motion.h2 {...reveal(0.06)} id="demo-title" className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">
            Probieren Sie es selbst.
          </motion.h2>
          <motion.p {...reveal(0.12)} className="mt-4 text-base leading-relaxed text-ink-200 sm:text-lg">
            Ein fiktiver Markt, ein echter Ablauf: Produkt suchen, Einkaufsliste füllen, den Weg durch den Markt ansehen. Alles läuft in Ihrem Browser.
          </motion.p>
        </div>

        <DemoHints reveal={reveal(0.18)} />

        <motion.div {...reveal(0.1)} className="mt-8 sm:mt-10">
          <StoreDemo />
        </motion.div>

        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-ink-300">
          Hinweis: Markt, Sortiment und Preise sind frei erfunden. Die Position auf dem Plan wird in dieser Demo simuliert; es handelt sich nicht um eine
          Messung mit Bluetooth-Beacons.
        </p>
        <NextChapter href="#so-funktionierts" tone="dark" title="So funktioniert’s: Ortung, Suche und Route" text="Was hinter der Demo steckt, in drei Schritten erklärt." />
      </div>
    </section>
  );
}
