import { expect, test } from "@playwright/test";
import { addFirst, collectErrors, gotoTab, openDemo, routeLength } from "./helpers";

test.describe("Fehlerfälle und Barrierefreiheit", () => {
  test("ungültiges ?markt=XYZ fällt auf den Standardmarkt zurück", async ({ page }) => {
    const errors = collectErrors(page);
    await openDemo(page, "?markt=XYZ");
    await expect(page.locator('[data-testid="market-switch"][data-market-code="DEMO-NORD"]')).toHaveAttribute("aria-checked", "true");
    await addFirst(page, "Paradeiser");
    expect(errors).toEqual([]);
  });

  test("?markt wird unabhängig von der Schreibweise erkannt", async ({ page }) => {
    await openDemo(page, "?markt=demo-sued");
    await expect(page.locator('[data-testid="market-switch"][data-market-code="DEMO-SUED"]')).toHaveAttribute("aria-checked", "true");
  });

  test("localStorage wirft: Demo funktioniert weiter", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => {
        throw new DOMException("quota", "QuotaExceededError");
      };
      Storage.prototype.getItem = () => {
        throw new DOMException("denied", "SecurityError");
      };
    });
    await openDemo(page);
    await addFirst(page, "Paradeiser");
    await addFirst(page, "Semmeln");
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-item")).toHaveCount(2);
    expect(await routeLength(page)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test("beschädigter localStorage-Inhalt wird ignoriert", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      localStorage.setItem("indooro-pilot-demo-list:DEMO-NORD", "{kaputt");
    });
    await openDemo(page);
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-empty")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("reduzierte Bewegung: Demo funktioniert vollständig", async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openDemo(page);
    await gotoTab(page, "liste");
    await page.getByTestId("load-example").click();
    expect(await routeLength(page)).toBeGreaterThan(0);
    await gotoTab(page, "navigation");
    await page.getByTestId("nav-start").click();
    await expect(page.getByTestId("position-marker")).toBeAttached();
    await expect(page.getByTestId("nav-pause")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
