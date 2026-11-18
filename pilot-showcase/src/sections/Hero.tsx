import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, ListChecks, Play, Route, Search } from "lucide-react";
import { Button, Container, Eyebrow } from "../components/ui";
import { HeroPhone } from "../components/ui/HeroPhone";
import { HeroStage, useScene3dEnabled } from "../components/hero3d";
import { startTour } from "../features/tour";

const CAPABILITIES = [
  { icon: Search, label: "Produktsuche" },
  { icon: ListChecks, label: "Einkaufsliste" },
  { icon: Route, label: "Route durch den Markt" }
];

/** First impression: what Indooro does for an operator, in one glance. */
export function Hero() {
  const reduce = useReducedMotion();
  const enabled3d = useScene3dEnabled();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const use3d = enabled3d && !failed;
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 28 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay: 0.1 + i * 0.09, ease: [0.16, 1, 0.3, 1] as const }
        };

  return (
    <section id="top" aria-labelledby="hero-title" className="on-dark relative isolate flex min-h-[100svh] items-end overflow-hidden bg-ink-950 pb-8 pt-24 sm:pb-12 sm:pt-28 text-ink-100 lg:items-center lg:pb-20 lg:pt-32">
      {/* atmosphere: glows, fine grid, grain */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-40 -top-40 size-[44rem] rounded-full bg-[radial-gradient(closest-side,rgb(99_230_180/0.16),transparent)]" />
        <div className="absolute -bottom-60 -left-40 size-[40rem] rounded-full bg-[radial-gradient(closest-side,rgb(39_185_171/0.14),transparent)]" />
        <div className="bg-grid-dark mask-radial absolute inset-0 opacity-90" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" />
      </div>
      {use3d ? (
        <>
          <div className="absolute inset-0 -z-[5]">
            <HeroStage onReady={() => setReady(true)} onError={() => setFailed(true)} />
          </div>
          {/* legibility scrims: left on desktop, bottom on mobile */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 -z-[4] hidden w-[78%] bg-[linear-gradient(90deg,var(--color-ink-950)_0%,var(--color-ink-950)_52%,rgb(5_12_16/0.88)_72%,transparent_100%)] lg:block" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-[4] h-[66%] bg-gradient-to-t from-ink-950 via-ink-950/92 to-transparent lg:hidden" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-[4] h-28 bg-gradient-to-b from-ink-950/70 to-transparent" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-[4] h-32 bg-gradient-to-b from-transparent to-ink-950" />
          {ready ? (
            <p className="pointer-events-none absolute bottom-7 right-8 z-10 hidden items-center gap-2 rounded-full bg-ink-900/70 px-3.5 py-1.5 text-[11.5px] font-medium text-ink-200 ring-1 ring-inset ring-white/10 backdrop-blur lg:flex">
              <span aria-hidden className="size-1.5 rounded-full bg-mint" />
              Simulation · Fiktiver Demomarkt
            </p>
          ) : null}
        </>
      ) : null}
      <div aria-hidden className="grain pointer-events-none absolute inset-0 -z-10" />

      <Container className="grid items-center gap-14 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <motion.div {...rise(0)}>
            <Eyebrow onDark>Pilotprojekt · HTL Leonding</Eyebrow>
          </motion.div>

          <motion.h1 id="hero-title" {...rise(1)} className="display mt-6 text-[2.3rem] text-white sm:text-6xl lg:text-7xl">
            Jedes Produkt.
            <span className="block bg-gradient-to-r from-mint via-mint-soft to-teal bg-clip-text text-transparent">Auf direktem Weg.</span>
          </motion.h1>

          <motion.p {...rise(2)} className="text-pretty mt-4 max-w-xl text-[15px] leading-relaxed text-ink-200 sm:mt-6 sm:text-xl">
            <strong className="font-semibold text-white">Indooro führt Ihre Kundinnen und Kunden direkt zum Produkt.</strong> Per Produktsuche, Einkaufsliste und Route durch den Markt – eingerichtet vom Markt selbst, ohne Entwickler.
          </motion.p>

          <motion.ul {...rise(3)} className="mt-6 hidden flex-wrap gap-2 sm:flex" aria-label="Funktionen">
            {CAPABILITIES.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3.5 py-1.5 text-[13px] font-medium text-ink-100 ring-1 ring-inset ring-white/10">
                <Icon className="size-3.5 text-mint" aria-hidden />
                {label}
              </li>
            ))}
          </motion.ul>

          <motion.div {...rise(4)} className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-8 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <Button size="lg" variant="primary" className="col-span-2" data-testid="hero-cta-tour" onClick={() => startTour()} icon={<Play className="size-4" fill="currentColor" />}>
              Geführte Tour starten
            </Button>
            <Button href="#demo" size="lg" variant="ghost-dark" className="!px-4" data-testid="hero-cta-demo" icon={<ArrowDown className="size-4" />}>
              Live-Demo starten
            </Button>
            <Button href="#pilot" size="lg" variant="ghost-dark" className="!px-4" data-testid="hero-cta-pilot" icon={<ArrowRight className="size-4" />}>
              Pilotpartner werden
            </Button>
          </motion.div>

          <motion.p {...rise(5)} className="mt-5 flex max-w-xl items-start gap-2.5 text-[12.5px] sm:mt-7 sm:text-[13px] leading-relaxed text-ink-300">
            <span aria-hidden className="relative mt-[0.45rem] flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber/60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-amber" />
            </span>
            <span>Schulprojekt in Entwicklung · Wir suchen einen Testmarkt in Linz / Oberösterreich</span>
          </motion.p>
        </div>

        {/* 2D fallback (loading, no WebGL, reduced motion): the phone mock-up. Hidden once the 3D scene shows. */}
        {!use3d || !ready ? (
          <div className={use3d ? "hidden lg:col-span-5 lg:block" : "lg:col-span-5"}>
            <HeroPhone />
          </div>
        ) : null}
      </Container>
    </section>
  );
}
