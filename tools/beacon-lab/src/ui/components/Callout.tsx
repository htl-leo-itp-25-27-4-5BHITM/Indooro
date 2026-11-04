import type { ReactNode } from "react";
import { cn } from "./cn";

export type CalloutTone = "info" | "warning" | "danger" | "synthetic";

const TONES: Record<CalloutTone, { box: string; icon: string; glyph: string }> = {
  info: { box: "border-teal/40 bg-teal/5", icon: "text-accent", glyph: "i" },
  warning: { box: "border-amber bg-amber/10", icon: "text-amber-800", glyph: "!" },
  danger: { box: "border-danger/40 bg-red-50", icon: "text-danger", glyph: "×" },
  synthetic: { box: "border-synthetic bg-orange-50", icon: "text-synthetic", glyph: "⚠" },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Inline alert. Use e.g. for "Maßstab nicht bestätigt", "Unkalibriert", "Keine belastbare Auswertung möglich". */
export function Callout({ tone = "info", title, children, actions, className }: CalloutProps) {
  const t = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} data-tone={tone} className={cn("flex gap-3 rounded-lg border px-4 py-3", t.box, className)}>
      <span aria-hidden="true" className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold", t.icon)}>
        {t.glyph}
      </span>
      <div className="min-w-0 flex-1 text-sm text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(!!title && "mt-0.5 text-muted")}>{children}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

export const Alert = Callout;

export function EmptyState({ title, description, action, icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line border-b-2 bg-page px-1.5 py-0.5 font-mono text-[11px] text-ink">{children}</kbd>;
}
