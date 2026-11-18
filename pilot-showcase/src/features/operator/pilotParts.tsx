import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown, ExternalLink, Mail, Phone, Printer, User } from "lucide-react";
import { AT_A_GLANCE, FAQ, FRAMEWORK_NOTE, type FaqItem } from "../../content/pilot";
import { contact, hasContact, REPO_URL, type ContactConfig } from "../../content/contact";

function FaqRow({ item, open, onToggle, idx }: { item: FaqItem; open: boolean; onToggle: () => void; idx: number }) {
  const reduce = useReducedMotion();
  const base = useId();
  const panel = `${base}-p`;
  const btn = `${base}-b`;
  return (
    <div className="border-b border-line">
      <h4>
        <button
          id={btn}
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={onToggle}
          data-testid={`pilot-faq-q-${idx}`}
          className="flex min-h-14 w-full items-center justify-between gap-4 py-4 text-left"
        >
          <span className="text-[16.5px] font-medium leading-snug tracking-[-0.01em] text-text">{item.q}</span>
          <ChevronDown className={`size-5 shrink-0 text-muted transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </h4>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panel}
            role="region"
            aria-labelledby={btn}
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="max-w-2xl pb-5 text-[15px] leading-relaxed text-muted">{item.a}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** „Risiken offen benannt“ – Accordion, ein Eintrag gleichzeitig offen. */
export function PilotFaq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div data-testid="pilot-faq" className="border-t border-line">
      {FAQ.map((item, i) => (
        <FaqRow key={item.q} item={item} idx={i} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
      ))}
    </div>
  );
}

/** Kontaktkarte. Bei leerer Konfiguration neutraler Text und Repository-Link. */
export function ContactCard({ config = contact }: { config?: ContactConfig }) {
  const has = hasContact(config);
  return (
    <div id="kontakt" data-testid="contact-card" className="rounded-3xl bg-ink-900 p-7 text-white sm:p-9">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-mint">Kontakt</p>
      <h3 className="mt-3 text-[clamp(1.5rem,3vw,2.1rem)] font-semibold leading-tight tracking-[-0.025em]">Lernen wir uns kennen.</h3>
      {has ? (
        <ul className="mt-6 space-y-3 text-[16px]">
          {config.person ? (
            <li className="flex items-center gap-3">
              <User className="size-5 text-mint" aria-hidden /> {config.person}
            </li>
          ) : null}
          {config.email ? (
            <li className="flex items-center gap-3">
              <Mail className="size-5 text-mint" aria-hidden />
              <a className="underline decoration-white/30 underline-offset-4 hover:decoration-mint" href={`mailto:${config.email}`}>
                {config.email}
              </a>
            </li>
          ) : null}
          {config.phone ? (
            <li className="flex items-center gap-3">
              <Phone className="size-5 text-mint" aria-hidden />
              <a className="underline decoration-white/30 underline-offset-4 hover:decoration-mint" href={`tel:${config.phone.replace(/\s+/g, "")}`}>
                {config.phone}
              </a>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-100">Sprechen Sie uns direkt an – wir kommen gerne für ein Erstgespräch in Ihren Markt.</p>
      )}
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-[14px] font-medium text-white transition hover:bg-white/10"
      >
        <ExternalLink className="size-4" aria-hidden /> Projekt auf GitHub ansehen
      </a>
      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-200">Ein 10-Minuten-Termin, in dem wir Ihnen die App zeigen, genügt für den Anfang. Keine Verpflichtung.</p>
    </div>
  );
}

/** Druckfreundliche Zusammenfassung. */
export function AtAGlance() {
  return (
    <div id="auf-einen-blick" data-testid="at-a-glance" className="rounded-3xl border border-line bg-white p-6 sm:p-8">
      <style>{`@media print { body * { visibility: hidden !important; } #auf-einen-blick, #auf-einen-blick * { visibility: visible !important; } #auf-einen-blick { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0; } .no-print { display: none !important; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[20px] font-semibold tracking-tight text-text">Pilot auf einen Blick</h3>
        <button type="button" onClick={() => window.print()} className="no-print inline-flex min-h-10 items-center gap-2 rounded-full border border-line px-4 text-[13px] font-medium text-text transition hover:bg-paper">
          <Printer className="size-4" aria-hidden /> Drucken
        </button>
      </div>
      <dl className="mt-5 divide-y divide-line border-y border-line">
        {AT_A_GLANCE.map((r) => (
          <div key={r.label} className="grid gap-1 py-3 sm:grid-cols-[110px_1fr] sm:gap-4">
            <dt className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-muted">{r.label}</dt>
            <dd className="text-[15px] leading-snug text-text">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">{FRAMEWORK_NOTE}</p>
    </div>
  );
}
