import type { ReactNode } from "react";

export function Kbd({ children, onDark = false }: { children: ReactNode; onDark?: boolean }) {
  return (
    <kbd
      className={`inline-flex min-w-6 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium ${
        onDark ? "bg-white/8 text-ink-100 ring-1 ring-inset ring-white/15" : "bg-white text-text ring-1 ring-inset ring-line shadow-[0_1px_0_var(--color-line)]"
      }`}
    >
      {children}
    </kbd>
  );
}
