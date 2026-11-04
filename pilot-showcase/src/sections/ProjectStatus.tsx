import type { ReactNode } from "react";
import { Check, CircleDashed, FlaskConical } from "lucide-react";
import { Tag } from "../components/ui/Tag";
import { DONE, OPEN, SIMULATED, TIMELINE, type StatusItem } from "../content/status";
import { Container, Reveal, SectionHeading } from "../features/operator/ui";

function Column({ title, tag, icon, items, delay }: { title: string; tag: ReactNode; icon: ReactNode; items: StatusItem[]; delay: number }) {
  return (
    <Reveal delay={delay} className="flex flex-col rounded-3xl border border-line bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[19px] font-semibold tracking-tight text-text">{title}</h3>
        {tag}
      </div>
      <ul className="mt-5 divide-y divide-line">
        {items.map((it) => (
          <li key={it.text} className="flex gap-3 py-3">
            <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
            <div>
              <p className="text-[14.5px] font-medium leading-snug text-text">{it.text}</p>
              {it.note ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{it.note}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/** Ehrlicher Projektstand: umgesetzt, offen, simuliert. Keine Prozentangaben. */
export function ProjectStatus() {
  return (
    <section id="projektstand" aria-labelledby="projektstand-title" className="border-t border-line bg-paper-2 py-24 sm:py-32">
      <Container>
        <SectionHeading
          id="projektstand-title"
          eyebrow="Projektstand"
          title="Wo wir stehen"
          lead="Ein Teil von Indooro läuft bereits, ein wichtiger Teil ist noch nicht im echten Markt geprüft. Beides sagen wir Ihnen offen."
        />

        <div className="mt-12 grid gap-5 lg:grid-cols-3" data-testid="project-status">
          <Column title="Umgesetzt" tag={<Tag kind="umgesetzt" />} icon={<Check className="size-4" aria-hidden />} items={DONE} delay={0} />
          <Column title="In Arbeit / Offen" tag={<Tag kind="geplant">Offen</Tag>} icon={<CircleDashed className="size-4 text-muted" aria-hidden />} items={OPEN} delay={0.08} />
          <Column title="Was diese Demo simuliert" tag={<Tag kind="simulation" />} icon={<FlaskConical className="size-4 text-[#7a5212]" aria-hidden />} items={SIMULATED} delay={0.16} />
        </div>

        <Reveal className="mt-16">
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">Zeitleiste</h3>
          <ol className="relative mt-6 grid gap-8 md:grid-cols-3 md:gap-6">
            <span aria-hidden className="absolute left-[7px] top-2 hidden h-[calc(100%-1rem)] w-px bg-line max-md:block" />
            <span aria-hidden className="absolute left-0 right-0 top-[7px] hidden h-px bg-line md:block" />
            {TIMELINE.map((t) => (
              <li key={t.title} className="relative pl-8 md:pl-0 md:pt-8">
                <span
                  aria-hidden
                  className={`absolute left-0 top-1 size-[15px] rounded-full border-2 md:top-0 ${t.state === "done" ? "border-accent bg-accent" : t.state === "now" ? "border-accent bg-paper-2 ring-4 ring-accent/20" : "border-ink-300 bg-paper-2"}`}
                />
                <p className="text-[12.5px] font-semibold uppercase tracking-[0.1em] text-accent">{t.when}</p>
                <p className="mt-1 text-[18px] font-semibold tracking-tight text-text">{t.title}</p>
                <p className="mt-1 max-w-xs text-[14px] leading-relaxed text-muted">{t.text}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </Container>
    </section>
  );
}
