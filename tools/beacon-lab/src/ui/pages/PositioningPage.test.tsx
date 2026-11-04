// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { store } from "../../data/store";
import { PositioningPage } from "./PositioningPage";
import { seedDemo, WithCampaign } from "./workflow/testHarness";

afterEach(cleanup);

describe("PositioningPage", () => {
  it("computes metrics for the demo evaluation run and saves the result", async () => {
    const id = await seedDemo();
    render(
      <WithCampaign id={id}>
        <PositioningPage />
      </WithCampaign>,
    );
    fireEvent.click(await screen.findByTestId("compute", undefined, { timeout: 3000 }));
    const grid = await screen.findByTestId("metrics-grid");
    const values = Array.from(grid.querySelectorAll('[data-testid="stat-value"]')).map((n) => n.textContent ?? "");
    expect(values.length).toBeGreaterThanOrEqual(13);
    // epochs with truth is a computed positive integer, the median a number with two decimals
    expect(Number(values[0])).toBeGreaterThan(0);
    expect(values[5]).toMatch(/^\d+\.\d{2}$/);
    expect(screen.getByTestId("config-hash").textContent).toMatch(/^[0-9a-f]+$/);
    expect(screen.getByTestId("compute-time")).toBeTruthy();
    // unconfirmed scale -> layout units
    expect(grid.textContent).toContain("LE");

    fireEvent.click(screen.getByTestId("save-result"));
    await waitFor(async () => expect((await store.listResults(id)).length).toBe(1));
    const saved = (await store.listResults(id))[0];
    expect(saved.result.metrics.epochsWithTruth).toBe(Number(values[0]));
  });
});
