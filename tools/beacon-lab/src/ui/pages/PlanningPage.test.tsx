// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { store } from "../../data/store";
import { PlanningPage } from "./PlanningPage";
import { seedDemo, WithCampaign } from "./workflow/testHarness";

afterEach(cleanup);

describe("PlanningPage", () => {
  it("shows the MODELLPROGNOSE banner, simulates, edits variant B and applies it only after confirmation", async () => {
    const id = await seedDemo();
    const before = (await store.getCampaign(id))!;
    const runsBefore = (await store.listRuns(id)).length;
    render(
      <WithCampaign id={id}>
        <PlanningPage />
      </WithCampaign>,
    );
    expect((await screen.findByTestId("planning-page")).textContent).toContain("MODELLPROGNOSE – keine Messung");
    expect(screen.getByTestId("planning-banner")).toBeTruthy();

    fireEvent.click(screen.getByTestId("planning-simulate"));
    const summary = screen.getByTestId("planning-summary");
    await waitFor(() => expect(summary.querySelectorAll('[data-testid="stat-tile"]').length).toBeGreaterThanOrEqual(6), { timeout: 8000 });
    expect(screen.getByTestId("layer-prognosis")).toBeTruthy();

    // select a beacon marker, deactivate it in variant B
    const marker = document.querySelector("[data-beacon-id]") as SVGElement;
    fireEvent.click(marker);
    fireEvent.click(await screen.findByTestId("planning-toggle"));
    expect((screen.getByTestId("planning-apply") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("Prognose veraltet")).toBeTruthy();

    fireEvent.click(screen.getByTestId("planning-apply"));
    expect(document.querySelector('[aria-modal="true"]')!.textContent).toMatch(/beziehen sich auf die alte Anordnung/);
    // nothing written yet
    expect((await store.getCampaign(id))!.beacons).toEqual(before.beacons);
    fireEvent.click(screen.getByTestId("planning-apply-confirm"));
    await waitFor(async () => expect((await store.getCampaign(id))!.beacons.filter((b) => !b.enabled).length).toBe(before.beacons.filter((b) => !b.enabled).length + 1));
    // the prognosis is never stored as a run
    expect((await store.listRuns(id)).length).toBe(runsBefore);
  }, 20000);

  it("computes and lists suggestions", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <PlanningPage />
      </WithCampaign>,
    );
    fireEvent.click(await screen.findByTestId("planning-suggest"));
    const first = await screen.findByTestId("planning-suggestion-0", undefined, { timeout: 15000 });
    fireEvent.click(first);
    expect(screen.getByTestId("planning-selected").textContent).toContain("PLAN-1");
  }, 30000);
});
