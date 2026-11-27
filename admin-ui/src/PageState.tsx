import type { ReactNode } from "react";
import { ApiClientError } from "./api/client";

/** Never render transport payloads or exception details in page states. */
export function describeError(error: unknown, fallback = "Die Daten konnten nicht geladen werden. Bitte versuche es erneut."): string {
  if (!(error instanceof ApiClientError)) return fallback;
  if (error.status === 404) return "Die angefragten Daten wurden nicht gefunden. Vielleicht wurden sie inzwischen entfernt.";
  if (error.kind === "forbidden") return "Für diese Daten fehlt dir die Berechtigung. Bitte wende dich an deine Administration.";
  if (error.kind === "unauthorized") return "Sitzung abgelaufen. Bitte erneut anmelden.";
  if (error.kind === "network") return "Die Verbindung zum Server ist unterbrochen. Bitte prüfe deine Internetverbindung.";
  if (error.kind === "server") return "Serverfehler. Bitte später erneut versuchen.";
  if (error.kind === "invalid-response") return error.message;
  if (error.kind === "validation" || error.kind === "conflict") return error.message;
  return fallback;
}

export function LoadingState({ children }: { children: ReactNode }) {
  return <div className="notice loading-state" role="status" aria-live="polite"><span className="state-spinner" aria-hidden="true" />{children}</div>;
}

export function ErrorState({ message, onRetry, title = "Daten konnten nicht geladen werden", action, headingLevel = 2 }: { message: string; onRetry: () => void; title?: string; action?: ReactNode; headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return <section className="notice error-state page-error" role="alert"><Heading>{title}</Heading><p>{message}</p><button className="button primary" type="button" onClick={onRetry}>Erneut versuchen</button>{action}</section>;
}
