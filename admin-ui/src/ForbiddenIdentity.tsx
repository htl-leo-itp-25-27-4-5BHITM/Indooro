import { useEffect, useState } from "react";
import type { ApiClient } from "./api/client";
import { CURRENT_IDENTITY_PATH, type CurrentIdentity } from "./accessAssignments";

/**
 * Shown on the forbidden page to a signed-in user without an access assignment: the own Keycloak id (sub)
 * to send to an Indooro admin, who creates the access on the page "Zugänge".
 */
export function ForbiddenIdentity({ api }: { api: ApiClient }) {
  const [identity, setIdentity] = useState<CurrentIdentity | null>(null);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api.get<CurrentIdentity>(CURRENT_IDENTITY_PATH, { signal: controller.signal })
      .then((result) => { if (result?.subject) setIdentity(result); })
      .catch(() => { /* Without identity the page keeps the plain forbidden text. */ });
    return () => controller.abort();
  }, [api]);

  if (!identity) return null;

  async function copy() {
    if (!identity) return;
    try {
      await navigator.clipboard.writeText(identity.subject);
      setCopied("Keycloak-ID kopiert.");
    } catch {
      setCopied("Kopieren nicht möglich. Bitte die ID markieren und kopieren.");
    }
  }

  return <div className="forbidden-identity">
    <p>Angemeldet als <strong>{identity.username ?? identity.subject}</strong>{identity.email ? ` (${identity.email})` : ""}. Für diesen Benutzer ist noch kein Indooro-Zugang eingerichtet.</p>
    <p>Schicken Sie diese Keycloak-ID an einen Indooro-Administrator. Er legt damit unter „Zugänge“ Ihren Zugang an.</p>
    <p><label htmlFor="forbidden-subject">Ihre Keycloak-ID (sub)</label></p>
    <div className="toolbar">
      <input id="forbidden-subject" readOnly value={identity.subject} onFocus={(event) => event.currentTarget.select()} size={Math.min(Math.max(identity.subject.length, 20), 48)} />
      <button type="button" onClick={() => void copy()}>Kopieren</button>
    </div>
    {copied && <p role="status">{copied}</p>}
  </div>;
}
