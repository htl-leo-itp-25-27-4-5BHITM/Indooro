import type { ReactNode } from "react";

/** Surface card. `tone` = light (white on paper) or dark (glass on ink). */
export function Card({ tone = "light", className = "", hover = false, children }: { tone?: "light" | "dark"; className?: string; hover?: boolean; children: ReactNode }) {
  const base = tone === "light" ? "bg-white shadow-soft hairline" : "bg-white/[0.035] hairline-dark";
  const lift = hover
    ? tone === "light"
      ? "transition-[transform,box-shadow] duration-500 ease-out-expo hover:-translate-y-1 hover:shadow-lift"
      : "transition-[transform,background-color] duration-500 ease-out-expo hover:-translate-y-1 hover:bg-white/[0.06]"
    : "";
  return <div className={`rounded-3xl p-6 sm:p-8 ${base} ${lift} ${className}`}>{children}</div>;
}
