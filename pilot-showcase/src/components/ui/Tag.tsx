import type { ReactNode } from "react";

/**
 * Honesty tags used across the page. Every claim shown to operators is tagged as
 * "umgesetzt" (exists in the Indooro repository), "simulation" (only simulated in this demo)
 * or "geplant" (not built yet). OWNER of styling: design agent. Props are a stable contract.
 */
export type TagKind = "umgesetzt" | "simulation" | "geplant" | "fiktiv" | "neutral";

const STYLES: Record<TagKind, string> = {
  umgesetzt: "bg-ok/15 text-[#13744a] ring-ok/30",
  simulation: "bg-amber/20 text-[#7a5212] ring-amber/40",
  geplant: "bg-ink-200/25 text-muted ring-ink-200/40",
  fiktiv: "bg-teal/12 text-accent ring-teal/30",
  neutral: "bg-black/5 text-text ring-black/10"
};

const DEFAULT_LABEL: Record<TagKind, string> = {
  umgesetzt: "Umgesetzt",
  simulation: "Simulation",
  geplant: "Geplant",
  fiktiv: "Fiktive Daten",
  neutral: ""
};

export function Tag({ kind, children, className = "", onDark = false }: { kind: TagKind; children?: ReactNode; className?: string; onDark?: boolean }) {
  const dark = onDark
    ? {
        umgesetzt: "bg-ok/15 text-ok ring-ok/30",
        simulation: "bg-amber/15 text-amber ring-amber/35",
        geplant: "bg-white/8 text-ink-200 ring-white/15",
        fiktiv: "bg-teal/15 text-mint ring-teal/35",
        neutral: "bg-white/8 text-ink-100 ring-white/15"
      }[kind]
    : STYLES[kind];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] ring-1 ring-inset ${dark} ${className}`}>
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {children ?? DEFAULT_LABEL[kind]}
    </span>
  );
}
