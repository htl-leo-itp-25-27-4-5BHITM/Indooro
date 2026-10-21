import { useEffect, useState } from "react";
import type { ApiClient } from "./api/client";
import type { CurrentUser } from "./routes";
import { SETUP_GUIDE_HREF, SETUP_STATUS_LABEL, deriveSetupSteps, loadSetupInput, setupSummary, type SetupInput, type SetupStep } from "./storeSetup";

export interface SetupStore {
  id: string;
  storeCode: string;
  status: string;
  activeLayout: { id: string; versionNo: number } | null;
}

function StepLink({ step, user }: { step: SetupStep; user: CurrentUser }) {
  if (!step.link || step.status === "done") return null;
  if (step.link.adminOnly && user.role !== "admin") return <small>Dafür ist ein Administrator nötig.</small>;
  return <a className="button" href={step.link.href}>{step.link.label}</a>;
}

/** Guided setup checklist of one store. `refreshKey` reloads it after the page changed store data. */
export function StoreSetupSection({ api, user, store, refreshKey }: { api: ApiClient; user: CurrentUser; store: SetupStore; refreshKey: number }) {
  const [input, setInput] = useState<SetupInput | null>(null);
  const { id, storeCode, status, activeLayout } = store;

  useEffect(() => {
    const controller = new AbortController();
    loadSetupInput(api, { id, storeCode, status, activeLayout }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setInput(result); })
      .catch(() => { /* loadSetupInput never rejects; an abort ends here */ });
    return () => controller.abort();
  }, [api, id, storeCode, status, activeLayout, refreshKey]);

  const steps = input ? deriveSetupSteps(input) : null;
  const summary = steps ? setupSummary(steps) : null;
  return <section className="notice detail-section setup-checklist" aria-labelledby="setup-title">
    <div className="section-heading"><h3 id="setup-title">Einrichtung</h3><a className="button" href={SETUP_GUIDE_HREF} target="_blank" rel="noreferrer">Anleitung: Markt einrichten</a></div>
    {!steps || !summary ? <p className="setup-summary" aria-live="polite">Einrichtung wird geprüft …</p> : <>
      <p className="setup-summary" aria-live="polite">{summary.next ? `${summary.done} von ${summary.total} Schritten erledigt. Als Nächstes: ${summary.next.title}.` : `Alle ${summary.total} Schritte erledigt.`}</p>
      <ol className="detail-list setup-steps">{steps.map((step) => <li key={step.id} data-step={step.id} data-status={step.status}>
        <span><strong>{step.title}</strong><small><span className={`setup-status setup-status-${step.status}`}>{SETUP_STATUS_LABEL[step.status]}</span> · {step.detail}</small></span>
        <StepLink step={step} user={user} />
      </li>)}</ol>
    </>}
  </section>;
}
