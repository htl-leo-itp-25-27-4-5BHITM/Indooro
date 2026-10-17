import { expect, test } from "@playwright/test";

const store = { id: "store-anchor", storeCode: "SPAR-Leonding-001", name: "SPAR Leonding", street: "Hauptstraße 1", zipCode: "4060", city: "Leonding", country: "AT", latitude: null, longitude: null, notes: null, status: "ACTIVE", region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich" }, activeLayout: null };

const anchorElements = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: 100 + index, type: "anchor", x: 2 + index * 2, y: 3, width: 1, height: 1, label: `Gang ${index + 1} – Anfang`, anchorId: `A${index + 1}`,
}));

const layoutWith = (elements: unknown[]) => ({
  layoutId: "layout-anchor", storeId: store.id, versionNo: 3, status: "ACTIVE", createdAt: "2026-10-10T08:00:00Z", activatedAt: "2026-10-11T09:00:00Z",
  layout: { shopName: store.name, gridSize: { width: 40, height: 60 }, elements: [
    { id: 1, type: "entrance", x: 1, y: 1, width: 3, height: 1, label: "Eingang" },
    ...elements,
  ] },
});

async function mockStore(page: import("@playwright/test").Page, layout: (route: import("@playwright/test").Route) => unknown) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores/store-anchor", (route) => route.fulfill({ json: store }));
  await page.route("**/api/stores/store-anchor/layout/current", (route) => layout(route));
}

test("print sheet shows eight anchor codes on two A4 pages with labels and hint", async ({ page }) => {
  await mockStore(page, (route) => route.fulfill({ json: layoutWith(anchorElements(8)) }));
  await page.goto("/admin/next/stores/anchors/?storeId=store-anchor");

  await expect(page.getByRole("heading", { name: "QR-Codes drucken" })).toBeVisible();
  await expect(page.getByText("8 QR-Codes auf 2 A4-Seiten.")).toBeVisible();
  await expect(page.locator(".anchor-sheet")).toHaveCount(2);
  await expect(page.locator(".anchor-sheet").nth(0).locator(".anchor-card")).toHaveCount(6);
  await expect(page.locator(".anchor-sheet").nth(1).locator(".anchor-card")).toHaveCount(2);
  await expect(page.locator(".anchor-card")).toHaveCount(8);
  await expect(page.getByRole("img", { name: "QR-Code A1: Gang 1 – Anfang" })).toBeVisible();
  await expect(page.getByText("Scannen, um deinen Standort zu setzen")).toHaveCount(8);
  await expect(page.locator(".anchor-card").first().locator(".anchor-store")).toHaveText("SPAR Leonding");
  await expect(page.getByRole("button", { name: "Drucken" })).toBeVisible();

  // Each code encodes the customer URL; the path data must be non-empty.
  const path = await page.locator(".anchor-qr path").first().getAttribute("d");
  expect(path).toMatch(/^M\d+ \d+h1v1h-1z/);
});

test("print sheet without anchors explains how to create them", async ({ page }) => {
  await mockStore(page, (route) => route.fulfill({ json: layoutWith([]) }));
  await page.goto("/admin/next/stores/anchors/?storeId=store-anchor");

  await expect(page.getByRole("status")).toContainText("Keine QR-Anker im aktiven Layout. Im Editor mit dem Werkzeug „QR-Anker“ anlegen.");
  await expect(page.locator(".anchor-sheet")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Drucken" })).toHaveCount(0);
});

test("print sheet reports a failed load and retries without a page reload", async ({ page }) => {
  let calls = 0;
  await mockStore(page, (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 503, json: { error: "Temporär nicht verfügbar" } })
      : route.fulfill({ json: layoutWith(anchorElements(2)) });
  });
  await page.goto("/admin/next/stores/anchors/?storeId=store-anchor");

  await expect(page.getByRole("alert")).toContainText("QR-Codes konnten nicht geladen werden");
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.locator(".anchor-card")).toHaveCount(2);
  expect(calls).toBe(2);
});

test("print sheet denies access when the API answers forbidden", async ({ page }) => {
  await mockStore(page, (route) => route.fulfill({ status: 403, json: { error: "Kein Zugriff" } }));
  await page.goto("/admin/next/stores/anchors/?storeId=store-anchor");

  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  await expect(page.getByRole("button", { name: "Erneut versuchen" })).toHaveCount(0);
});
