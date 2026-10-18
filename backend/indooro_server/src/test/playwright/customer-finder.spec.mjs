import { expect, test } from "@playwright/test";

const ORIGIN = "http://127.0.0.1:4177";
const CSP_PATTERN = /content security policy|content-security-policy|refused to/i;

const STORES = [
  { id: "store-spar", storeCode: "SPAR-Leonding-001", name: "SPAR Leonding", city: "Leonding", address: "Hauptstraße 1", latitude: 48.27, longitude: 14.25 },
  { id: "store-other", storeCode: "OTHER-002", name: "Testmarkt Zwei", city: "Linz", address: "Teststraße 2", latitude: 48.3, longitude: 14.29 }
];

// Grid 20x12. Anchor E1 sits next to the 310/2 shelf (rotated 45) and far from the 800/1 shelf,
// so walking distance from E1 puts Mehl before Backpulver, while the entrance is the other way round.
const LAYOUT = {
  shopName: "SPAR Leonding",
  gridSize: { width: 20, height: 12 },
  elements: [
    { id: "ent", type: "entrance", x: 0, y: 11, width: 2, height: 1 },
    { id: "e1", type: "anchor", x: 10, y: 1, width: 1, height: 1, anchorId: "E1" },
    { id: "s1", type: "shelf", x: 2, y: 9, width: 6, height: 1, category: "800/1", label: "Gang 4 · links · Backzutaten" },
    { id: "s2", type: "shelf", x: 10, y: 3, width: 3, height: 1, rotation: 45, category: "310/2" },
    { id: "w1", type: "wall", x: 0, y: 6, width: 8, height: 1 }
  ]
};

const PRODUCTS = [
  { id: 1, name: "Backpulver", price: 1.99, layoutCode: "800/1/3/2", storeCode: "SPAR-Leonding-001" },
  { id: 2, name: "Mehl", price: 0.89, layoutCode: "310/2/1/1", storeCode: "SPAR-Leonding-001" },
  { id: 3, name: "Ghost", price: 2.5, layoutCode: "999/9/1/1", storeCode: "SPAR-Leonding-001" }
];

// Installs API mocks and records every request. `api.mode` switches search behaviour: ok | http | network.
async function mockApi(page, { layout = LAYOUT, shopName } = {}) {
  const api = { mode: "ok", searchUrls: [], otherOrigins: [], layoutRequests: 0 };
  const layoutBody = shopName ? { ...layout, shopName } : layout;

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) api.otherOrigins.push(request.url());
  });

  await page.route("**/api/mobile/stores", (route) => route.fulfill({ json: STORES }));
  await page.route("**/api/mobile/stores/*/layout/current", (route) => {
    api.layoutRequests += 1;
    const storeId = route.request().url().split("/stores/")[1].split("/")[0];
    route.fulfill({
      json: { storeId, layoutId: "layout-1", source: "PUBLISHED", fallback: false, layout: layoutBody }
    });
  });
  await page.route("**/api/products/search?*", (route) => {
    const url = route.request().url();
    api.searchUrls.push(url);
    if (api.mode === "http") return route.fulfill({ status: 500, json: { error: "boom" } });
    if (api.mode === "network") return route.abort("failed");
    const q = (new URL(url).searchParams.get("q") ?? "").toLowerCase();
    const matches = PRODUCTS.filter((product) => product.name.toLowerCase().includes(q));
    return route.fulfill({ json: matches });
  });
  return api;
}

function searchCard(page, name) {
  return page.locator("#search-results-panel .result", { hasText: name });
}

async function search(page, text) {
  await page.locator("#search-input").fill(text);
}

function listNames(page) {
  return page.locator("#list-items > li .list-name");
}

const DEVICES = [
  {
    name: "Android Pixel-like",
    viewport: { width: 393, height: 851 },
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    deviceScaleFactor: 2.75
  },
  {
    name: "iPhone-like",
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    deviceScaleFactor: 3
  }
];

for (const device of DEVICES) {
  test.describe(device.name, () => {
    test.use({
      viewport: device.viewport,
      userAgent: device.userAgent,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: device.deviceScaleFactor
    });

    test("search, shelf text and map highlight from a store link", async ({ page }) => {
      const api = await mockApi(page);
      await page.goto("/customer/?store=SPAR-Leonding-001&a=E1");
      await expect(page.locator("#shopNameDisplay")).toHaveText("SPAR Leonding");

      await search(page, "Backpulver");
      const card = searchCard(page, "Backpulver");
      await expect(card).toContainText("Gang 4 · links · Backzutaten");
      await expect(card).toContainText("3. Boden von unten · Position 2");
      await expect(card).toContainText("€ 1,99");

      await card.getByRole("button", { name: "Auf Karte zeigen" }).click();
      await expect(page.getByTestId("shelf-s1")).toHaveClass(/shelf--highlight/);
      await expect(page.getByTestId("start-marker")).toBeAttached();

      expect(api.searchUrls.length).toBeGreaterThan(0);
      for (const url of api.searchUrls) {
        expect(new URL(url).searchParams.get("storeCode")).toBe("SPAR-Leonding-001");
      }
    });

    test("store list first, search only after a store is chosen", async ({ page }) => {
      const api = await mockApi(page);
      await page.goto("/customer/");
      const storeButton = page.getByRole("button", { name: /SPAR Leonding/ });
      await expect(storeButton).toBeVisible();
      await expect(page.locator("#search-input")).toBeHidden();
      await page.waitForLoadState("networkidle");
      expect(api.searchUrls).toEqual([]);

      await storeButton.click();
      await expect(page).toHaveURL(/\?store=SPAR-Leonding-001$/);
      await expect(page.locator("#search-input")).toBeVisible();

      await search(page, "Mehl");
      await expect(searchCard(page, "Mehl")).toBeVisible();
      expect(api.searchUrls.length).toBeGreaterThan(0);
      for (const url of api.searchUrls) {
        expect(new URL(url).searchParams.get("storeCode")).toBe("SPAR-Leonding-001");
      }

      await page.getByRole("button", { name: "Markt wechseln" }).click();
      await expect(page.getByRole("button", { name: /OTHER|Testmarkt Zwei/ })).toBeVisible();
      await expect(page.locator("#search-input")).toBeHidden();
      expect(new URL(page.url()).searchParams.has("store")).toBe(false);
    });

    test("unknown store code shows the store list with a note, not an error page", async ({ page }) => {
      await mockApi(page);
      await page.goto("/customer/?store=NOPE-999&a=E1");
      await expect(page.getByText("Markt „NOPE-999“ nicht gefunden – bitte Markt wählen.")).toBeVisible();
      await expect(page.getByRole("button", { name: /SPAR Leonding/ })).toBeVisible();
      await expect(page.locator("#search-input")).toBeHidden();
      expect(page.url()).toContain("store=NOPE-999");
    });

    test("list follows walking distance from the anchor, done items move last and survive reload", async ({ page }) => {
      await mockApi(page);
      await page.goto("/customer/?store=SPAR-Leonding-001&a=E1");

      await search(page, "Backpulver");
      await searchCard(page, "Backpulver").getByRole("button", { name: "Zur Liste" }).click();
      await expect(searchCard(page, "Backpulver").getByRole("button", { name: "In der Liste" })).toBeDisabled();

      await search(page, "Mehl");
      await searchCard(page, "Mehl").getByRole("button", { name: "Zur Liste" }).click();

      // Backpulver was added first, but Mehl is nearer to the anchor E1.
      await expect(listNames(page)).toHaveText(["Mehl", "Backpulver"]);
      await expect(page.getByTestId("route")).toBeAttached();

      await page
        .locator("#list-items > li", { hasText: "Mehl" })
        .getByRole("button", { name: "Erledigt" })
        .click();
      await expect(listNames(page)).toHaveText(["Backpulver", "Mehl"]);
      await expect(page.locator("#list-items > li").nth(1)).toHaveClass(/is-done/);

      await page.reload();
      await expect(listNames(page)).toHaveText(["Backpulver", "Mehl"]);
      const doneButton = page.locator("#list-items > li").nth(1).getByRole("button", { name: "Erledigt" });
      await expect(doneButton).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("route")).toBeAttached();
    });

    test("search http error and network error show German text and retry works", async ({ page }) => {
      const api = await mockApi(page);
      await page.goto("/customer/?store=SPAR-Leonding-001&a=E1");

      api.mode = "http";
      await search(page, "Backpulver");
      await expect(page.locator("#search-status")).toHaveText("Suche gerade nicht möglich.");
      api.mode = "ok";
      await page.locator("#search-actions").getByRole("button", { name: "Erneut versuchen" }).click();
      await expect(searchCard(page, "Backpulver")).toBeVisible();

      api.mode = "network";
      await search(page, "Mehl");
      await expect(page.locator("#search-status")).toHaveText("Keine Verbindung. Bitte erneut versuchen.");
      api.mode = "ok";
      await page.locator("#search-actions").getByRole("button", { name: "Erneut versuchen" }).click();
      await expect(searchCard(page, "Mehl")).toBeVisible();
    });

    test("map zoom buttons change the zoom label and reset", async ({ page }) => {
      await mockApi(page);
      await page.goto("/customer/?store=SPAR-Leonding-001&a=E1");
      await expect(page.locator("#zoom-label")).toHaveText("100 %");
      await page.getByRole("button", { name: "Vergrößern" }).click();
      await expect(page.locator("#zoom-label")).toHaveText("140 %");
      await page.getByRole("button", { name: "Zurücksetzen" }).click();
      await expect(page.locator("#zoom-label")).toHaveText("100 %");
    });

    test("layout fits 360px without horizontal scroll and no cookies or foreign requests", async ({ page, context }) => {
      const api = await mockApi(page);
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto("/customer/?store=SPAR-Leonding-001&a=E1");

      await search(page, "Backpulver");
      await searchCard(page, "Backpulver").getByRole("button", { name: "Zur Liste" }).click();
      await searchCard(page, "Backpulver").getByRole("button", { name: "Auf Karte zeigen" }).click();
      await expect(page.getByTestId("shelf-s1")).toHaveClass(/shelf--highlight/);
      await page.waitForLoadState("networkidle");

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
      expect(await context.cookies()).toEqual([]);
      expect(api.otherOrigins).toEqual([]);
    });

    test("product without a shelf shows the test-area hint", async ({ page }) => {
      await mockApi(page);
      await page.goto("/customer/?store=SPAR-Leonding-001&a=E1");
      await search(page, "Ghost");
      const card = searchCard(page, "Ghost");
      await expect(card).toContainText("Nicht im Testbereich – bitte Personal fragen");
      await expect(card.getByRole("button", { name: "Auf Karte zeigen" })).toHaveCount(0);
    });

    test("hostile layout and product strings render as text without script execution", async ({ page }) => {
      const attack = "<img src=x onerror=window.__x=1>";
      const hostileLayout = {
        ...LAYOUT,
        shopName: attack,
        elements: LAYOUT.elements.map((el) => (el.id === "s1" ? { ...el, label: attack } : el))
      };
      const cspViolations = [];
      page.on("console", (message) => {
        if (CSP_PATTERN.test(message.text())) cspViolations.push(message.text());
      });
      await page.route("**/api/mobile/stores", (route) => route.fulfill({ json: STORES }));
      await page.route("**/api/mobile/stores/*/layout/current", (route) =>
        route.fulfill({ json: { storeId: "store-spar", layoutId: "layout-1", source: "PUBLISHED", fallback: false, layout: hostileLayout } })
      );
      await page.route("**/api/products/search?*", (route) =>
        route.fulfill({ json: [{ id: 9, name: attack, price: 1, layoutCode: "800/1/3/2" }] })
      );

      const response = await page.goto("/customer/?store=SPAR-Leonding-001&a=E1");
      expect(response.headers()["content-security-policy"]).toContain("script-src 'self'");
      await expect(page.locator("#shopNameDisplay")).toHaveText(attack);
      await search(page, "Hostil");
      await expect(page.locator("#search-results-panel .product-name")).toHaveText(attack);
      await expect(page.locator("#search-results-panel .shelf-text strong")).toHaveText(attack);
      await expect(page.locator("#mapCanvas")).toContainText(attack);
      await expect(page.locator("img[src=x]")).toHaveCount(0);
      expect(await page.evaluate(() => window.__x)).toBeUndefined();
      expect(cspViolations).toEqual([]);
    });
  });
}
