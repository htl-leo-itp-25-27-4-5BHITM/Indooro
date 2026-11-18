import { expect, test } from "@playwright/test";
import { collectErrors, expectNoErrors, loadDemo } from "./helpers";

test.describe("Statistik und Mehrlauf-Auswertung", () => {
  test("Demo laden, Läufe wählen, auswerten, gepoolte Zeile mit Konfidenzintervall", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await page.locator('[data-nav="statistics"]').click();
    await expect(page.getByTestId("statistics-page")).toBeVisible();

    // alle Auswertungsläufe sind vorgewählt; Kalibrierungsläufe stehen nicht zur Wahl
    const boxes = page.locator('input[type="checkbox"][data-testid^="statistics-run-"]');
    await expect(boxes).toHaveCount(4);
    await boxes.first().uncheck();
    await boxes.first().check();

    await page.getByTestId("statistics-compute").click();
    const pooled = page.getByTestId("statistics-pooled-row");
    await expect(pooled).toBeVisible({ timeout: 30_000 });
    await expect(pooled).toContainText(/\d+,\d{2} \[\d+,\d{2} – \d+,\d{2}\] LE/);
    await expect(page.getByTestId("statistics-table").locator("tbody tr")).toHaveCount(5);
    await expect(page.getByTestId("statistics-track-table")).toBeVisible();
    await expect(page.getByTestId("statistics-chart")).toBeVisible();
    await expect(page.getByText("Block-Bootstrap").first()).toBeVisible();
    await expect(page.getByText("Synthetische Daten").first()).toBeVisible();

    expectNoErrors(errors);
  });
});
