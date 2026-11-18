import { expect, test } from "@playwright/test";
import { addFirst, gotoTab, openDemo, routeLength, selectMarket } from "./helpers";

async function addThree(page: import("@playwright/test").Page) {
  await addFirst(page, "Paradeiser");
  await addFirst(page, "Semmeln");
  await addFirst(page, "Hafermilch");
}

test.describe("Einkaufsliste und Route", () => {
  test("drei Produkte ergeben Liste und Route mit passenden Stationen", async ({ page }) => {
    await openDemo(page);
    await addThree(page);
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-count")).toContainText("3");
    await expect(page.getByTestId("list-item")).toHaveCount(3);
    await expect(page.getByTestId("route-path")).toBeAttached();
    expect(await routeLength(page)).toBeGreaterThan(0);
    await expect(page.locator('[data-testid^="route-stop-"]')).toHaveCount(3);
    await expect(page.getByTestId("route-stop-3")).toBeAttached();
    await expect(page.getByTestId("map-list-pin")).toHaveCount(3);
  });

  test("Entfernen berechnet die Route neu", async ({ page }) => {
    await openDemo(page);
    await addThree(page);
    const before = await routeLength(page);
    await gotoTab(page, "liste");
    await page.getByTestId("list-item").first().getByTestId("remove-item").click();
    await expect(page.getByTestId("list-item")).toHaveCount(2);
    await expect(page.locator('[data-testid^="route-stop-"]')).toHaveCount(2);
    await expect.poll(() => routeLength(page)).not.toBe(before);
    await gotoTab(page, "navigation");
    await expect(page.getByTestId("nav-stop-count")).toContainText("von 2");
  });

  test("Mengen-Stepper erhöht und senkt die Stückzahl", async ({ page }) => {
    await openDemo(page);
    await addFirst(page, "Semmeln");
    await gotoTab(page, "liste");
    const item = page.getByTestId("list-item").first();
    await expect(item.getByTestId("qty-value")).toHaveText("1");
    await item.getByTestId("qty-plus").click();
    await item.getByTestId("qty-plus").click();
    await expect(item.getByTestId("qty-value")).toHaveText("3");
    await expect(page.getByTestId("list-count")).toContainText("3 Stück");
    await item.getByTestId("qty-minus").click();
    await expect(item.getByTestId("qty-value")).toHaveText("2");
  });

  test("Leeren zeigt den Leerzustand der Navigation", async ({ page }) => {
    await openDemo(page);
    await addThree(page);
    await gotoTab(page, "liste");
    await page.getByTestId("clear-list").click();
    await expect(page.getByTestId("list-empty")).toBeVisible();
    await expect(page.getByTestId("route-path")).toHaveCount(0);
    await gotoTab(page, "navigation");
    await expect(page.getByTestId("nav-empty")).toBeVisible();
  });

  test("Beispielliste lädt Produkte und Route", async ({ page }) => {
    await openDemo(page);
    await gotoTab(page, "liste");
    await page.getByTestId("load-example").click();
    await expect(page.getByTestId("list-item")).toHaveCount(7);
    await expect(page.getByTestId("list-count")).toContainText("7");
    expect(await routeLength(page)).toBeGreaterThan(0);
  });

  test("Liste bleibt nach Reload erhalten, getrennt je Markt", async ({ page }) => {
    await openDemo(page);
    await addFirst(page, "Semmeln");
    await addFirst(page, "Paradeiser");
    await page.reload();
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-item")).toHaveCount(2);

    await selectMarket(page, "DEMO-SUED");
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-empty")).toBeVisible();
    await addFirst(page, "Kürbiskernöl");
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-item")).toHaveCount(1);

    await page.reload();
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-item")).toHaveCount(1);
    await selectMarket(page, "DEMO-NORD");
    await gotoTab(page, "liste");
    await expect(page.getByTestId("list-item")).toHaveCount(2);
  });
});
