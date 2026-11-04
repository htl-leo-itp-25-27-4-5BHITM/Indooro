import { useEffect, useRef } from "react";
import { scrollFraction } from "./chapters";

/** Thin reading-progress bar; meant to sit at the bottom edge of the sticky header (hidden on xl, where the rail takes over). */
export function ReadingProgress() {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const f = scrollFraction(window.scrollY, document.documentElement.scrollHeight, window.innerHeight);
      if (bar.current) bar.current.style.transform = `scaleX(${f.toFixed(4)})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return (
    <span aria-hidden data-testid="reading-progress" className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] xl:hidden">
      <span ref={bar} className="block h-full origin-left bg-mint" style={{ transform: "scaleX(0)" }} />
    </span>
  );
}
