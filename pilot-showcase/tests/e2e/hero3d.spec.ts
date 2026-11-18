import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

test.describe("3D hero", () => {
  test("renders the canvas, tour CTA and no page errors", async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator("#top")).toBeVisible();
    await expect(page.getByTestId("hero-cta-demo")).toBeVisible();
    await expect(page.getByTestId("hero-cta-pilot")).toBeVisible();
    const tour = page.getByTestId("hero-cta-tour");
    await expect(tour).toBeVisible();
    if (info.project.name === "desktop") {
      await expect(page.getByTestId("hero-canvas")).toBeAttached({ timeout: 20_000 });
      await expect(page.locator('[data-testid="hero-canvas"] canvas')).toBeAttached();
    }
    await tour.click();
    expect(errors).toEqual([]);
  });

  test("no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#top")).toBeVisible();
    await page.waitForTimeout(800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("reduced motion shows the 2D fallback without a canvas", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.getByTestId("hero-cta-tour")).toBeVisible();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId("hero-canvas")).toHaveCount(0);
    await expect(page.getByTestId("how-panel")).toHaveCount(0);
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
