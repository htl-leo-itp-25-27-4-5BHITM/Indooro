import type { DataIssue, IssueSeverity } from "../core/types";

/** Maximum number of example row numbers listed per issue. */
export const MAX_EXAMPLE_ROWS = 5;

/** Formats up to 5 example row numbers, e.g. "z. B. Zeile 3, 7, 12". */
export function exampleRows(rows: number[]): string {
  if (rows.length === 0) return "";
  const shown = rows.slice(0, MAX_EXAMPLE_ROWS).join(", ");
  return rows.length === 1 ? `Zeile ${shown}` : `z. B. Zeile ${shown}`;
}

/**
 * Collects row-level problems and groups them by code. Each code produces one DataIssue with the total
 * count and the first few row numbers, so that large files do not yield thousands of messages.
 */
export class IssueCollector {
  private groups = new Map<
    string,
    { severity: IssueSeverity; message: (count: number) => string; rows: number[]; count: number }
  >();
  private order: string[] = [];

  /** `message` receives the final count; the example rows are appended automatically. */
  add(code: string, severity: IssueSeverity, row: number | undefined, message: (count: number) => string): void {
    let g = this.groups.get(code);
    if (!g) {
      g = { severity, message, rows: [], count: 0 };
      this.groups.set(code, g);
      this.order.push(code);
    }
    g.count++;
    if (row !== undefined && g.rows.length < MAX_EXAMPLE_ROWS) g.rows.push(row);
  }

  count(code: string): number {
    return this.groups.get(code)?.count ?? 0;
  }

  toIssues(): DataIssue[] {
    return this.order.map((code) => {
      const g = this.groups.get(code)!;
      const ex = exampleRows(g.rows);
      const issue: DataIssue = {
        severity: g.severity,
        code,
        message: ex ? `${g.message(g.count)} (${ex})` : g.message(g.count),
        count: g.count,
      };
      if (g.rows.length > 0) issue.rows = g.rows;
      return issue;
    });
  }
}

export function hasBlockingError(issues: DataIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}
