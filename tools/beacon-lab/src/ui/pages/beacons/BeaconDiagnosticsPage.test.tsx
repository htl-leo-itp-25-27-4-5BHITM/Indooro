// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createDemoCampaign } from "../../../data/synthetic";
import { BeaconDiagnosticsPage } from "../BeaconDiagnosticsPage";
import { seedDemo, WithCampaign } from "../workflow/testHarness";

afterEach(cleanup);

describe("BeaconDiagnosticsPage (demo campaign)", () => {
  it("renders warnings, computes and lists one row per beacon", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <BeaconDiagnosticsPage />
      </WithCampaign>,
    );
    await screen.findByTestId("beacons-page");
    expect(screen.getByTestId("beacons-uncalibrated").textContent).toContain("Standardwerte");
    expect(screen.getByTestId("beacons-assumptions").textContent).toContain("Pfadverlustmodell");
    fireEvent.click(screen.getByTestId("beacons-compute"));
    await screen.findByTestId("beacons-table", undefined, { timeout: 20000 });
    const { campaign } = createDemoCampaign();
    for (const b of campaign.beacons) expect(screen.getByTestId(`beacons-row-${b.id}`)).toBeTruthy();
    expect(screen.getByTestId("beacons-map")).toBeTruthy();
    expect(screen.getByTestId("beacons-loo-note").textContent).toContain("Algorithmus");
  }, 40000);
});
