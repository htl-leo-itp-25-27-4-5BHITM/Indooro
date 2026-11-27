import { expect, test } from "@playwright/test";
import { gotoTab, openDemo } from "./helpers";

test("empty shopping list offers a working primary action", async ({ page }) => {
  await openDemo(page);
  await gotoTab(page, "liste");
  await expect(page.getByTestId("list-empty")).toContainText("Ihre Einkaufsliste ist leer");
  await page.getByTestId("list-empty").getByRole("button", { name: "Beispielliste laden" }).click();
  await expect(page.getByTestId("list-item").first()).toBeVisible();
});

test("empty search offers a fresh search", async ({ page }) => {
  await openDemo(page);
  await page.getByTestId("search-input").fill("xxxxxxxxxxx");
  await expect(page.getByTestId("search-empty")).toBeVisible();
  await page.getByRole("button", { name: "Neue Suche starten" }).click();
  await expect(page.getByTestId("search-input")).toHaveValue("");
  await expect(page.getByTestId("search-input")).toBeFocused();
});

test("delayed 3D load reserves space", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/assets/Store3DView-*.js", async (route) => { await pending; await route.continue(); });
  await page.goto("/?ansicht=3d");
  await page.locator("#demo").scrollIntoViewIfNeeded();
  await expect(page.getByRole("status", { name: "" }).filter({ hasText: "3D-Ansicht wird geladen" })).toBeVisible();
  release();
  await expect(page.getByTestId("store-3d")).toBeVisible();
});

for (const status of [500, 403]) {
  test(`3D asset ${status} failure retries successfully`, async ({ page }) => {
    let failing = true;
    await page.route("**/assets/Store3DView-*.js", (route) => failing ? route.fulfill({ status, body: "SECRET_EXCEPTION" }) : route.continue());
    await page.goto("/?ansicht=3d");
    await page.locator("#demo").scrollIntoViewIfNeeded();
    await expect(page.getByRole("alert")).toContainText("3D-Ansicht konnte nicht geladen werden");
    await expect(page.locator("body")).not.toContainText("SECRET_EXCEPTION");
    failing = false;
    await page.getByRole("button", { name: "Erneut versuchen" }).click();
    await page.locator("#demo").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("store-3d")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}
