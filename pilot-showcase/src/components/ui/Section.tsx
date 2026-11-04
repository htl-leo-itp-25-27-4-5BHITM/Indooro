import type { ReactNode } from "react";
import { Container } from "./Container";

export type SectionTone = "light" | "paper2" | "dark" | "darker";

const TONES: Record<SectionTone, string> = {
  light: "bg-paper text-text",
  paper2: "bg-paper-2 text-text",
  dark: "bg-ink-900 text-ink-100 on-dark",
  darker: "bg-ink-950 text-ink-100 on-dark"
};

/** Page section with vertical rhythm. `tone` switches light / dark surfaces. Content is wrapped in a Container unless `bare`. */
export function Section({
  id,
  tone = "light",
  className = "",
  innerClassName = "",
  bare = false,
  children,
  ...rest
}: {
  id?: string;
  tone?: SectionTone;
  className?: string;
  innerClassName?: string;
  bare?: boolean;
  children: ReactNode;
  "aria-labelledby"?: string;
  "data-testid"?: string;
}) {
  return (
    <section id={id} className={`relative isolate overflow-x-clip py-20 sm:py-24 lg:py-32 ${TONES[tone]} ${className}`} {...rest}>
      {bare ? children : <Container className={innerClassName}>{children}</Container>}
    </section>
  );
}
