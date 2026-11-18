import { Tag } from "../components/ui/Tag";
import { NOT_PROMISED, PILOT_HEADLINE, PILOT_STEPS, PILOT_SUBLINE, WE_NEED, WE_SEEK, YOU_GET } from "../content/pilot";
import { AtAGlance, ContactCard, PilotFaq } from "../features/operator/pilotParts";
import { Container, Reveal, SectionHeading } from "../features/operator/ui";

function Col({ n, title, items, delay }: { n: string; title: string; items: string[]; delay: number }) {
  return (
    <Reveal delay={delay} className="rounded-3xl border border-line bg-white p-6 sm:p-7">
      <p className="font-mono text-[12px] font-semibold text-accent">{n}</p>
      <h3 className="mt-2 text-[20px] font-semibold tracking-tight text-text">{title}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((t) => (
          <li key={t} className="flex gap-3 text-[14.5px] leading-snug text-text">
            <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
            {t}
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/** Pilot-Anfrage an Marktpartner. Enthält den Anker #kontakt (Kontaktkarte). */
export function PilotSection() {
  return (
    <section id="pilot" data-testid="pilot-section" aria-labelledby="pilot-title" className="border-t border-line bg-paper py-24 sm:py-32">
      <Container>
        <SectionHeading id="pilot-title" eyebrow="Pilot-Partner gesucht" title={PILOT_HEADLINE} lead={PILOT_SUBLINE} />

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <Col n="01" title="Was wir suchen" items={WE_SEEK} delay={0} />
          <Col n="02" title="Was wir benötigen" items={WE_NEED} delay={0.08} />
          <Col n="03" title="Was Sie erhalten" items={YOU_GET} delay={0.16} />
        </div>
        <Reveal className="mt-4">
          <p className="flex flex-wrap items-center gap-3 text-[14px] text-muted">
            <Tag kind="neutral">Ohne Versprechen</Tag>
            {NOT_PROMISED}
          </p>
        </Reveal>

        <div className="mt-24">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Pilotablauf</p>
            <h3 className="mt-3 text-[clamp(1.6rem,3.2vw,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-text">Fünf Schritte, ehrlich beziffert.</h3>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-muted">Die Angaben sind Planungswerte aus unseren Unterlagen. Den Aufwand für Ihren Markt halten wir klein; die Termine legen wir mit Ihnen fest.</p>
          </Reveal>
          <ol data-testid="pilot-steps" className="mt-10 border-t border-line">
            {PILOT_STEPS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.05} className="grid gap-2 border-b border-line py-6 md:grid-cols-[80px_1.1fr_1.6fr_1fr] md:items-baseline md:gap-6">
                <span className="font-mono text-[28px] font-semibold leading-none tracking-tight text-accent/80">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[18px] font-semibold tracking-tight text-text">{s.title}</span>
                <span className="text-[14.5px] leading-relaxed text-muted">{s.what}</span>
                <span className="text-[13.5px] font-medium text-text md:text-right">
                  <span className="mr-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted md:hidden">Aufwand</span>
                  {s.effort}
                </span>
              </Reveal>
            ))}
          </ol>
        </div>

        <div className="mt-24 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Aufwand & Rahmenbedingungen</p>
            <h3 className="mt-3 text-[clamp(1.6rem,3.2vw,2.4rem)] font-semibold leading-tight tracking-[-0.03em] text-text">Risiken offen benannt.</h3>
            <div className="mt-8">
              <PilotFaq />
            </div>
          </Reveal>
          <Reveal delay={0.1} className="space-y-5 lg:pt-4">
            <ContactCard />
            <AtAGlance />
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
