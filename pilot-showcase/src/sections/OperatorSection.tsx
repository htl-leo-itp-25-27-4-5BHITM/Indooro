import { Quote } from "lucide-react";
import { Tag } from "../components/ui/Tag";
import { ACCEPTANCE_CRITERIA, OPERATOR_HEADLINE, OPERATOR_SUBLINE, USER_STORY } from "../content/operator";
import { OperatorDemo } from "../features/operator/OperatorDemo";
import { Container } from "../components/ui/Container";
import { Reveal, SectionHeading } from "../features/operator/ui";
import { NextChapter } from "../features/tour/NextChapter";

/** Betreiber-Bereich: „Ihr Markt. In Ihrer Hand.“ mit User Story und geführter Simulation. */
export function OperatorSection() {
  return (
    <section id="betreiber" aria-labelledby="betreiber-title" className="bg-paper py-20 sm:py-24 lg:py-32">
      <Container>
        <SectionHeading id="betreiber-title" eyebrow="Für Betreiber" title={OPERATOR_HEADLINE} lead={OPERATOR_SUBLINE} />

        <Reveal className="mt-14" delay={0.05}>
          <figure className="grid gap-8 rounded-3xl border border-line bg-white p-6 shadow-[0_1px_0_rgba(15,31,23,0.04)] sm:p-9 lg:grid-cols-[1.15fr_1fr] lg:gap-12">
            <div>
              <div className="flex items-center gap-3">
                <Quote className="size-5 text-accent" aria-hidden />
                <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">User Story aus dem Sprint</span>
                <Tag kind="umgesetzt" />
              </div>
              <blockquote className="mt-5 text-[clamp(1.2rem,2.2vw,1.65rem)] font-medium leading-[1.35] tracking-[-0.015em] text-text">„{USER_STORY}“</blockquote>
            </div>
            <figcaption>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Akzeptanzkriterien</p>
              <ol className="mt-4 divide-y divide-line border-y border-line">
                {ACCEPTANCE_CRITERIA.map((a) => (
                  <li key={a.id} className="flex gap-4 py-3.5">
                    <span className="mt-0.5 h-fit shrink-0 whitespace-nowrap rounded-full bg-accent/10 px-2.5 py-0.5 text-[11.5px] font-semibold text-accent ring-1 ring-inset ring-accent/20">{a.label}</span>
                    <div>
                      <p className="text-[15px] leading-snug text-text">{a.text}</p>
                      <p className="mt-1 text-[12.5px] text-muted">
                        In der Simulation: Schritt{a.steps.length > 1 ? "e" : ""} {a.steps.length > 1 ? `${a.steps[0]}–${a.steps[a.steps.length - 1]}` : a.steps[0]}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </figcaption>
          </figure>
        </Reveal>

        <Reveal className="mt-10" delay={0.05}>
          <OperatorDemo />
        </Reveal>
        <NextChapter href="#projektstand" tone="light" title="Wo das Projekt heute steht" text="Was umgesetzt ist, was nur simuliert ist und was noch offen bleibt." />
      </Container>
    </section>
  );
}
