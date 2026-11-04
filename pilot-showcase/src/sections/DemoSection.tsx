import { motion, useReducedMotion } from "motion/react";
import { StoreDemo } from "../features/store/StoreDemo";

const STEPS = [
  { n: 1, label: "Produkt suchen", hint: "z. B. „Paradeiser“" },
  { n: 2, label: "Liste füllen", hint: "mit „+ Liste“" },
  { n: 3, label: "Route starten", hint: "im Reiter Navigation" }
];

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

        <motion.ol {...reveal(0.18)} className="mt-8 flex flex-wrap gap-2.5" aria-label="So probieren Sie die Demo aus">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="inline-flex items-center gap-2.5 rounded-full bg-white/5 py-1.5 pl-1.5 pr-4 text-[13px] ring-1 ring-white/10"
            >
              <span className="grid size-6 place-items-center rounded-full bg-mint text-xs font-bold text-ink-950">{s.n}</span>
              <span className="font-semibold text-white">{s.label}</span>
              <span className="hidden text-ink-300 sm:inline">{s.hint}</span>
            </li>
          ))}
        </motion.ol>

        <motion.div {...reveal(0.1)} className="mt-8 sm:mt-10">
          <StoreDemo />
        </motion.div>

        <p className="mt-6 max-w-3xl text-xs leading-relaxed text-ink-300">
          Hinweis: Markt, Sortiment und Preise sind frei erfunden. Die Position auf dem Plan wird in dieser Demo simuliert; es handelt sich nicht um eine
          Messung mit Bluetooth-Beacons.
        </p>
      </div>
    </section>
  );
}
