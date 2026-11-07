import type { ReactNode } from "react";

/** Big number/fact with label. Use for verified facts only (no invented metrics). */
export function Stat({ value, label, onDark = false, className = "" }: { value: ReactNode; label: ReactNode; onDark?: boolean; className?: string }) {
  return (
    <div className={className}>
      <div className={`text-4xl font-semibold tracking-[-0.03em] sm:text-5xl ${onDark ? "text-white" : "text-text"}`}>{value}</div>
      <div className={`mt-1.5 text-sm leading-snug ${onDark ? "text-ink-200" : "text-muted"}`}>{label}</div>
    </div>
  );
}
