import type { DataIssue, IssueSeverity } from "../../core/types";
import { Badge } from "./Badge";
import type { BadgeVariant } from "./Badge";

export const SEVERITY_LABEL: Record<IssueSeverity, string> = { error: "Fehler", warning: "Warnungen", info: "Hinweise" };
const SEVERITY_VARIANT: Record<IssueSeverity, BadgeVariant> = { error: "danger", warning: "warning", info: "neutral" };
const ORDER: IssueSeverity[] = ["error", "warning", "info"];

export function groupIssues(issues: DataIssue[]): Record<IssueSeverity, DataIssue[]> {
  const out: Record<IssueSeverity, DataIssue[]> = { error: [], warning: [], info: [] };
  for (const i of issues) out[i.severity].push(i);
  return out;
}

function rowsText(rows: number[] | undefined, count: number | undefined): string | null {
  if (!rows || rows.length === 0) return null;
  const shown = rows.slice(0, 8).join(", ");
  const more = (count ?? rows.length) - Math.min(rows.length, 8);
  return `Zeile ${shown}${more > 0 ? ` … (+${more})` : ""}`;
}

/** Data-quality issues grouped by severity (errors first) with code, count and row numbers. */
export function IssueList({ issues, emptyText = "Keine Auffälligkeiten." }: { issues: DataIssue[]; emptyText?: string }) {
  if (issues.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  const grouped = groupIssues(issues);
  return (
    <div className="space-y-4">
      {ORDER.filter((s) => grouped[s].length > 0).map((s) => (
        <section key={s} aria-label={SEVERITY_LABEL[s]} data-severity={s}>
          <h4 className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink">
            {SEVERITY_LABEL[s]}
            <Badge variant={SEVERITY_VARIANT[s]}>{grouped[s].length}</Badge>
          </h4>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {grouped[s].map((i, idx) => {
              const rt = rowsText(i.rows, i.count);
              return (
                <li key={`${i.code}-${idx}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <code className="rounded bg-page px-1.5 py-0.5 font-mono text-[11px] text-muted">{i.code}</code>
                  <span className="min-w-0 flex-1 text-ink">{i.message}</span>
                  {i.count !== undefined && <span className="tabular text-xs text-muted">{i.count}×</span>}
                  {rt && <span className="tabular text-xs text-muted">{rt}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
