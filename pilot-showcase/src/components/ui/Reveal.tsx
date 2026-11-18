import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Scroll reveal wrapper (plays once). `index` staggers siblings (index * step seconds).
 * Reduced-motion users get the content without any motion.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  index = 0,
  step = 0.08,
  y = 24,
  amount = 0.15,
  as = "div"
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  index?: number;
  step?: number;
  y?: number;
  amount?: number;
  as?: "div" | "li" | "section" | "article" | "p";
}) {
  const reduce = useReducedMotion();
  const Comp = motion[as];
  if (reduce) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount }}
      transition={{ duration: 0.8, delay: delay + index * step, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Comp>
  );
}
