// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatisticsPage } from "./StatisticsPage";
import { seedDemo, WithCampaign } from "./workflow/testHarness";

afterEach(cleanup);

describe("StatisticsPage", () => {
  it("computes pooled statistics with bracketed intervals for the demo campaign", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <StatisticsPage />
      </WithCampaign>,
    );
    expect(await screen.findByTestId("statistics-page", undefined, { timeout: 3000 })).toBeTruthy();
    fireEvent.click(screen.getByTestId("statistics-compute"));
    const pooled = await screen.findByTestId("statistics-pooled-row", undefined, { timeout: 15000 });
    expect(pooled.textContent).toMatch(/\d+,\d{2} \[\d+,\d{2} – \d+,\d{2}\] LE/);
    expect(pooled.textContent).toMatch(/%\s\[/);
    expect(screen.getByTestId("statistics-table").querySelectorAll("tbody tr").length).toBe(5);
    expect(screen.getByTestId("statistics-track-table")).toBeTruthy();
    expect(screen.getByTestId("statistics-block-definition").textContent).toContain("Zeitblöcke");
    expect(document.body.textContent).toContain("Synthetische Daten");
    expect(document.body.textContent).toContain("Block-Bootstrap");
  }, 30000);

  it("disables computing without a selected run", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <StatisticsPage />
      </WithCampaign>,
    );
    const boxes = (await screen.findAllByRole("checkbox")) as HTMLInputElement[];
    boxes.forEach((b) => b.checked && fireEvent.click(b));
    expect((screen.getByTestId("statistics-compute") as HTMLButtonElement).disabled).toBe(true);
  });
});
