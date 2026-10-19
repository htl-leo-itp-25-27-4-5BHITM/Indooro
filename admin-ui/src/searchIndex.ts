import { ApiClientError } from "./api/client";
import type { IndexOverview, IndexVersion, ReindexResult } from "./api/searchIndex";

// Pure helpers for the Suchindex page. No React, no requests.

export type CountComparison = "equal" | "different" | "unknown";

/** Compares a version with the source index. A count that could not be read is "unknown", never "equal". */
export function compareWithSource(version: Pick<IndexVersion, "docCount">, sourceCount: number | null): CountComparison {
  if (version.docCount === null || sourceCount === null) return "unknown";
  return version.docCount === sourceCount ? "equal" : "different";
}

export function formatCount(count: number | null): string {
  return count === null ? "nicht lesbar" : count.toLocaleString("de-AT");
}

export function comparisonText(comparison: CountComparison, sourceCount: number | null): string {
  if (comparison === "equal") return "gleich wie Quelle";
  if (comparison === "different") return `weicht von der Quelle ab (${formatCount(sourceCount)})`;
  return "nicht vergleichbar";
}

export function aliasSummary(overview: Pick<IndexOverview, "alias" | "activeIndices" | "sourceIndex">): string {
  if (overview.activeIndices.length === 0) {
    return `Der Alias ${overview.alias} zeigt auf keinen Versionsindex. Das Backend liest ${overview.sourceIndex}.`;
  }
  return `Der Alias ${overview.alias} zeigt auf ${overview.activeIndices.join(", ")}.`;
}

/** Warning when the alias targets more than one version; the next activation removes all of them. */
export function aliasWarning(overview: Pick<IndexOverview, "alias" | "activeIndices">): string | null {
  return overview.activeIndices.length > 1
    ? `Der Alias ${overview.alias} zeigt auf mehrere Versionen (${overview.activeIndices.join(", ")}). Eine Aktivierung ersetzt alle.`
    : null;
}

export function canActivate(version: IndexVersion): boolean {
  return !version.active;
}

/** Text of the confirmation dialog before the alias is switched. */
export function activateConfirmText(version: IndexVersion, overview: IndexOverview): string {
  const comparison = compareWithSource(version, overview.sourceCount);
  const lines = [
    `Alias ${overview.alias} auf ${version.name} umschalten?`,
    `Bisher: ${overview.activeIndices.length ? overview.activeIndices.join(", ") : `kein Versionsindex (Backend liest ${overview.sourceIndex})`}.`,
    `Dokumente in ${version.name}: ${formatCount(version.docCount)}. Quelle ${overview.sourceIndex}: ${formatCount(overview.sourceCount)}.`
  ];
  if (comparison === "different") {
    lines.push("Die Zahlen weichen ab. Der Server lehnt die Umschaltung dann ab. Erst einen neuen Reindex ausführen.");
  } else if (comparison === "unknown") {
    lines.push("Eine Zahl konnte nicht gelesen werden. Der Server prüft sie vor dem Umschalten.");
  }
  lines.push("Es wird kein Index gelöscht.");
  return lines.join("\n");
}

export function reindexSummary(result: ReindexResult): string {
  return `Quelle ${result.source}: ${formatCount(result.sourceCount)} Dokumente, Ziel ${result.target}: ${formatCount(result.targetCount)} Dokumente.`;
}

export type IndexErrorView = { kind: "forbidden" | "unauthorized" | "conflict" | "failed"; message: string };

/** Maps request failures to a German text. A 409 keeps the server text, which names both counts. */
export function describeIndexError(error: unknown, action: "load" | "reindex" | "activate"): IndexErrorView {
  if (error instanceof ApiClientError && error.kind === "forbidden") {
    return { kind: "forbidden", message: "Der Suchindex ist Administratoren vorbehalten." };
  }
  if (error instanceof ApiClientError && error.kind === "unauthorized") {
    return { kind: "unauthorized", message: "Sitzung abgelaufen. Bitte erneut anmelden." };
  }
  if (error instanceof ApiClientError && error.kind === "conflict") {
    return { kind: "conflict", message: error.message };
  }
  const base = action === "load" ? "Der Suchindex konnte nicht geladen werden."
    : action === "reindex" ? "Der Reindex ist fehlgeschlagen. Ein halb gefüllter Zielindex kann bestehen bleiben, der Alias ist unverändert."
    : "Die Umschaltung ist fehlgeschlagen. Der Alias kann unverändert sein; Stand prüfen.";
  const detail = error instanceof ApiClientError && error.kind === "validation" ? ` ${error.message}` : "";
  return { kind: "failed", message: base + detail };
}
