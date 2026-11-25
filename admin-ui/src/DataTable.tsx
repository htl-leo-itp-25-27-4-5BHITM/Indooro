import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Container of every admin table. The table fits the container by default (columns marked `col-low` / `col-mid`
 * are hidden when it gets narrow). A table that is still too wide scrolls inside the container only, with
 * shadows at the cut edges and a hint; the scroll area is then reachable by keyboard.
 */
export function DataTable({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = scroller.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setOverflowing(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, []);

  return <div className="data-table">
    {overflowing && <p className="data-table-hint">Tabelle seitlich scrollen für weitere Spalten.</p>}
    <div ref={scroller} className="table-scroll" {...(overflowing ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}>
      <table>{children}</table>
    </div>
  </div>;
}
