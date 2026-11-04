import { motion, useReducedMotion } from "motion/react";
import { Globe, LayoutDashboard, Radio, Route, ScanSearch, Server, Smartphone, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, Eyebrow, Reveal, Section, Tag } from "../components/ui";

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Store,
    title: "Markt wird digital erfasst",
    text: "Grundriss, Regale und Sortiment legt der Markt im Admin-Bereich selbst an – ohne Entwickler."
  },
  {
    icon: Radio,
    title: "Beacons und QR-Codes",
    text: "Kleine Bluetooth-Sender (BLE) an Regalen oder Decke sollen die Position bestimmen. QR-Codes dienen als Rückfall."
  },
  {
    icon: ScanSearch,
    title: "Kundschaft sucht ein Produkt",
    text: "In der App oder im Browser: Produkt eintippen oder auf die Einkaufsliste setzen."
  },
  {
    icon: Route,
    title: "Route durch den Markt",
    text: "Indooro berechnet den Weg zum Regal, bei Einkaufslisten in sinnvoller Reihenfolge."
  }
];

const SYSTEM: { icon: LucideIcon; title: string; text: string; tech?: string; span: string; dark?: boolean }[] = [
  {
    icon: Smartphone,
    title: "iOS-App",
    text: "Suche, Einkaufsliste und Route auf dem iPhone. Läuft als Pilot-Build auf Teamgeräten, nicht im App Store.",
    tech: "Swift · SwiftUI",
    span: "lg:col-span-7",
    dark: true
  },
  {
    icon: Globe,
    title: "Browser-Kundensuche",
    text: "Produkte im Markt finden, ohne eine App zu installieren.",
    span: "lg:col-span-5"
  },
  {
    icon: LayoutDashboard,
    title: "Admin-Plattform",
    text: "Märkte, Regale, Beacons und Sortiment verwalten, inklusive Prüfung, ob der Markt startklar ist.",
    span: "lg:col-span-5"
  },
  {
    icon: Server,
    title: "Server und Suche",
    text: "Speichert Märkte und Sortiment und sorgt dafür, dass die Produktsuche den richtigen Markt durchsucht.",
    tech: "Quarkus · PostgreSQL · OpenSearch",
    span: "lg:col-span-7",
    dark: true
  }
];

/** Four steps joined by a line that draws on scroll, then a compact system overview. */
export function HowItWorks() {
  const reduce = useReducedMotion();
  const draw = (axis: "x" | "y") =>
    reduce
      ? {}
      : {
          initial: axis === "x" ? { scaleX: 0 } : { scaleY: 0 },
          whileInView: axis === "x" ? { scaleX: 1 } : { scaleY: 1 },
          viewport: { once: true, amount: 0.3 },
          transition: { duration: 1.8, ease: [0.16, 1, 0.3, 1] as const, delay: 0.2 }
        };

  return (
    <Section id="so-funktionierts" tone="light" aria-labelledby="how-title">
      <Reveal className="max-w-2xl">
        <Eyebrow>So funktioniert’s</Eyebrow>
        <h2 id="how-title" className="display mt-5 text-4xl text-text sm:text-5xl lg:text-[3.4rem]">
          Vom Marktplan zur Route in vier Schritten.
        </h2>
        <p className="text-pretty mt-6 text-lg leading-relaxed text-muted">Einmal eingerichtet, finden Kundinnen und Kunden Produkte selbst. Der Markt behält die Kontrolle über Sortiment und Regale.</p>
      </Reveal>

      <div className="relative mt-16">
        {/* connecting line: vertical on small screens, horizontal on lg */}
        <div aria-hidden className="absolute bottom-6 left-[1.35rem] top-6 w-px bg-line lg:hidden" />
        <motion.div aria-hidden {...draw("y")} style={{ originY: 0 }} className="absolute bottom-6 left-[1.35rem] top-6 w-px bg-gradient-to-b from-accent via-teal to-accent/20 lg:hidden" />
        <div aria-hidden className="absolute left-6 right-6 top-[1.35rem] hidden h-px bg-line lg:block" />
        <motion.div aria-hidden {...draw("x")} style={{ originX: 0 }} className="absolute left-6 right-6 top-[1.35rem] hidden h-px bg-gradient-to-r from-accent via-teal to-accent/20 lg:block" />

        <ol className="relative grid gap-10 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} index={i} step={0.12} className="relative pl-16 lg:pl-0">
              <span className="absolute left-0 top-0 grid size-11 place-items-center rounded-full bg-paper text-sm font-semibold text-accent-strong shadow-[0_0_0_6px_var(--color-paper)] ring-1 ring-inset ring-accent/40 lg:static">
                <span className="grid size-11 place-items-center rounded-full bg-white shadow-soft ring-1 ring-inset ring-accent/30">{i + 1}</span>
              </span>
              <s.icon className="mt-0 hidden size-6 text-accent lg:mt-7 lg:block" strokeWidth={1.7} aria-hidden />
              <h3 className="text-xl font-semibold tracking-[-0.02em] text-text lg:mt-3">{s.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.text}</p>
            </Reveal>
          ))}
        </ol>
      </div>

      <div className="mt-24">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">Systemüberblick</p>
            <h3 className="display mt-3 text-3xl text-text sm:text-4xl">Was es heute schon gibt.</h3>
          </div>
        </Reveal>

        <ul className="mt-8 grid gap-4 lg:grid-cols-12">
          {SYSTEM.map((s, i) => (
            <Reveal as="li" key={s.title} index={i} className={`flex ${s.span}`}>
              {s.dark ? (
                <div className="on-dark relative flex w-full flex-col overflow-hidden rounded-3xl bg-ink-900 p-6 text-ink-100 shadow-lift sm:p-8">
                  <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-[radial-gradient(closest-side,rgb(99_230_180/0.18),transparent)]" />
                  <Item s={s} dark />
                </div>
              ) : (
                <Card hover className="flex w-full flex-col">
                  <Item s={s} />
                </Card>
              )}
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function Item({ s, dark = false }: { s: (typeof SYSTEM)[number]; dark?: boolean }) {
  return (
    <>
      <div className="relative flex items-start justify-between gap-3">
        <span className={`grid size-11 place-items-center rounded-xl ring-1 ring-inset ${dark ? "bg-mint/10 text-mint ring-mint/25" : "bg-gradient-to-br from-mint-soft/70 to-mint/30 text-accent-strong ring-accent/15"}`}>
          <s.icon className="size-5" strokeWidth={1.8} aria-hidden />
        </span>
        <Tag kind="umgesetzt" onDark={dark}>
          umgesetzt
        </Tag>
      </div>
      <h4 className={`relative mt-6 text-xl font-semibold tracking-[-0.02em] ${dark ? "text-white" : "text-text"}`}>{s.title}</h4>
      <p className={`relative mt-2 text-[15px] leading-relaxed ${dark ? "text-ink-200" : "text-muted"}`}>{s.text}</p>
      {s.tech ? <p className={`relative mt-auto pt-6 font-mono text-[12px] ${dark ? "text-ink-300" : "text-muted"}`}>{s.tech}</p> : null}
    </>
  );
}
