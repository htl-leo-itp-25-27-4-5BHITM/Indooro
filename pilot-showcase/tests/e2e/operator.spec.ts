import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const next = (page: Page) => page.getByTestId("operator-next");
const status = (page: Page) => page.getByTestId("operator-status");

test.describe("Betreiber-Simulation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("operator-demo").scrollIntoViewIfNeeded();
  });

  test("zeigt das Simulations-Banner und startet ungeprüft", async ({ page }) => {
    const demo = page.getByTestId("operator-demo");
    await expect(demo).toContainText("Geführte Simulation");
    await expect(demo).toContainText("Schritt 1 von 7");
    await expect(status(page)).toHaveAttribute("data-status", "NONE");
    await expect(next(page)).toBeDisabled();
    await expect(page.getByTestId("operator-prev")).toBeDisabled();
  });

  test("durchläuft alle 7 Schritte: Nicht bereit, Fixes, Bereit", async ({ page }) => {
    const demo = page.getByTestId("operator-demo");

    // 1 Markt anlegen
    await page.getByTestId("operator-create").click();
    await expect(next(page)).toBeEnabled();
    await next(page).click();
    await expect(demo).toContainText("Schritt 2 von 7");
    await next(page).click(); // 2 → 3 Beacons
    await expect(demo).toContainText("Schritt 3 von 7");
    await next(page).click(); // 3 → 4 Produkte
    await expect(demo).toContainText("Schritt 4 von 7");

    // 4 Import
    await expect(next(page)).toBeDisabled();
    await page.getByTestId("operator-import").click();
    await expect(next(page)).toBeEnabled();
    await next(page).click();
    await expect(demo).toContainText("Schritt 5 von 7");

    // 5 Prüfung
    await expect(next(page)).toBeDisabled();
    await page.getByTestId("operator-run-check").click();
    await expect(status(page)).toHaveAttribute("data-status", "RED", { timeout: 15_000 });
    await expect(status(page)).toHaveText(/Nicht bereit/);
    await expect(demo).toContainText("BEACON_MAJOR_MINOR_MISSING");
    await expect(demo).toContainText("PRODUCT_NO_SHELF");
    await expect(next(page)).toBeEnabled();
    await next(page).click();
    await expect(demo).toContainText("Schritt 6 von 7");

    // 6 Fehler beheben – bei offenen blockierenden Befunden kein Weiter
    await expect(next(page)).toBeDisabled();
    await page.getByTestId("operator-fix-BEACON_MAJOR_MINOR_MISSING").click();
    await page.getByTestId("operator-fix-PRODUCT_NO_SHELF").click();
    await expect(next(page)).toBeEnabled();
    await expect(status(page)).not.toHaveAttribute("data-status", "RED");
    await next(page).click();

    // 7 Startklar
    await expect(demo).toContainText("Schritt 7 von 7");
    await expect(status(page)).toHaveText(/^\s*Bereit/);
    await expect(next(page)).toBeDisabled();
  });

  test("optionale Warnung behoben ergibt Status Bereit", async ({ page }) => {
    await page.getByTestId("operator-create").click();
    await next(page).click();
    await next(page).click();
    await next(page).click();
    await page.getByTestId("operator-import").click();
    await next(page).click();
    await page.getByTestId("operator-run-check").click();
    await expect(status(page)).toHaveAttribute("data-status", "RED", { timeout: 15_000 });
    await next(page).click();
    await page.getByTestId("operator-fix-BEACON_MAJOR_MINOR_MISSING").click();
    await page.getByTestId("operator-fix-PRODUCT_NO_SHELF").click();
    await expect(status(page)).not.toHaveAttribute("data-status", "RED");
    const warning = page.getByTestId("operator-fix-SHELF_WITHOUT_PRODUCTS");
    if (await warning.isVisible()) await warning.click();
    await expect(status(page)).toHaveAttribute("data-status", "GREEN");
    await expect(status(page)).toHaveText(/^\s*Bereit\s*$/);
  });

  test("Zurück-Button und Schritt-Navigation funktionieren, Reset setzt zurück", async ({ page }) => {
    const demo = page.getByTestId("operator-demo");
    await page.getByTestId("operator-create").click();
    await next(page).click();
    await expect(demo).toContainText("Schritt 2 von 7");
    await page.getByTestId("operator-prev").click();
    await expect(demo).toContainText("Schritt 1 von 7");
    await expect(page.getByTestId("operator-step-5")).toBeDisabled();
    await next(page).click();
    await page.getByTestId("operator-step-1").click();
    await expect(demo).toContainText("Schritt 1 von 7");

    await page.getByTestId("operator-reset").click();
    await expect(demo).toContainText("Schritt 1 von 7");
    await expect(next(page)).toBeDisabled();
  });

  test("Autoplay lässt sich starten und anhalten", async ({ page }) => {
    const auto = page.getByTestId("operator-autoplay");
    await auto.click();
    await expect(auto).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("operator-demo")).toContainText("Schritt 2 von 7", { timeout: 10_000 });
    await auto.click();
    await expect(auto).toHaveAttribute("aria-pressed", "false");
  });
});
