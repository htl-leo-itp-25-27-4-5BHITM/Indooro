import { useEffect, useState } from "react";
import type { ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";

interface AuditLog { id: string; entityType: string; entityId: string | null; action: string; summary: string | null; actorRole: string | null; actorLabel: string | null; createdAt: string }
interface ErrorLog { id: string; statusCode: number; method: string; path: string; message: string; errorType: string | null; stackTrace: string | null; createdAt: string }
interface LogResponse<T> { entries: T[]; limit: number }

function formattedTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("de-AT");
}

export function DiagnosticsPage({ api, user }: { api: ApiClient; user: CurrentUser }) {
  const [audit, setAudit] = useState<AuditLog[] | null>(null);
  const [errors, setErrors] = useState<ErrorLog[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (user.role !== "admin") return;
    const controller = new AbortController();
    setFailure(null);
    Promise.all([
      api.get<LogResponse<AuditLog>>("/api/admin/logs?limit=50", { signal: controller.signal }),
      api.get<LogResponse<ErrorLog>>("/api/admin/error-logs?limit=50", { signal: controller.signal })
    ]).then(([auditResult, errorResult]) => {
      if (controller.signal.aborted) return;
      if (!Array.isArray(auditResult?.entries) || !Array.isArray(errorResult?.entries)) throw new Error("Diagnosedaten sind unvollständig.");
      setAudit(auditResult.entries); setErrors(errorResult.entries);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setFailure(cause instanceof Error ? cause.message : "Diagnosedaten konnten nicht geladen werden."); });
    return () => controller.abort();
  }, [api, user.role, revision]);
  if (user.role !== "admin") return <section className="notice" role="alert"><h2>Zugriff verweigert</h2><p>Diagnose ist Administratoren vorbehalten.</p></section>;
  return <div className="diagnostics-page">
    <div className="page-intro"><div><p className="eyebrow">Betrieb</p><h2>Diagnose</h2><p>Aktuelle Änderungen und Serverfehler der Administration.</p></div><button className="button" onClick={() => { setAudit(null); setErrors(null); setRevision((value) => value + 1); }}>Aktualisieren</button></div>
    {failure && <div className="notice error-state" role="alert"><h3>Diagnose nicht verfügbar</h3><p>{failure}</p><button className="button" onClick={() => setRevision((value) => value + 1)}>Erneut versuchen</button></div>}
    {!failure && (!audit || !errors) && <p className="notice" role="status">Diagnose wird geladen …</p>}
    {!failure && audit && errors && <>
      <section className="notice" aria-label="Änderungsverlauf"><div className="section-heading"><h3>Änderungsverlauf</h3><span>{audit.length} Einträge</span></div>{audit.length === 0 ? <p>Keine Änderungen protokolliert.</p> : <div className="table-scroll"><table><thead><tr><th>Zeit</th><th>Aktion</th><th>Zusammenfassung</th><th>Akteur</th></tr></thead><tbody>{audit.map((entry) => <tr key={entry.id}><td><time dateTime={entry.createdAt}>{formattedTime(entry.createdAt)}</time></td><td>{entry.entityType} · {entry.action}</td><td>{entry.summary || "–"}</td><td>{entry.actorLabel || entry.actorRole || "System"}</td></tr>)}</tbody></table></div>}</section>
      <section className="notice" aria-label="Serverfehler"><div className="section-heading"><h3>Serverfehler</h3><span>{errors.length} Einträge</span></div>{errors.length === 0 ? <p>Keine Serverfehler protokolliert.</p> : <div className="table-scroll"><table><thead><tr><th>Zeit</th><th>Status</th><th>Anfrage</th><th>Fehler</th></tr></thead><tbody>{errors.map((entry) => <tr key={entry.id}><td><time dateTime={entry.createdAt}>{formattedTime(entry.createdAt)}</time></td><td>{entry.statusCode}</td><td>{entry.method} {entry.path}</td><td>{entry.message}{entry.stackTrace && <details><summary>Stacktrace</summary><pre>{entry.stackTrace}</pre></details>}</td></tr>)}</tbody></table></div>}</section>
    </>}
  </div>;
}
