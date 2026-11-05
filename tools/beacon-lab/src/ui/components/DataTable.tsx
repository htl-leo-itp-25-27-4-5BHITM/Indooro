import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { InfoTip } from "./InfoTip";

export interface DataColumn<T> {
  key: string;
  header: string;
  /** numeric columns are right-aligned with tabular figures */
  numeric?: boolean;
  /** cell renderer; defaults to String(sortValue) */
  render?: (row: T, index: number) => ReactNode;
  /** value used for sorting; columns without it are not sortable */
  sortValue?: (row: T) => number | string | null | undefined;
  /** tooltip with the metric definition */
  definition?: string;
  width?: string;
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  caption?: string;
  emptyMessage?: ReactNode;
  initialSort?: { key: string; dir: "asc" | "desc" };
  maxHeight?: number | string;
  onRowClick?: (row: T) => void;
  dense?: boolean;
}

type Dir = "asc" | "desc";

export function compareValues(a: number | string | null | undefined, b: number | string | null | undefined): number {
  const an = a === null || a === undefined || (typeof a === "number" && Number.isNaN(a));
  const bn = b === null || b === undefined || (typeof b === "number" && Number.isNaN(b));
  if (an && bn) return 0;
  if (an) return 1; // nulls last (in ascending order)
  if (bn) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "de", { numeric: true });
}

export function DataTable<T>({ columns, rows, rowKey, caption, emptyMessage = "Keine Daten", initialSort, maxHeight, onRowClick, dense }: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: Dir } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const sign = sort.dir === "asc" ? 1 : -1;
    // nulls always last regardless of direction
    return rows
      .map((r, i) => ({ r, i }))
      .sort((x, y) => {
        const a = get(x.r);
        const b = get(y.r);
        const aNull = a === null || a === undefined;
        const bNull = b === null || b === undefined;
        if (aNull || bNull) return compareValues(a, b) || x.i - y.i;
        return sign * compareValues(a, b) || x.i - y.i;
      })
      .map((x) => x.r);
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  return (
    <div className="relative overflow-auto rounded-xl border border-line bg-white" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = !!c.sortValue;
              const active = sort?.key === c.key ? sort.dir : null;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (active === "asc" ? "ascending" : "descending") : sortable ? "none" : undefined}
                  style={c.width ? { width: c.width } : undefined}
                  className={cn(
                    "sticky top-0 z-10 border-b border-line bg-page px-3 py-2 text-xs font-semibold text-muted",
                    c.numeric ? "text-right" : "text-left",
                  )}
                >
                  <span className={cn("inline-flex items-center gap-1", c.numeric && "flex-row-reverse")}>
                    {sortable ? (
                      <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-teal">
                        {c.header}
                        <span aria-hidden="true" className="text-[10px]">
                          {active === "asc" ? "▲" : active === "desc" ? "▼" : "↕"}
                        </span>
                      </button>
                    ) : (
                      c.header
                    )}
                    {c.definition && <InfoTip text={c.definition} label={c.header} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-sm text-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("border-b border-line last:border-b-0", onRowClick && "cursor-pointer hover:bg-page")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-3", dense ? "py-1.5" : "py-2.5", c.numeric ? "tabular text-right" : "text-left")}>
                    {c.render ? c.render(row, i) : String(c.sortValue?.(row) ?? "–")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
