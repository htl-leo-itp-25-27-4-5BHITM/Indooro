import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const sections = ["top", "problem", "demo", "so-funktionierts", "betreiber", "projektstand", "pilot", "kontakt"];

async function audit(page: Page, info: TestInfo, state: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  await info.attach(`${state}-axe`, { body: JSON.stringify(results, null, 2), contentType: "application/json" });
  const violations = results.violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(violations, `${state}: ${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, reducedMotion: "reduce" });
    test.setTimeout(120_000);

    for (const section of sections) {
      test(`section #${section}`, async ({ page }, info) => {
        await page.goto(`/?ansicht=2d#${section}`);
        await page.locator(`#${section}`).scrollIntoViewIfNeeded();
        await expect(page.locator(`#${section}`)).toBeInViewport();
        await audit(page, info, section);
      });
    }

    test("shopping and navigation panels", async ({ page }, info) => {
      await page.goto("/?ansicht=2d#demo");
      await page.getByTestId("search-input").fill("Milch");
      await expect(page.getByTestId("search-result").first()).toBeVisible();
      await audit(page, info, "search-results");
      await page.getByTestId("tab-liste").click();
      await expect(page.getByTestId("load-example")).toBeVisible();
      await audit(page, info, "empty-list");
      await page.getByTestId("load-example").click();
      await audit(page, info, "filled-list");
      await page.getByTestId("tab-navigation").click();
      await expect(page.getByTestId("nav-start")).toBeVisible();
      await audit(page, info, "navigation");
    });

    test("second market", async ({ page }, info) => {
      await page.goto("/?markt=DEMO-SUED&ansicht=2d#demo");
      await page.locator("#demo").scrollIntoViewIfNeeded();
      await expect(page.locator('[data-testid="market-switch"][data-market-code="DEMO-SUED"]')).toHaveAttribute("aria-checked", "true");
      await audit(page, info, "second-market");
    });

    test("keyboard can skip navigation and reach result actions", async ({ page }) => {
      await page.goto("/?ansicht=2d");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Zum Hauptinhalt" })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toBeFocused();
      const input = page.getByTestId("search-input");
      await input.fill("Milch");
      await input.press("ArrowDown");
      await input.press("Enter");
      await input.press("Tab"); // Clear search.
      await page.keyboard.press("Tab"); // First result's map action.
      await expect(page.getByTestId("search-result").first().getByRole("button", { name: /auf der Karte zeigen/ })).toBeFocused();
      await page.keyboard.press("Tab");
      const add = page.getByTestId("search-result").first().getByTestId("add-button");
      await expect(add).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(add).toHaveAttribute("aria-pressed", "true");
    });

    test("all operator stages", async ({ page }, info) => {
      await page.goto("/?ansicht=2d#betreiber");
      await page.getByTestId("operator-create").click();
      for (let step = 1; step <= 7; step++) {
        await expect(page.getByTestId("operator-demo")).toContainText(`Schritt ${step} von 7`);
        if (step === 4) await page.getByTestId("operator-import").click();
        if (step === 5) {
          await page.getByTestId("operator-run-check").click();
          await expect(page.getByTestId("operator-status")).toHaveAttribute("data-status", "RED", { timeout: 15_000 });
        }
        await audit(page, info, `operator-${step}`);
        if (step === 6) {
          await page.getByTestId("operator-fix-BEACON_MAJOR_MINOR_MISSING").click();
          await page.getByTestId("operator-fix-PRODUCT_NO_SHELF").click();
          await audit(page, info, "operator-fixed");
        }
        if (step < 7) await page.getByTestId("operator-next").click();
      }
    });

    test("3D view has an accessible image", async ({ page }, info) => {
      await page.goto("/?ansicht=3d#demo");
      const canvas = page.getByTestId("store-3d-canvas");
      await expect(canvas).toBeVisible({ timeout: 30_000 });
      await expect(canvas).toHaveRole("img");
      await expect(canvas).toHaveAccessibleName(/3D.*Demomarkt/);
      await audit(page, info, "3d");
    });

    test("tour dialog", async ({ page }, info) => {
      await page.goto("/?ansicht=2d");
      await page.getByTestId("nav-tour").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await audit(page, info, "tour");
    });

    if (viewport.width === 390) {
      test("mobile navigation dialog", async ({ page }, info) => {
        await page.goto("/?ansicht=2d");
        await page.getByTestId("nav-menu-button").click();
        await expect(page.getByRole("dialog", { name: "Navigation", exact: true })).toBeVisible();
        await audit(page, info, "mobile-menu");
      });
    }
  });
}
