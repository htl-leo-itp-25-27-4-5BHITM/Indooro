import { expect, test, type Page } from "@playwright/test";

const admin = { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null };

async function loadStoreList(page: Page) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: admin }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: {
    content: [{ id: "store-1", storeCode: "LINZ-1", name: "Indooro Linz", city: "Linz", status: "ACTIVE", region: null, activeBeaconCount: 0, hasActiveLayout: false }],
    page: 0, size: 20, totalElements: 1
  } }));
  await page.goto("/admin/next/stores/");
  await expect(page.getByRole("heading", { name: "Stores" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Store-Ergebnisse" })).toBeVisible();
}

test("shell provides a keyboard skip path and a single current navigation item", async ({ page }) => {
  await loadStoreList(page);

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Zum Hauptinhalt springen" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  expect(await skipLink.evaluate((element) => getComputedStyle(element).outlineColor)).toBe("rgb(0, 95, 115)");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main-content$/);
  await expect(page.locator("main#main-content")).toBeFocused();

  const navigation = page.getByRole("navigation", { name: "Admin Navigation" });
  await expect(navigation.getByRole("link", { name: "Stores" })).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
});

test("shared form, table, and primary-action colors meet WCAG AA text contrast", async ({ page }) => {
  await loadStoreList(page);
  const contrasts = await page.evaluate(() => {
    const rgb = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
    const luminance = (value: string) => rgb(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const background = (element: Element) => {
      let current: Element | null = element;
      while (current) {
        const color = getComputedStyle(current).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    };
    return [".store-filters label", ".store-filters input", ".store-filters button.primary", ".store-results th"]
      .map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing contrast sample ${selector}`);
        const foreground = luminance(getComputedStyle(element).color);
        const back = luminance(background(element));
        return { selector, ratio: (Math.max(foreground, back) + 0.05) / (Math.min(foreground, back) + 0.05) };
      });
  });
  expect(contrasts).toHaveLength(4);
  for (const contrast of contrasts) expect(contrast.ratio, `${contrast.selector} contrast`).toBeGreaterThanOrEqual(4.5);
});
