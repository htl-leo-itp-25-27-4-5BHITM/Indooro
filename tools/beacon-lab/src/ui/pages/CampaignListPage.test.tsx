// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { store } from "../../data/store";
import { LabProvider } from "../state/LabContext";
import { CampaignListPage } from "./CampaignListPage";

beforeEach(async () => {
  await store.clearAll();
  window.location.hash = "#/";
});
afterEach(cleanup);

describe("CampaignListPage", () => {
  it("shows the empty state, loads the demo campaign and lists it", async () => {
    render(
      <LabProvider>
        <CampaignListPage />
      </LabProvider>,
    );
    expect(await screen.findByText("Noch keine Messkampagne")).toBeTruthy();
    fireEvent.click(screen.getByTestId("load-demo"));
    await waitFor(() => expect(window.location.hash).toContain("/c/"));
    const link = await screen.findByTestId("campaign-link");
    expect(link.textContent).toContain("Demo-Kampagne");
    expect((await store.listCampaigns()).length).toBe(1);
  });

  it("creates a new campaign with the fictional demo plan", async () => {
    render(
      <LabProvider>
        <CampaignListPage />
      </LabProvider>,
    );
    fireEvent.click(await screen.findByTestId("new-campaign"));
    const save = screen.getByTestId("campaign-save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("campaign-name"), { target: { value: "Testmarkt" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(async () => expect((await store.listCampaigns()).map((c) => c.name)).toEqual(["Testmarkt"]));
    const c = (await store.listCampaigns())[0];
    expect(c.pathLoss.source).toBe("default");
    expect(c.floorPlan.scale.confirmed).toBe(false);
    expect(c.beacons.length).toBeGreaterThan(0);
  });
});
