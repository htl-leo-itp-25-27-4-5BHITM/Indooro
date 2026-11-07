import type { ElementType, ReactNode } from "react";

/** Centered page container, max ~1200px, responsive gutters. */
export function Container({ as: As = "div", className = "", children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return <As className={`mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-10 ${className}`}>{children}</As>;
}
