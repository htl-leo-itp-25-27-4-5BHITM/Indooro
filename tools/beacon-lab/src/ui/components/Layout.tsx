import type { ReactNode } from "react";
import { cn } from "./cn";
import type { DataOrigin } from "../../core/types";
import { OriginBadge } from "./Badge";

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** remove body padding (for tables) */
  flush?: boolean;
}

export function Card({ title, subtitle, actions, children, className, flush }: CardProps) {
  return (
    <section className={cn("rounded-xl border border-line bg-white", className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function Section({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3", className)}>
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function Toolbar({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role="toolbar" aria-label={label} className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

/** Two-column layout helper: fixed-width side panel + flexible main area. Stacks on narrow screens. */
export function SplitPane({
  side,
  children,
  sideWidth = 320,
  sidePosition = "left",
  className,
}: {
  side: ReactNode;
  children: ReactNode;
  sideWidth?: number;
  sidePosition?: "left" | "right";
  className?: string;
}) {
  const cols = sidePosition === "left" ? `${sideWidth}px minmax(0,1fr)` : `minmax(0,1fr) ${sideWidth}px`;
  return (
    <div className={cn("bl-split grid gap-4", className)} style={{ ["--split-cols" as string]: cols }}>
      {sidePosition === "left" && <aside className="min-w-0 space-y-4">{side}</aside>}
      <div className="min-w-0 space-y-4">{children}</div>
      {sidePosition === "right" && <aside className="min-w-0 space-y-4">{side}</aside>}
    </div>
  );
}

export function Stack({ children, gap = 4, className }: { children: ReactNode; gap?: 2 | 3 | 4 | 6; className?: string }) {
  const g = { 2: "space-y-2", 3: "space-y-3", 4: "space-y-4", 6: "space-y-6" }[gap];
  return <div className={cn(g, className)}>{children}</div>;
}

export function PageHeader({
  title,
  breadcrumbs,
  origin,
  actions,
  description,
}: {
  title: ReactNode;
  breadcrumbs?: string[];
  origin?: DataOrigin;
  actions?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Brotkrumen" className="mb-1 text-xs text-muted">
            <ol className="flex flex-wrap items-center gap-1.5">
              {breadcrumbs.map((b, i) => (
                <li key={`${b}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  <span aria-current={i === breadcrumbs.length - 1 ? "page" : undefined}>{b}</span>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {origin && <OriginBadge origin={origin} />}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
