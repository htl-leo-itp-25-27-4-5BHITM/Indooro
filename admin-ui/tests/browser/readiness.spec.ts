import { expect, test } from "@playwright/test";

const adminUser = { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null };
const store = { storeCode: "LINZ-01", name: "Indooro Linz" };

const redReport = {
  storeId: "store-1", layoutId: "layout-1", layoutVersionNo: 3, radius: 8, status: "RED", blockingCount: 2, warningCount: 1,
  counts: { shelves: 12, entrances: 1, products: 340, placedBeacons: 4, assignedBeacons: 5, walkableCells: 300, lowCoverageCells: 12 },
  findings: [
    { severity: "WARNING", code: "BEACON_NOT_PLACED", message: "Beacon zugewiesen, aber nicht platziert.", elementId: null, productId: null, layoutCode: null, beaconCode: "B-002" },
    { severity: "BLOCKING", code: "PRODUCT_WITHOUT_SHELF", message: "Produkt hat keinen passenden Regalplatz.", elementId: null, productId: 42, layoutCode: "31/1/1/1", beaconCode: null },
    { severity: "BLOCKING", code: "SHELF_WITHOUT_LABEL", message: "Zielregal ohne Bezeichnung.", elementId: "17", productId: null, layoutCode: null, beaconCode: null }
  ]
};

const greenReport = {
  storeId: "store-1", layoutId: "layout-1", layoutVersionNo: 3, radius: 8, status: "GREEN", blockingCount: 0, warningCount: 0,
  counts: { shelves: 12, entrances: 1, products: 340, placedBeacons: 9, assignedBeacons: 9, walkableCells: 300, lowCoverageCells: 0 },
  findings: []
};

test("readiness page shows a red summary, grouped findings and a Markdown fallback when the clipboard is unavailable", async ({ page }) => {
  // Without a clipboard API the page must show the export text for manual copying.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });
  const radii: string[] = [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: adminUser }));
  await page.route("**/api/stores/store-1", (route) => route.fulfill({ json: store }));
  await page.route("**/api/stores/store-1/readiness?*", (route) => {
    radii.push(new URL(route.request().url()).searchParams.get("radius") ?? "");
    return route.fulfill({ json: redReport });
  });

  await page.goto("/admin/next/stores/readiness/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Pilot-Bereitschaft" })).toBeVisible();
  await expect(page.getByText("Nicht bereit", { exact: true })).toBeVisible();
  await expect(page.getByText("Blockierend: 2 · Warnungen: 1")).toBeVisible();
  expect(radii).toEqual(["8"]);

  await expect(page.getByRole("heading", { name: "Blockierend (2)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Warnungen (1)" })).toBeVisible();
  const productItem = page.getByRole("listitem").filter({ hasText: "Produkt hat keinen passenden Regalplatz." });
  await expect(productItem.getByRole("link", { name: "Produkt suchen" })).toHaveAttribute("href", "/admin/next/products/?q=42");
  const elementItem = page.getByRole("listitem").filter({ hasText: "Zielregal ohne Bezeichnung." });
  await expect(elementItem.getByRole("link", { name: "Im Editor öffnen" })).toHaveAttribute("href", "/admin/next/editor/?storeId=store-1&elementId=17");

  await page.getByRole("button", { name: "Als Markdown kopieren" }).click();
  await expect(page.getByText("Die Zwischenablage ist nicht verfügbar", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Markdown zum Kopieren")).toHaveValue(/## Blockierend \(2\)/);

  await page.getByLabel("Beacon-Radius in Metern").fill("40");
  await page.getByRole("button", { name: "Prüfen" }).click();
  await expect(page.getByRole("alert")).toContainText("Der Radius muss zwischen 0,5 und 30 Metern liegen.");
  expect(radii).toEqual(["8"]);
  await page.getByLabel("Beacon-Radius in Metern").fill("12.5");
  await page.getByRole("button", { name: "Prüfen" }).click();
  await expect.poll(() => radii.at(-1)).toBe("12.5");
});

test("ready store shows a green summary and copies the Markdown checklist", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "copiedMarkdown", { value: [], writable: true });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => { (window as unknown as { copiedMarkdown: string[] }).copiedMarkdown.push(text); } },
      configurable: true
    });
  });
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "region", email: null, role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich", storeId: null, storeName: null } } }));
  await page.route("**/api/stores/store-1", (route) => route.fulfill({ json: store }));
  await page.route("**/api/stores/store-1/readiness?*", (route) => route.fulfill({ json: greenReport }));

  await page.goto("/admin/next/stores/readiness/?storeId=store-1");
  await expect(page.getByText("Bereit", { exact: true })).toBeVisible();
  await expect(page.getByText("Keine blockierenden Punkte.")).toBeVisible();
  await expect(page.getByText("Keine Warnungen.")).toBeVisible();

  await page.getByRole("button", { name: "Als Markdown kopieren" }).click();
  await expect(page.getByText("Markdown in die Zwischenablage kopiert.")).toBeVisible();
  const copied = await page.evaluate(() => (window as unknown as { copiedMarkdown: string[] }).copiedMarkdown);
  expect(copied).toHaveLength(1);
  expect(copied[0]).toContain("Ampel: Bereit (Grün)");
  expect(copied[0]).toContain("Blockierend: 0");
  expect(copied[0]).not.toContain("- [ ]");
});

test("readiness page explains a forbidden market and offers no retry", async ({ page }) => {
  let readinessCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-2", username: "region", email: null, role: "region-manager", scope: { regionId: "region-2", regionName: "Wien", storeId: null, storeName: null } } }));
  await page.route("**/api/stores/foreign-store", (route) => route.fulfill({ status: 403, json: { error: "Forbidden" } }));
  await page.route("**/api/stores/foreign-store/readiness?*", (route) => {
    readinessCalls += 1;
    return route.fulfill({ status: 403, json: { error: "Forbidden" } });
  });

  await page.goto("/admin/next/stores/readiness/?storeId=foreign-store");
  const alert = page.getByRole("alert");
  await expect(alert.getByRole("heading", { name: "Zugriff verweigert" })).toBeVisible();
  await expect(alert).toContainText("Kein Zugriff auf diesen Markt.");
  await expect(page.getByRole("button", { name: "Erneut versuchen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Als Markdown kopieren" })).toHaveCount(0);
  expect(readinessCalls).toBe(1);
});

test("readiness page shows beacon registry findings with a link to the beacon admin", async ({ page }) => {
  const report = {
    ...greenReport, status: "RED", blockingCount: 2,
    findings: [
      { severity: "BLOCKING", code: "BEACON_UUID_ALL_ZERO", message: "Registriertes Beacon Indooro5 hat die UUID 00000000000000000000000000000000; die App kann es nie erkennen.", elementId: null, productId: null, layoutCode: null, beaconCode: "Indooro5" },
      { severity: "BLOCKING", code: "LAYOUT_BEACON_NOT_REGISTERED", message: "Beacon im Layout (…1c17 1/17) ist der Filiale nicht registriert; die App erhält es nicht.", elementId: "b1", productId: null, layoutCode: null, beaconCode: null }
    ]
  };
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: adminUser }));
  await page.route("**/api/stores/store-1", (route) => route.fulfill({ json: store }));
  await page.route("**/api/stores/store-1/readiness?*", (route) => route.fulfill({ json: report }));

  await page.goto("/admin/next/stores/readiness/?storeId=store-1");
  await expect(page.getByText("2 Abweichungen zwischen Registrierung und Layout")).toBeVisible();
  const zeroItem = page.getByRole("listitem").filter({ hasText: "00000000000000000000000000000000" });
  await expect(zeroItem.getByRole("link", { name: "Beacons verwalten" })).toHaveAttribute("href", "/admin/next/beacons/");
  const layoutItem = page.getByRole("listitem").filter({ hasText: "nicht registriert" });
  await expect(layoutItem.getByRole("link", { name: "Im Editor öffnen" })).toBeVisible();
  await expect(layoutItem.getByRole("link", { name: "Beacons verwalten" })).toHaveCount(0);
});

test("readiness page says consistent only when there are beacons to compare", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: adminUser }));
  await page.route("**/api/stores/store-1", (route) => route.fulfill({ json: store }));
  await page.route("**/api/stores/store-1/readiness?*", (route) => route.fulfill({ json: greenReport }));
  await page.goto("/admin/next/stores/readiness/?storeId=store-1");
  await expect(page.getByText("Registrierung und Layout stimmen überein")).toBeVisible();
});
