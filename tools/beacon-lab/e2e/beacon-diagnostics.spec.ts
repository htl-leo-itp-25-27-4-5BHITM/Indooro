import { expect, test } from "@playwright/test";
import { collectErrors, expectNoErrors, loadDemo } from "./helpers";

test("Beacon-Diagnose: Demo laden, berechnen, Tabelle zeigt alle Beacons", async ({ page }) => {
  const errors = collectErrors(page);
  await loadDemo(page);
  await page.locator('[data-nav="beacons"]').click();
  await expect(page.getByTestId("beacons-page")).toBeVisible();
  await expect(page.getByTestId("beacons-uncalibrated")).toBeVisible();
  await page.getByTestId("beacons-compute").click();
  await expect(page.getByTestId("beacons-table")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("beacons-map")).toBeVisible();
  const rows = await page.locator('[data-testid^="beacons-row-"]').count();
  expect(rows).toBeGreaterThan(3);
  await expect(page.getByTestId("beacons-export-csv")).toBeVisible();
  expectNoErrors(errors);
});
