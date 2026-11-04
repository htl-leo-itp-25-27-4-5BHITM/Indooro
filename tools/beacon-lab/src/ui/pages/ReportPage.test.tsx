// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { newId } from "../../core/ids";
import { DEFAULT_EVALUATION_OPTIONS, DEFAULT_POSITIONING_CONFIG } from "../../core/defaults";
import { store } from "../../data/store";
import { runPositioning } from "../../positioning/pipeline";
import { OverviewPage } from "./OverviewPage";
import { PlanPage } from "./PlanPage";
import { ReportPage } from "./ReportPage";
import { seedDemo, WithCampaign } from "./workflow/testHarness";

afterEach(cleanup);

describe("ReportPage", () => {
  it("shows an empty state without saved results", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <ReportPage />
      </WithCampaign>,
    );
    expect(await screen.findByText("Noch keine gespeicherten Ergebnisse", undefined, { timeout: 3000 })).toBeTruthy();
  });

  it("renders the report preview for a saved result and reacts to deselecting", async () => {
    const id = await seedDemo();
    const campaign = (await store.getCampaign(id))!;
    const run = (await store.listRuns(id)).find((r) => r.role === "evaluation")!;
    const result = runPositioning({ run, campaign, config: DEFAULT_POSITIONING_CONFIG, options: DEFAULT_EVALUATION_OPTIONS });
    await store.saveResult({ id: newId("res"), campaignId: id, label: "Test-Ergebnis", result });
    render(
      <WithCampaign id={id}>
        <ReportPage />
      </WithCampaign>,
    );
    const preview = await screen.findByTestId("report-preview", undefined, { timeout: 3000 });
    const frame = preview.querySelector("iframe")!;
    expect(frame.getAttribute("srcdoc")).toContain("SYNTHETISCH");
    expect(frame.getAttribute("srcdoc")).toContain(result.configHash);
    fireEvent.click(screen.getByTestId("result-check"));
    await waitFor(() => expect(screen.queryByTestId("report-preview")).toBeNull());
  });
});

describe("OverviewPage and PlanPage", () => {
  it("overview shows status callouts and runs of the demo campaign", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <OverviewPage />
      </WithCampaign>,
    );
    const callouts = await screen.findByTestId("status-callouts", undefined, { timeout: 3000 });
    expect(callouts.textContent).toContain("Maßstab nicht bestätigt");
    expect(callouts.textContent).toContain("nicht kalibriert");
    expect(screen.getByTestId("runs-table").textContent).toContain("Auswertung");
  });

  it("plan page requires a note to confirm the scale", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <PlanPage />
      </WithCampaign>,
    );
    const toggle = await screen.findByRole("switch", { name: /Maßstab vor Ort bestätigt/ }, { timeout: 3000 });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByTestId("scale-save"));
    expect((await screen.findByTestId("scale-error")).textContent).toContain("Notiz");
    expect((await store.getCampaign(id))!.floorPlan.scale.confirmed).toBe(false);
    fireEvent.change(screen.getByTestId("scale-note"), { target: { value: "Regal 4: 10 m = 10 LE" } });
    fireEvent.click(screen.getByTestId("scale-save"));
    await waitFor(async () => expect((await store.getCampaign(id))!.floorPlan.scale.confirmed).toBe(true));
  });
});
