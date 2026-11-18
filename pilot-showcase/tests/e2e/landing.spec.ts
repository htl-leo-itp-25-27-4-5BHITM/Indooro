import { expect, test } from "@playwright/test";
import { collectErrors, isMobile } from "./helpers";

test.describe("Landing", () => {
  test("zeigt die Hero-Überschrift", async ({ page }) => {
    await page.goto("/");
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).toContainText("Jedes Produkt.");
    await expect(h1).toContainText("Auf direktem Weg.");
  });

  test("Live-Demo-CTA springt zu #demo", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("hero-cta-demo").click();
    await expect(page).toHaveURL(/#demo$/);
    await expect(page.locator("#demo")).toBeInViewport();
  });

  test("Navigationslinks aktualisieren den Hash, Zurück/Vor funktionieren", async ({ page }, info) => {
    test.skip(isMobile(info), "Desktop-Navigation ist auf Mobile ausgeblendet");
    await page.goto("/");
    await page.getByTestId("nav-link-demo").click();
    await expect(page).toHaveURL(/#demo$/);
    await page.getByTestId("nav-link-betreiber").click();
    await expect(page).toHaveURL(/#betreiber$/);
    await expect(page.locator("#betreiber")).toBeInViewport();
    await page.getByTestId("nav-link-pilot").click();
    await expect(page).toHaveURL(/#pilot$/);

    await page.goBack();
    await expect(page).toHaveURL(/#betreiber$/);
    await page.goBack();
    await expect(page).toHaveURL(/#demo$/);
    await page.goForward();
    await expect(page).toHaveURL(/#betreiber$/);
  });

  test("Nav-CTA führt zum Pilot-Bereich", async ({ page }, info) => {
    test.skip(isMobile(info), "CTA ist auf kleinen Viewports ausgeblendet");
    await page.goto("/");
    await page.getByTestId("nav-cta").click();
    await expect(page).toHaveURL(/#pilot$/);
    await expect(page.getByTestId("pilot-section")).toBeInViewport({ ratio: 0.05 });
  });

  test("Mobiles Menü öffnet, navigiert und schließt mit Esc", async ({ page }, info) => {
    test.skip(!isMobile(info), "nur Mobile");
    await page.goto("/");
    const button = page.getByTestId("nav-menu-button");
    const menu = page.locator("#mobile-menu");
    await button.click();
    await expect(menu).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await page.getByTestId("nav-sheet-link-pilot").click();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/#pilot$/);
  });

  test("kein horizontaler Überlauf beim Laden", async ({ page }) => {
    await page.goto("/");
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);
  });

  test("keine Konsolenfehler beim vollständigen Durchscrollen, kein Überlauf danach", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const vh = await page.evaluate(() => window.innerHeight);
    for (let y = 0; y < height; y += Math.round(vh * 0.8)) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" as ScrollBehavior }), y);
      await page.waitForTimeout(40);
    }
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);
    expect(errors).toEqual([]);
  });
});
