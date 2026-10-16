import { expect, test } from "@playwright/test";

const unloadWouldWarn = (page) => page.evaluate(() => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});

test("editor warns for unsaved edits and clears the warning only after a successful save", async ({ page }) => {
  await page.goto("/admin/editor/?storeId=store-1");
  const name = page.locator("#shopName");
  const status = page.locator("#saveStatus");
  expect(await unloadWouldWarn(page)).toBe(false);

  await name.fill("Indooro Linz Draft");
  await expect(status).toHaveText("Ungespeicherte Änderungen");
  expect(await unloadWouldWarn(page)).toBe(true);

  await page.route("**/api/stores/store-1/layout/versions", (route) => route.fulfill({ status: 500 }));
  await page.locator("#saveDraftBtn").click();
  await expect(status).toHaveText("Layout konnte nicht am Server gespeichert werden.");
  expect(await unloadWouldWarn(page)).toBe(true);

  await page.unroute("**/api/stores/store-1/layout/versions");
  await page.route("**/api/stores/store-1/layout/versions", (route) => route.fulfill({ json: { layoutId: "layout-2" } }));
  await page.locator("#saveDraftBtn").click();
  await expect(status).toHaveText("Layout-Draft gespeichert");
  expect(await unloadWouldWarn(page)).toBe(false);

  await name.fill("Changed again");
  await expect(status).toHaveText("Ungespeicherte Änderungen");
  expect(await unloadWouldWarn(page)).toBe(true);
  await name.press("Tab");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(status).toHaveText("Keine ungespeicherten Änderungen");
  expect(await unloadWouldWarn(page)).toBe(false);
});
