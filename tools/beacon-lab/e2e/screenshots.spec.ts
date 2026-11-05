import { expect, test, devices, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLES, collectErrors, expectNoErrors, goTo, loadDemo } from "./helpers";

/**
 * Erzeugt die Screenshots für docs/screenshots/ (Desktop 1440x900 @2x, Mobil Pixel 7 @2x).
 * Läuft in der normalen Suite mit; die Dateien werden bei jedem Lauf neu geschrieben.
 */
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "screenshots");
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage, animations: "disabled" });
}

test.describe("Screenshots @screenshots", () => {
  test("Desktop-Ansichten", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = collectErrors(page);

    await loadDemo(page);
    await page.goto("/");
    await expect(page.getByTestId("campaign-list")).toBeVisible();
    await shot(page, "campaigns");

    await page.getByTestId("campaign-link").first().click();
    await expect(page.getByTestId("status-callouts")).toBeVisible();
    await shot(page, "overview");

    await goTo(page, "plan");
    await expect(page.getByTestId("layer-beacons")).toBeVisible();
    await shot(page, "plan");

    // Importergebnis
    await goTo(page, "data");
    await page.getByTestId("import-wizard").getByTestId("file-input").setInputFiles(join(SAMPLES, "synthetic-example-long-format.csv"));
    await page.getByTestId("import-name").fill("Beispiel-Import (synthetisch)");
    await page.getByTestId("import-origin").selectOption("synthetic");
    await page.getByTestId("import-check").click();
    await expect(page.getByTestId("import-result")).toBeVisible();
    await page.getByTestId("import-result").scrollIntoViewIfNeeded();
    await shot(page, "data-import-result");

    await goTo(page, "signals");
    const sel = page.getByTestId("signals-beacon-select");
    const vals = await sel.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
    await sel.selectOption(vals.find((v) => v !== "__all__" && v !== "") ?? vals[1]);
    await expect(page.getByTestId("signals-stats")).toBeVisible();
    await shot(page, "signals");

    await goTo(page, "calibration");
    const boxes = page.getByTestId("calibration-run-list").locator("input[type=checkbox]");
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await page.getByTestId("calibration-run").click();
    await expect(page.getByTestId("calibration-result")).toBeVisible();
    await shot(page, "calibration");

    await goTo(page, "positioning");
    await page.locator("#pos-algorithm").selectOption("weighted-centroid");
    await page.getByTestId("compute").click();
    await expect(page.getByTestId("metrics-grid")).toBeVisible();
    await page.getByTestId("save-result").click();
    await expect(page.getByTestId("saved-msg")).toBeVisible();
    await shot(page, "positioning");

    await goTo(page, "compare");
    await page.getByTestId("compare-run").click();
    await expect(page.getByTestId("compare-results")).toBeVisible();
    await page.getByTestId("compare-metrics-table").scrollIntoViewIfNeeded();
    await shot(page, "compare");

    await goTo(page, "heatmaps");
    await page.getByTestId("heatmap-mode").selectOption("idw");
    await expect(page.getByTestId("layer-heatmap")).toHaveAttribute("data-mode", "idw");
    await shot(page, "heatmap-idw");

    await goTo(page, "replay");
    await expect(page.getByTestId("replay")).toBeVisible();
    for (let i = 0; i < 12; i++) await page.getByRole("button", { name: "Eine Epoche vor" }).click();
    await shot(page, "replay");

    await goTo(page, "report");
    const check = page.getByTestId("result-check").first();
    if (!(await check.isChecked())) await check.check();
    await expect(page.getByTestId("report-preview").locator("iframe")).toBeVisible();
    await shot(page, "report");

    expectNoErrors(errors);
    await ctx.close();
  });

  test("Mobile Ansichten", async ({ browser }) => {
    const ctx = await browser.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = collectErrors(page);
    await loadDemo(page);
    await shot(page, "mobile-overview");
    await goTo(page, "positioning");
    await page.getByTestId("compute").click();
    await expect(page.getByTestId("metrics-grid")).toBeVisible();
    await page.getByTestId("metrics-grid").scrollIntoViewIfNeeded();
    await shot(page, "mobile-positioning");
    expectNoErrors(errors);
    await ctx.close();
  });
});
