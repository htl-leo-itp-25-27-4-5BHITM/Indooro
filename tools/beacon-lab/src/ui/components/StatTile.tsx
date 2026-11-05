import type { ReactNode } from "react";
import { cn } from "./cn";
import { InfoTip } from "./InfoTip";

export interface StatTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  /** tooltip text defining the metric */
  definition?: string;
  tone?: "default" | "warning" | "danger";
  className?: string;
}

export function StatTile({ label, value, unit, hint, definition, tone = "default", className }: StatTileProps) {
  return (
    <div
      data-testid="stat-tile"
      className={cn(
        "rounded-xl border bg-white px-4 py-3",
        tone === "warning" ? "border-amber" : tone === "danger" ? "border-danger/40" : "border-line",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <span>{label}</span>
        {definition && <InfoTip text={definition} label={label} />}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-2xl font-semibold tracking-tight text-ink" data-testid="stat-value">
          {value}
        </span>
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
