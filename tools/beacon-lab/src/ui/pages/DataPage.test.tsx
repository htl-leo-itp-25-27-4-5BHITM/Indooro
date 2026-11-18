// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { runImport } from "../../data/import";
import { store } from "../../data/store";
import { DataPage } from "./DataPage";
import { buildRunFromOutcome, guessOrigin } from "./workflow/importRun";
import { seedDemo, WithCampaign } from "./workflow/testHarness";

const CSV = ["t,beaconId,rssi,refX,refY", "0,LAB-B01,-60,5,5", "0.5,LAB-B02,-70,5,5", "1,LAB-B01,-61,5,5", "1.5,LAB-B02,-71,5,5"].join("\n");

beforeEach(async () => {
  await store.clearAll();
});
afterEach(cleanup);

describe("buildRunFromOutcome", () => {
  it("takes samples, references and provenance over unchanged", async () => {
    const outcome = await runImport({ fileName: "lauf.csv", text: CSV, knownBeaconIds: ["LAB-B01", "LAB-B02"] });
    expect(outcome.ok).toBe(true);
    const run = buildRunFromOutcome(outcome, { campaignId: "c1", name: " Lauf 1 ", kind: "stationary", role: "evaluation", origin: "real" });
    expect(run.samples).toBe(outcome.samples);
    expect(run.references).toBe(outcome.references);
    expect(run.provenance).toBe(outcome.provenance);
    expect(run.name).toBe("Lauf 1");
    expect(run.campaignId).toBe("c1");
    expect(run.id).toMatch(/^run-/);
    expect(run.samples.length).toBe(4);
  });

  it("refuses outcomes with blocking errors", async () => {
    const outcome = await runImport({ fileName: "x.csv", text: "a,b\n1,2", knownBeaconIds: [] });
    expect(outcome.ok).toBe(false);
    expect(() => buildRunFromOutcome(outcome, { campaignId: "c", name: "x", kind: "walk", role: "evaluation", origin: "real" })).toThrow();
  });

  it("guesses origin from file name", () => {
    expect(guessOrigin("synthetic-run.csv")).toBe("synthetic");
    expect(guessOrigin("lauf.csv")).toBe("real");
    expect(guessOrigin("lauf.csv", "synthetic")).toBe("synthetic");
  });
});

describe("DataPage", () => {
  it("imports a CSV through the wizard and stores a run", async () => {
    const id = await seedDemo();
    const before = (await store.listRuns(id)).length;
    render(
      <WithCampaign id={id}>
        <DataPage />
      </WithCampaign>,
    );
    const input = await screen.findByTestId("file-input", undefined, { timeout: 3000 });
    const file = new File([CSV], "feld-lauf.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByTestId("detected-format");
    expect(screen.getByTestId("detected-format").textContent).toBe("CSV");
    expect((screen.getByTestId("import-origin") as HTMLSelectElement).value).toBe("real");
    fireEvent.click(screen.getByTestId("import-check"));
    const result = await screen.findByTestId("import-result");
    expect(within(result).getByTestId("import-counts").textContent).toContain("4 Messwerte");
    fireEvent.click(screen.getByTestId("import-accept"));
    await waitFor(async () => expect((await store.listRuns(id)).length).toBe(before + 1));
    const added = (await store.listRuns(id)).find((r) => r.name === "feld-lauf");
    expect(added?.origin).toBe("real");
    expect(added?.provenance.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates a synthetic run", async () => {
    const id = await seedDemo();
    const before = (await store.listRuns(id)).length;
    render(
      <WithCampaign id={id}>
        <DataPage />
      </WithCampaign>,
    );
    fireEvent.click(await screen.findByTestId("synth-generate", undefined, { timeout: 3000 }));
    await waitFor(async () => expect((await store.listRuns(id)).length).toBe(before + 1));
    const runs = await store.listRuns(id);
    expect(runs.some((r) => r.origin === "synthetic" && r.provenance.synthetic?.scenario === "good-coverage")).toBe(true);
  });
});
