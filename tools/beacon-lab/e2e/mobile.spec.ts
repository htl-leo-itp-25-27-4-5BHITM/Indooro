import { expect, test } from "@playwright/test";
import { collectErrors, expectNoErrors, goTo, loadDemo, noHorizontalOverflow } from "./helpers";

test.describe("Mobil (Pixel 7)", () => {
  test("Kampagnenliste, Menü und Hauptseiten ohne horizontalen Überlauf", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Messkampagnen" })).toBeVisible();
    await noHorizontalOverflow(page);

    await loadDemo(page);
    await expect(page.getByTestId("status-callouts")).toBeVisible();
    await noHorizontalOverflow(page);

    // Navigationsmenü öffnet und führt zur Zielseite
    const menu = page.getByRole("button", { name: "Navigation öffnen" });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    const nav = page.getByRole("complementary", { name: "Navigation" });
    await expect(nav.locator('[data-nav="data"]')).toBeVisible();
    await nav.locator('[data-nav="data"]').click();
    await expect(page).toHaveURL(/\/data$/);
    await expect(menu).toHaveAttribute("aria-expanded", "false"); // schließt nach Navigation
    await expect(page.getByTestId("run-list")).toBeVisible();
    await noHorizontalOverflow(page);

    // Positionierung nach Berechnung
    await goTo(page, "positioning");
    await page.getByTestId("compute").click();
    await expect(page.getByTestId("metrics-grid")).toBeVisible();
    await noHorizontalOverflow(page);

    // Vergleich
    await goTo(page, "compare");
    await page.getByTestId("compare-run").click();
    await expect(page.getByTestId("compare-results")).toBeVisible();
    await noHorizontalOverflow(page);

    // Bericht (nach Speichern eines Ergebnisses)
    await page.getByTestId("compare-save-all").click();
    await expect(page.getByTestId("compare-saved")).toBeVisible();
    await goTo(page, "report");
    await expect(page.getByTestId("report-preview")).toBeVisible();
    await noHorizontalOverflow(page);

    // weitere Seiten
    for (const p of ["plan", "signals", "heatmaps", "replay", "calibration"]) {
      await goTo(page, p);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForTimeout(300);
      await noHorizontalOverflow(page);
    }
    expectNoErrors(errors);
  });
});
