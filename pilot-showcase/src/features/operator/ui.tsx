import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Eyebrow } from "../../components/ui/Eyebrow";

/** Kleine lokale Darstellungsbausteine für Betreiber-, Status- und Pilot-Bereich. */

export function Reveal({ children, delay = 0, className = "", as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" }) {
  const reduce = useReducedMotion();
  const M = as === "li" ? motion.li : motion.div;
  return (
    <M
      className={className}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.65, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </M>
  );
}

export function SectionHeading({ eyebrow, title, lead, id }: { eyebrow: string; title: string; lead?: string; id?: string }) {
  return (
    <Reveal className="max-w-2xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="display mt-5 text-4xl text-text sm:text-5xl lg:text-[3.4rem]">
        {title}
      </h2>
      {lead ? <p className="text-pretty mt-6 text-lg leading-relaxed text-muted">{lead}</p> : null}
    </Reveal>
  );
}
