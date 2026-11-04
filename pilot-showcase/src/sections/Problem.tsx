import { Clock, MessageCircleQuestion, RefreshCw, UserRoundSearch } from "lucide-react";
import { Card, Eyebrow, Reveal, Section } from "../components/ui";

const POINTS = [
  {
    icon: MessageCircleQuestion,
    title: "„Wo finde ich …?“",
    text: "Kundinnen und Kunden fragen das Personal, oft mitten im Gang und mitten in einer anderen Aufgabe."
  },
  {
    icon: UserRoundSearch,
    title: "Neue und seltene Kundschaft",
    text: "Stammkundschaft kennt jedes Regal. Wer zum ersten Mal kommt oder selten einkauft, sucht länger."
  },
  {
    icon: RefreshCw,
    title: "Regale ändern sich",
    text: "Aktionsflächen, Saisonware, Umbauten: Orientierung, die gestern gestimmt hat, passt morgen nicht mehr."
  },
  {
    icon: Clock,
    title: "Personalzeit ist knapp",
    text: "Jede Auskunft braucht Zeit, die an der Kasse, am Regal oder in der Beratung fehlt."
  }
];

/** Operator perspective: observations and questions, no invented statistics. */
export function Problem() {
  return (
    <Section id="problem" tone="light" aria-labelledby="problem-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <Reveal>
            <Eyebrow>Kennen Sie das?</Eyebrow>
            <h2 id="problem-title" className="display mt-5 text-4xl text-text sm:text-5xl lg:text-[3.4rem]">
              Eine Frage, die Ihr Team schon oft gehört hat.
            </h2>
            <p className="text-pretty mt-6 max-w-md text-lg leading-relaxed text-muted">
              Ein Supermarkt hat tausende Artikel auf vielen Metern Regal. Kundinnen und Kunden wissen, was sie brauchen, aber nicht immer, wo es steht.
            </p>
          </Reveal>

          <Reveal delay={0.15} className="mt-10 rounded-2xl bg-white/70 p-5 shadow-soft hairline">
            <figure className="flex gap-4">
              <span aria-hidden className="mt-1 h-auto w-1 shrink-0 rounded-full bg-gradient-to-b from-accent to-teal" />
              <div>
                <blockquote className="text-[15px] leading-relaxed text-text">
                  Die Idee kommt aus dem Alltag: Mitglieder unseres Teams arbeiten samstags in einem Supermarkt und kennen diese Fragen aus erster Hand.
                </blockquote>
                <figcaption className="mt-2 text-xs font-medium uppercase tracking-[0.1em] text-muted">Ursprung von Indooro</figcaption>
              </div>
            </figure>
          </Reveal>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {POINTS.map((p, i) => (
            <Reveal as="li" key={p.title} index={i} className="flex">
              <Card hover className="flex w-full flex-col">
                <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-mint-soft/70 to-mint/30 text-accent-strong ring-1 ring-inset ring-accent/15">
                  <p.icon className="size-5" strokeWidth={1.9} aria-hidden />
                </span>
                <h3 className="mt-6 text-xl font-semibold tracking-[-0.02em] text-text">{p.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{p.text}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}
