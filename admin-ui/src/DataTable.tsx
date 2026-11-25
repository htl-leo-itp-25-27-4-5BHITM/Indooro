import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Container of every admin table. The table fits the container by default (columns marked `col-low` / `col-mid`
 * are hidden when it gets narrow). On phones every row becomes a card with label and value pairs. A table that is still too wide scrolls inside the container only, with
 * shadows at the cut edges and a hint; the scroll area is then reachable by keyboard.
 */
export function DataTable({ label, children }: { label: string; children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  // The card layout on phones shows each cell with its column name, taken from the header after every render.
  useEffect(() => {
    const table = scroller.current?.querySelector("table");
    if (!table) return;
    const headers = Array.from(table.querySelectorAll("thead th"), (header) => header.textContent?.trim() ?? "");
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
      Array.from(row.cells).forEach((cell, index) => {
        const header = headers[index] ?? "";
        cell.dataset.label = header;
        cell.toggleAttribute("data-actions", header.startsWith("Aktion"));
      });
    }
  });

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
