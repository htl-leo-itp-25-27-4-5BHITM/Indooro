import { expect, test } from "@playwright/test";
import { gotoTab, markerPos, openDemo } from "./helpers";

async function prepare(page: import("@playwright/test").Page) {
  await openDemo(page);
  await gotoTab(page, "liste");
  await page.getByTestId("load-example").click();
  await expect(page.getByTestId("list-item")).not.toHaveCount(0);
  await gotoTab(page, "navigation");
}

test.describe("Navigations-Simulation", () => {
  test("Start bewegt die simulierte Position, Pause friert sie ein", async ({ page }) => {
    await prepare(page);
    await expect(page.getByText("Simulierte Position").first()).toBeVisible();
    await expect(page.getByTestId("position-marker")).toHaveCount(0);

    await page.getByTestId("nav-start").click();
    const marker = page.getByTestId("position-marker");
    await expect(marker).toBeAttached();
    const first = await markerPos(marker);
    await expect.poll(async () => JSON.stringify(await markerPos(marker)), { timeout: 8000 }).not.toBe(JSON.stringify(first));

    await page.getByTestId("nav-pause").click();
    await expect(page.getByTestId("nav-resume")).toBeVisible();
    const frozen = await markerPos(marker);
    await page.waitForTimeout(600);
    expect(await markerPos(marker)).toEqual(frozen);

    await page.getByTestId("nav-resume").click();
    await expect.poll(async () => JSON.stringify(await markerPos(marker)), { timeout: 8000 }).not.toBe(JSON.stringify(frozen));
  });

  test("Nächstes Ziel springt weiter, Zurücksetzen kehrt in den Ruhezustand zurück", async ({ page }) => {
    await prepare(page);
    const count = page.getByTestId("nav-stop-count");
    await expect(count).toContainText("1 von");
    await page.getByTestId("nav-next").click();
    await expect(count).toContainText("2 von");

    await page.getByTestId("nav-reset").click();
    await expect(count).toContainText("1 von");
    await expect(page.getByTestId("nav-start")).toBeVisible();
    await expect(page.getByTestId("nav-reset")).toBeDisabled();
  });

  test("Schieberegler verschiebt die Position", async ({ page }) => {
    await prepare(page);
    const slider = page.getByTestId("nav-scrubber");
    await slider.evaluate((el: HTMLInputElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(el, "300");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const marker = page.getByTestId("position-marker");
    await expect(marker).toBeAttached();
    const a = await markerPos(marker);
    await slider.evaluate((el: HTMLInputElement) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(el, "800");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect.poll(async () => JSON.stringify(await markerPos(marker))).not.toBe(JSON.stringify(a));
    await expect(slider).toHaveValue("800");
  });

  test("Tastatur: Schieberegler per Pfeiltaste", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Tastaturtest nur Desktop");
    await prepare(page);
    const slider = page.getByTestId("nav-scrubber");
    await slider.focus();
    await page.keyboard.press("End");
    await expect(slider).toHaveValue("1000");
    await expect(page.getByTestId("nav-stop-count")).toContainText("von");
  });
});
