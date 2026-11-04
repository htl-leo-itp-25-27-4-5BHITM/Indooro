import { motion, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowRight, ListChecks, Route, Search } from "lucide-react";
import { Button, Container, Eyebrow } from "../components/ui";
import { HeroPhone } from "../components/ui/HeroPhone";

const CAPABILITIES = [
  { icon: Search, label: "Produktsuche" },
  { icon: ListChecks, label: "Einkaufsliste" },
  { icon: Route, label: "Route durch den Markt" }
];

/** First impression: what Indooro does for an operator, in one glance. */
export function Hero() {
  const reduce = useReducedMotion();
  const rise = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 28 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay: 0.1 + i * 0.09, ease: [0.16, 1, 0.3, 1] as const }
        };

  return (
    <section id="top" aria-labelledby="hero-title" className="on-dark relative isolate flex min-h-[100svh] items-center overflow-hidden bg-ink-950 pb-16 pt-28 text-ink-100 lg:pb-20 lg:pt-32">
      {/* atmosphere: glows, fine grid, grain */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -right-40 -top-40 size-[44rem] rounded-full bg-[radial-gradient(closest-side,rgb(99_230_180/0.16),transparent)]" />
        <div className="absolute -bottom-60 -left-40 size-[40rem] rounded-full bg-[radial-gradient(closest-side,rgb(39_185_171/0.14),transparent)]" />
        <div className="bg-grid-dark mask-radial absolute inset-0 opacity-90" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-ink-950" />
      </div>
      <div aria-hidden className="grain pointer-events-none absolute inset-0 -z-10" />

      <Container className="grid items-center gap-14 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <motion.div {...rise(0)}>
            <Eyebrow onDark>Pilotprojekt · HTL Leonding</Eyebrow>
          </motion.div>

          <motion.h1 id="hero-title" {...rise(1)} className="display mt-6 text-[2.75rem] text-white sm:text-6xl lg:text-7xl ">
            Jedes Produkt.
            <span className="block bg-gradient-to-r from-mint via-mint-soft to-teal bg-clip-text text-transparent">Auf direktem Weg.</span>
          </motion.h1>

          <motion.p {...rise(2)} className="text-pretty mt-6 max-w-xl text-lg leading-relaxed text-ink-200 sm:text-xl">
            <strong className="font-semibold text-white">Indooro führt Ihre Kundinnen und Kunden direkt zum Produkt.</strong> Per Produktsuche, Einkaufsliste und Route durch den Markt – eingerichtet vom Markt selbst, ohne Entwickler.
          </motion.p>

          <motion.ul {...rise(3)} className="mt-6 flex flex-wrap gap-2" aria-label="Funktionen">
            {CAPABILITIES.map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3.5 py-1.5 text-[13px] font-medium text-ink-100 ring-1 ring-inset ring-white/10">
                <Icon className="size-3.5 text-mint" aria-hidden />
                {label}
              </li>
            ))}
          </motion.ul>

          <motion.div {...rise(4)} className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button href="#demo" size="lg" variant="primary" data-testid="hero-cta-demo" icon={<ArrowDown className="size-4" />}>
              Live-Demo starten
            </Button>
            <Button href="#pilot" size="lg" variant="ghost-dark" data-testid="hero-cta-pilot" icon={<ArrowRight className="size-4" />}>
              Pilotpartner werden
            </Button>
          </motion.div>

          <motion.p {...rise(5)} className="mt-7 flex max-w-xl items-start gap-2.5 text-[13px] leading-relaxed text-ink-300">
            <span aria-hidden className="relative mt-[0.45rem] flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber/60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-amber" />
            </span>
            <span>Schulprojekt in Entwicklung · Wir suchen einen Testmarkt in Linz / Oberösterreich</span>
          </motion.p>
        </div>

        <div className="lg:col-span-5">
          <HeroPhone />
        </div>
      </Container>
    </section>
  );
}
