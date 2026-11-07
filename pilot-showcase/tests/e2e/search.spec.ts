import { expect, test } from "@playwright/test";
import { openDemo, search, selectMarket } from "./helpers";

test.describe("Produktsuche", () => {
  test("Paradeiser findet Tomaten", async ({ page }) => {
    await openDemo(page);
    const results = await search(page, "Paradeiser");
    await expect(results.first()).toContainText("Tomaten");
  });

  test("Tippfehler Joghurd findet Joghurt", async ({ page }) => {
    await openDemo(page);
    const results = await search(page, "Joghurd");
    await expect(results.first()).toBeVisible();
    await expect(results.filter({ hasText: /joghurt/i }).first()).toBeVisible();
  });

  test("Unsinn zeigt den Leerzustand", async ({ page }) => {
    await openDemo(page);
    await search(page, "qwxzyvk");
    await expect(page.getByTestId("search-empty")).toBeVisible();
    await expect(page.getByTestId("search-result")).toHaveCount(0);
  });

  test("Auswahl eines Treffers zeigt den Pin auf der Karte", async ({ page }) => {
    await openDemo(page);
    await expect(page.getByTestId("selected-pin")).toHaveCount(0);
    const results = await search(page, "Paradeiser");
    await results.first().getByRole("button", { name: /auf der Karte zeigen/ }).click();
    const pin = page.getByTestId("selected-pin");
    await expect(pin).toBeAttached();
    await expect(pin).toHaveAttribute("data-product-id", "tomaten");
  });

  test("Sortiment ist je Markt getrennt", async ({ page }) => {
    await openDemo(page);
    // Markt A (Standard): Hafermilch ja, Kürbiskernöl nein
    await expect((await search(page, "Hafermilch")).first()).toContainText("Hafermilch");
    await search(page, "Kürbiskernöl");
    await expect(page.getByTestId("search-empty")).toBeVisible();

    await selectMarket(page, "DEMO-SUED");
    await expect(page).toHaveURL(/markt=DEMO-SUED/);
    await search(page, "Hafermilch");
    await expect(page.getByTestId("search-result").filter({ hasText: "Hafermilch" })).toHaveCount(0);
    const oil = await search(page, "Kürbiskernöl");
    await expect(oil.first()).toContainText("Kürbiskernöl");
  });

  test("?markt=DEMO-SUED wählt Markt B vor", async ({ page }) => {
    await openDemo(page, "?markt=DEMO-SUED");
    await expect(page.locator('[data-testid="market-switch"][data-market-code="DEMO-SUED"]')).toHaveAttribute("aria-checked", "true");
    const oil = await search(page, "Kürbiskernöl");
    await expect(oil.first()).toContainText("Kürbiskernöl");
  });
});
