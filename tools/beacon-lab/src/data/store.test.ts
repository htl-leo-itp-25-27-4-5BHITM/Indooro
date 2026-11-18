import { beforeEach, describe, expect, it } from "vitest";
import type { EvaluationResult } from "../core/types";
import { store, type SavedEvaluation } from "./store";
import { createDemoCampaign } from "./synthetic";

const demo = createDemoCampaign();

function result(runId: string, at: string): EvaluationResult {
  return { runId, computedAt: at } as unknown as EvaluationResult;
}
const saved = (id: string, campaignId: string, runId: string, at = "2026-01-01T00:00:00Z"): SavedEvaluation => ({
  id,
  campaignId,
  label: id,
  result: result(runId, at),
});

describe("IndexedDB store", () => {
  beforeEach(async () => {
    await store.clearAll();
  });

  it("starts empty", async () => {
    expect(await store.listCampaigns()).toEqual([]);
    expect(await store.getCampaign("nope")).toBeUndefined();
    expect(await store.listRuns("nope")).toEqual([]);
  });

  it("saves, reads, updates and lists campaigns", async () => {
    await store.saveCampaign(demo.campaign);
    const other = { ...demo.campaign, id: "c2", name: "Zweite", updatedAt: "2027-01-01T00:00:00.000Z" };
    await store.saveCampaign(other);
    expect(await store.getCampaign(demo.campaign.id)).toEqual(demo.campaign);
    expect((await store.listCampaigns()).map((c) => c.id)).toEqual(["c2", demo.campaign.id]); // newest first
    await store.saveCampaign({ ...demo.campaign, name: "Umbenannt" });
    expect((await store.getCampaign(demo.campaign.id))?.name).toBe("Umbenannt");
    expect(await store.listCampaigns()).toHaveLength(2);
  });

  it("saves runs per campaign and round-trips them losslessly", async () => {
    await store.saveCampaign(demo.campaign);
    for (const r of demo.runs) await store.saveRun(r);
    await store.saveRun({ ...demo.runs[0], id: "foreign", campaignId: "other" });
    const runs = await store.listRuns(demo.campaign.id);
    expect(runs).toHaveLength(demo.runs.length);
    const first = runs.find((r) => r.id === demo.runs[0].id)!;
    expect(first).toEqual(demo.runs[0]);
    expect((await store.getRun("foreign"))?.campaignId).toBe("other");
  });

  it("deletes a single run and its saved evaluations", async () => {
    await store.saveCampaign(demo.campaign);
    await store.saveRun(demo.runs[0]);
    await store.saveRun(demo.runs[1]);
    await store.saveResult(saved("e1", demo.campaign.id, demo.runs[0].id));
    await store.saveResult(saved("e2", demo.campaign.id, demo.runs[1].id));
    await store.deleteRun(demo.runs[0].id);
    expect((await store.listRuns(demo.campaign.id)).map((r) => r.id)).toEqual([demo.runs[1].id]);
    expect((await store.listResults(demo.campaign.id)).map((r) => r.id)).toEqual(["e2"]);
  });

  it("saves, lists and deletes results", async () => {
    await store.saveResult(saved("e1", "c", "r", "2026-01-02T00:00:00Z"));
    await store.saveResult(saved("e0", "c", "r", "2026-01-01T00:00:00Z"));
    expect((await store.listResults("c")).map((r) => r.id)).toEqual(["e0", "e1"]);
    await store.deleteResult("e0");
    expect((await store.listResults("c")).map((r) => r.id)).toEqual(["e1"]);
  });

  it("cascades: deleting a campaign removes its runs and results but not others", async () => {
    await store.saveCampaign(demo.campaign);
    await store.saveCampaign({ ...demo.campaign, id: "keep" });
    for (const r of demo.runs) await store.saveRun(r);
    await store.saveRun({ ...demo.runs[0], id: "keep-run", campaignId: "keep" });
    await store.saveResult(saved("e1", demo.campaign.id, demo.runs[0].id));
    await store.saveResult(saved("e2", "keep", "keep-run"));

    await store.deleteCampaign(demo.campaign.id);

    expect(await store.getCampaign(demo.campaign.id)).toBeUndefined();
    expect(await store.listRuns(demo.campaign.id)).toEqual([]);
    expect(await store.listResults(demo.campaign.id)).toEqual([]);
    expect(await store.getRun(demo.runs[0].id)).toBeUndefined();
    expect((await store.listRuns("keep")).map((r) => r.id)).toEqual(["keep-run"]);
    expect((await store.listResults("keep")).map((r) => r.id)).toEqual(["e2"]);
    expect((await store.listCampaigns()).map((c) => c.id)).toEqual(["keep"]);
  });

  it("survives close and re-open", async () => {
    await store.saveCampaign(demo.campaign);
    await store.close();
    expect((await store.listCampaigns()).map((c) => c.id)).toEqual([demo.campaign.id]);
  });
});
