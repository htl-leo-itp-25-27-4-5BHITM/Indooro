import { expect, test } from "@playwright/test";
import { collectErrors, expectNoErrors, loadDemo } from "./helpers";

test.describe("Platzierungssimulation (Modellprognose)", () => {
  test("Demo laden, simulieren, Zusammenfassung, Variante B und Vorschlag", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await page.locator('[data-nav="planning"]').click();
    await expect(page.getByTestId("planning-page")).toBeVisible();
    await expect(page.getByTestId("planning-banner")).toContainText("MODELLPROGNOSE – keine Messung");

    await page.getByTestId("planning-simulate").click();
    await expect(page.getByTestId("planning-summary").getByTestId("stat-tile").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("layer-prognosis")).toBeAttached();
    await expect(page.getByTestId("planning-map")).toBeVisible();
    await expect(page.getByTestId("planning-banner")).toBeVisible();

    // Variante B: Beacon per Klick setzen, Δ-Ansicht
    await page.getByTestId("planning-mode-add").click();
    const svg = page.getByTestId("floorplan-svg");
    const box = (await svg.boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await expect(page.getByTestId("planning-selected")).toContainText("PLAN-1");
    await page.getByTestId("planning-mode-select").click();
    await page.getByTestId("planning-simulate").click();
    await page.getByTestId("planning-view").selectOption("delta");
    await expect(page.getByTestId("planning-delta-text")).toBeVisible({ timeout: 15_000 });

    // Vorschlag (Heuristik)
    await page.getByTestId("planning-suggest").click();
    await expect(page.getByTestId("planning-suggestion-0")).toBeVisible({ timeout: 30_000 });

    // Übernehmen nur mit Bestätigung
    await page.getByTestId("planning-apply").click();
    await expect(page.getByTestId("planning-apply-confirm")).toBeVisible();
    await page.getByTestId("planning-apply-cancel").click();
    await expect(page.getByTestId("planning-apply-confirm")).toHaveCount(0);

    // Export
    const download = page.waitForEvent("download");
    await page.getByTestId("planning-export").click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);

    expectNoErrors(errors);
  });
});
