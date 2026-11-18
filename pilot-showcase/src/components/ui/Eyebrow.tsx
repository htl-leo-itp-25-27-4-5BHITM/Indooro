import type { ReactNode } from "react";

/** Small uppercase kicker above headlines. */
export function Eyebrow({ children, onDark = false, className = "" }: { children: ReactNode; onDark?: boolean; className?: string }) {
  return (
    <p className={`flex items-center gap-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] ${onDark ? "text-mint" : "text-accent"} ${className}`}>
      <span aria-hidden className={`h-px w-6 shrink-0 ${onDark ? "bg-mint/60" : "bg-accent/50"}`} />
      {children}
    </p>
  );
}
