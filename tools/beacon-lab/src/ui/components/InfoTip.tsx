import { useId, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/** Accessible tooltip: shown on hover and keyboard focus, dismissed with Esc. Content is referenced via aria-describedby. */
export function MetricTooltip({ text, children, className }: { text: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <span aria-describedby={id}>{children}</span>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute left-1/2 top-full z-30 mt-1.5 w-64 -translate-x-1/2 rounded-lg border border-line bg-brand px-3 py-2 text-left text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg"
      >
        {text}
      </span>
    </span>
  );
}

/** Small "i" button that explains a metric or setting. */
export function InfoTip({ text, label }: { text: ReactNode; label?: string }) {
  return (
    <MetricTooltip text={text}>
      <button
        type="button"
        aria-label={label ? `Erklärung: ${label}` : "Erklärung"}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line text-[10px] font-semibold leading-none text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-teal"
      >
        i
      </button>
    </MetricTooltip>
  );
}
