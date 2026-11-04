import { useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
  content?: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  /** render the active tab's `content` below the tab list */
  renderPanel?: boolean;
}

/** WAI-ARIA tabs with roving tabindex; Arrow keys, Home, End. */
export function Tabs({ tabs, value, onChange, label, renderPanel = true }: TabsProps) {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const enabled = tabs.filter((t) => !t.disabled);

  const move = (e: KeyboardEvent, from: string) => {
    const idx = enabled.findIndex((t) => t.id === from);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    else return;
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    onChange(target.id);
    refs.current[target.id]?.focus();
  };

  const active = tabs.find((t) => t.id === value);
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 border-b border-line">
        {tabs.map((t) => {
          const selected = t.id === value;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              id={`${base}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              disabled={t.disabled}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => move(e, t.id)}
              className={cn(
                "-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal disabled:opacity-40",
                selected ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {renderPanel && active && (
        <div role="tabpanel" id={`${base}-panel-${active.id}`} aria-labelledby={`${base}-tab-${active.id}`} tabIndex={0} className="pt-4 focus:outline-none">
          {active.content}
        </div>
      )}
    </div>
  );
}
