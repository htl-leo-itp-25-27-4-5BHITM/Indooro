import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

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

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">{children}</p>;
}

export function SectionHeading({ eyebrow, title, lead, id }: { eyebrow: string; title: string; lead?: string; id?: string }) {
  return (
    <Reveal className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="mt-3 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.04] tracking-[-0.03em] text-text">
        {title}
      </h2>
      {lead ? <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">{lead}</p> : null}
    </Reveal>
  );
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1200px] px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}
