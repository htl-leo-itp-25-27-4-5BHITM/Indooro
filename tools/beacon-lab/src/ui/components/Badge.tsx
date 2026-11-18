import type { ReactNode } from "react";
import { cn } from "./cn";
import type { DataOrigin } from "../../core/types";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "synthetic" | "real";

const STYLES: Record<BadgeVariant, string> = {
  neutral: "bg-page text-muted border-line",
  success: "bg-emerald-50 text-accent border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber",
  danger: "bg-red-50 text-danger border-red-200",
  synthetic: "bg-synthetic text-white border-synthetic uppercase tracking-wider",
  real: "bg-accent text-white border-accent uppercase tracking-wider",
};

export function Badge({
  variant = "neutral",
  children,
  className,
  title,
  ...data
}: { variant?: BadgeVariant; children: ReactNode; className?: string; title?: string; [dataAttr: `data-${string}`]: string | undefined }) {
  return (
    <span
      {...data}
      title={title}
      data-variant={variant}
      className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-4", STYLES[variant], className)}
    >
      {children}
    </span>
  );
}

export const ORIGIN_LABEL: Record<DataOrigin, string> = { synthetic: "SYNTHETISCH", real: "ECHTDATEN" };

/** Origin marker. Synthetic data must be unmistakable: solid burnt orange with a warning mark and ring. */
export function OriginBadge({ origin, className }: { origin: DataOrigin; className?: string }) {
  const synthetic = origin === "synthetic";
  return (
    <Badge
      variant={synthetic ? "synthetic" : "real"}
      className={cn(synthetic && "px-2.5 py-1 text-xs ring-2 ring-synthetic/30", className)}
      title={synthetic ? "Simulierte Daten – keine Messergebnisse" : "Im Feld erfasste Messdaten"}
    >
      {synthetic && <span aria-hidden="true">⚠</span>}
      <span data-testid="origin-label">{ORIGIN_LABEL[origin]}</span>
    </Badge>
  );
}
