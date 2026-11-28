import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { gotoTab, openDemo, selectMarket } from "../helpers";

const elementScreenshotStyle = fileURLToPath(new URL("./element-screenshot.css", import.meta.url));

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 }
];

// Explicit expectations keep coverage from silently shrinking when the tour changes.
const tourSteps = [
  "willkommen", "problem", "demo-markt", "demo-suche", "demo-treffer", "demo-liste",
  "demo-beispiel", "demo-route", "demo-simulation", "demo-markt-suche", "so-funktionierts",
  "betreiber-intro", "betreiber-demo", "projektstand", "pilot-ablauf", "pilot-kontakt", "ende"
];

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ page }) => {
      // Fixtures are bundled with the app. Each test starts with an isolated browser context
      // and only the config's seen-tour-hint storage entry, so no persisted shopping list leaks in.
      await page.clock.setFixedTime(new Date("2026-01-15T12:00:00Z"));
    });

    test("landing and every anchor section", async ({ page }) => {
      await page.goto("/?ansicht=2d");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page).toHaveScreenshot(`${viewport.width}-landing.png`);

      for (const id of ["top", "problem", "demo", "so-funktionierts", "betreiber", "projektstand", "pilot", "kontakt"]) {
        const section = page.locator(`#${id}`);
        await section.scrollIntoViewIfNeeded();
        await expect(section).toHaveScreenshot(`${viewport.width}-section-${id}.png`, { stylePath: elementScreenshotStyle });
      }
      await expect(page.getByRole("contentinfo")).toHaveScreenshot(`${viewport.width}-footer.png`, { stylePath: elementScreenshotStyle });
    });

    test("search, empty and populated lists, and planned route in both markets", async ({ page }) => {
      await openDemo(page);
      await page.evaluate(() => document.fonts.ready);
      const demo = page.getByTestId("store-demo");
      for (const market of ["DEMO-NORD", "DEMO-SUED"]) {
        await selectMarket(page, market);
        await gotoTab(page, "suche");
        await page.getByTestId("search-input").fill("Paradeiser");
        await expect(page.getByTestId("search-result").first()).toBeVisible();
        await expect(demo).toHaveScreenshot(`${viewport.width}-${market}-search.png`, { stylePath: elementScreenshotStyle });
        await gotoTab(page, "liste");
        await expect(page.getByTestId("list-empty")).toBeVisible();
        await expect(demo).toHaveScreenshot(`${viewport.width}-${market}-empty-list.png`, { stylePath: elementScreenshotStyle });
        await page.getByTestId("load-example").click();
        await expect(page.getByTestId("list-item")).toHaveCount(market === "DEMO-NORD" ? 7 : 6);
        await expect(demo).toHaveScreenshot(`${viewport.width}-${market}-example-list.png`, { stylePath: elementScreenshotStyle });
        await gotoTab(page, "navigation");
        await expect(page.getByTestId("nav-start")).toBeVisible();
        await expect(demo).toHaveScreenshot(`${viewport.width}-${market}-route.png`, { stylePath: elementScreenshotStyle });
      }
    });

    test("all guided tour steps", async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto("/?ansicht=2d");
      await page.evaluate(() => document.fonts.ready);
      await page.getByTestId("nav-tour").click();
      const card = page.getByTestId("tour-card");
      for (const [index, step] of tourSteps.entries()) {
        await expect(card).toHaveAttribute("data-step", step);
        await expect(card).toHaveAttribute("data-busy", "false", { timeout: 15_000 });
        await expect(page.getByTestId("tour-step")).toHaveText(`Schritt ${index + 1} von 17`);
        // The live simulation and operator autoplay intentionally advance with wall time.
        // Hide them beneath the overlay: screenshot masks would also paint over the tour
        // card wherever its rectangle overlaps the dynamic content.
        const style = step === "demo-simulation" || step === "demo-markt-suche"
          ? '[data-testid="store-demo"] { visibility: hidden !important; }'
          : step === "betreiber-demo" ? '[data-testid="operator-demo"] { visibility: hidden !important; }' : "";
        const hiddenContent = style ? await page.addStyleTag({ content: style }) : null;
        await expect(page).toHaveScreenshot(`${viewport.width}-tour-${step}.png`);
        await hiddenContent?.evaluate((element) => element.parentNode?.removeChild(element));
        if (index < tourSteps.length - 1) await page.getByTestId("tour-next").click();
      }
    });

    test("3D store controls and legend around a masked WebGL canvas", async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto("/?ansicht=3d");
      await page.evaluate(() => document.fonts.ready);
      const view = page.getByTestId("store-3d");
      await view.scrollIntoViewIfNeeded();
      // Fail rather than accidentally approving the WebGL fallback as the 3D baseline.
      await expect(page.getByTestId("store-3d-canvas")).toBeVisible({ timeout: 20_000 });
      await expect(view).not.toHaveAttribute("data-fallback", "true");
      await expect(page.getByTestId("store3d-overview")).toBeVisible();
      // CSS masks only the rendered pixels and projected labels. A rectangular Playwright
      // mask on the canvas would also obscure the controls and legend layered above it.
      await page.addStyleTag({ content: `
        [data-testid="store-3d-canvas"],
        [data-testid="store-3d"] > div[aria-hidden="true"].overflow-hidden {
          opacity: 0 !important;
        }
      ` });
      await expect(page.getByTestId("store-demo")).toHaveScreenshot(`${viewport.width}-store-3d.png`, { stylePath: elementScreenshotStyle });
    });
  });
}

test("representative unavailable 3D view", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/assets/Store3DView-*.js", (route) => route.fulfill({ status: 500, body: "Unavailable" }));
  await page.goto("/?ansicht=3d");
  await page.locator("#demo").scrollIntoViewIfNeeded();
  const error = page.getByRole("alert");
  await expect(error).toContainText("3D-Ansicht konnte nicht geladen werden");
  await page.evaluate(() => document.fonts.ready);
  await expect(error).toHaveScreenshot("1440-demo-error.png");
});

test("representative empty shopping list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemo(page);
  await gotoTab(page, "liste");
  const empty = page.getByTestId("list-empty");
  await expect(empty).toContainText("Ihre Einkaufsliste ist leer");
  await page.evaluate(() => document.fonts.ready);
  await expect(empty).toHaveScreenshot("1440-empty-list-state.png", { stylePath: elementScreenshotStyle });
});

for (const viewport of [viewports[0], viewports[2]]) {
  test.describe(`dark ${viewport.width}`, () => {
    test.use({ viewport, colorScheme: "dark" });
    test("landing and store demo", async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-01-15T12:00:00Z"));
      await page.goto("/?ansicht=2d");
      await page.evaluate(() => document.fonts.ready);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page).toHaveScreenshot(`${viewport.width}-dark-landing.png`);
      await openDemo(page);
      await expect(page.getByTestId("store-demo")).toHaveScreenshot(`${viewport.width}-dark-store-demo.png`, { stylePath: elementScreenshotStyle });
    });
  });
}
