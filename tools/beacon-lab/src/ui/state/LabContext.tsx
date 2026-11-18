/**
 * Global lab state: campaigns, the active campaign with its runs and saved evaluations.
 * All persistence goes through data/store (IndexedDB, local only). Pages read from `useLab()` and call its actions;
 * they never talk to IndexedDB directly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Campaign, EvaluationResult, MeasurementRun } from "../../core/types";
import { newId } from "../../core/ids";
import { store, type SavedEvaluation } from "../../data/store";
import { createDemoCampaign } from "../../data/synthetic";

export interface LabState {
  ready: boolean;
  error: string | null;
  campaigns: Campaign[];
  campaign: Campaign | null;
  runs: MeasurementRun[];
  results: SavedEvaluation[];
}

export interface LabActions {
  /** load a campaign (runs + results) as the active one; null clears */
  openCampaign(id: string | null): Promise<void>;
  saveCampaign(c: Campaign): Promise<void>;
  deleteCampaign(id: string): Promise<void>;
  /** creates (or replaces) the built-in SYNTHETIC demo campaign and returns its id */
  loadDemoCampaign(): Promise<string>;
  importCampaign(c: Campaign, runs: MeasurementRun[]): Promise<void>;
  saveRun(r: MeasurementRun): Promise<void>;
  deleteRun(id: string): Promise<void>;
  saveResult(label: string, result: EvaluationResult): Promise<SavedEvaluation>;
  deleteResult(id: string): Promise<void>;
}

export type LabContextValue = LabState & LabActions;

const Ctx = createContext<LabContextValue | null>(null);

export function useLab(): LabContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLab must be used inside <LabProvider>");
  return v;
}

/** Convenience: the active campaign, or throws (use only on campaign routes). */
export function useCampaign(): LabContextValue & { campaign: Campaign } {
  const v = useLab();
  if (!v.campaign) throw new Error("no active campaign");
  return v as LabContextValue & { campaign: Campaign };
}

export function LabProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LabState>({ ready: false, error: null, campaigns: [], campaign: null, runs: [], results: [] });

  const refreshList = useCallback(async () => {
    const campaigns = await store.listCampaigns();
    setState((s) => ({ ...s, campaigns }));
  }, []);

  useEffect(() => {
    store
      .listCampaigns()
      .then((campaigns) => setState((s) => ({ ...s, campaigns, ready: true })))
      .catch((e: unknown) => setState((s) => ({ ...s, ready: true, error: `Lokaler Speicher (IndexedDB) nicht verfügbar: ${String(e)}` })));
  }, []);

  const openCampaign = useCallback(async (id: string | null) => {
    if (!id) {
      setState((s) => ({ ...s, campaign: null, runs: [], results: [] }));
      return;
    }
    const [campaign, runs, results] = await Promise.all([store.getCampaign(id), store.listRuns(id), store.listResults(id)]);
    setState((s) => ({ ...s, campaign: campaign ?? null, runs: campaign ? runs : [], results: campaign ? results : [] }));
  }, []);

  const reloadActive = useCallback(async (id: string) => {
    const [campaign, runs, results] = await Promise.all([store.getCampaign(id), store.listRuns(id), store.listResults(id)]);
    setState((s) => (s.campaign?.id === id ? { ...s, campaign: campaign ?? null, runs, results } : s));
  }, []);

  const actions: LabActions = useMemo(
    () => ({
      openCampaign,
      async saveCampaign(c) {
        const updated = { ...c, updatedAt: new Date().toISOString() };
        await store.saveCampaign(updated);
        await refreshList();
        setState((s) => (s.campaign?.id === c.id ? { ...s, campaign: updated } : s));
      },
      async deleteCampaign(id) {
        await store.deleteCampaign(id);
        await refreshList();
        setState((s) => (s.campaign?.id === id ? { ...s, campaign: null, runs: [], results: [] } : s));
      },
      async loadDemoCampaign() {
        const { campaign, runs } = createDemoCampaign();
        await store.deleteCampaign(campaign.id);
        const now = new Date().toISOString();
        await store.saveCampaign({ ...campaign, updatedAt: now });
        for (const r of runs) await store.saveRun(r);
        await refreshList();
        return campaign.id;
      },
      async importCampaign(c, runs) {
        await store.saveCampaign(c);
        for (const r of runs) await store.saveRun({ ...r, campaignId: c.id });
        await refreshList();
      },
      async saveRun(r) {
        await store.saveRun(r);
        await reloadActive(r.campaignId);
      },
      async deleteRun(id) {
        await store.deleteRun(id);
        setState((s) => ({ ...s, runs: s.runs.filter((r) => r.id !== id), results: s.results.filter((x) => x.result.runId !== id) }));
      },
      async saveResult(label, result) {
        const campaignId = state.campaign?.id;
        if (!campaignId) throw new Error("keine aktive Kampagne");
        const saved: SavedEvaluation = { id: newId("res"), campaignId, label, result };
        await store.saveResult(saved);
        setState((s) => ({ ...s, results: [...s.results, saved] }));
        return saved;
      },
      async deleteResult(id) {
        await store.deleteResult(id);
        setState((s) => ({ ...s, results: s.results.filter((x) => x.id !== id) }));
      },
    }),
    [openCampaign, refreshList, reloadActive, state.campaign?.id],
  );

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
