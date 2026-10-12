import { expect, test } from "@playwright/test";

test("candidate root and nested deep link load built assets on direct refresh", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  const failedAssets: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/admin/next/assets/") && !response.ok()) failedAssets.push(response.url());
  });

  const root = await page.goto("/admin/next/");
  expect(root?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin Navigation" })).toBeVisible();

  const stores = await page.goto("/admin/next/stores/");
  expect(stores?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Stores" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Stores" })).toBeVisible();

  const nested = await page.goto("/admin/next/stores/detail/?storeId=example");
  expect(nested?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Indooro Admin" })).toBeVisible();
  expect(failedAssets).toEqual([]);
});

test("candidate navigation follows staff role and offers logout", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "store-manager", email: null, role: "store-manager", scope: { storeId: "store-1", storeName: "Indooro Linz" } } }));
  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  const navigation = page.getByRole("navigation", { name: "Admin Navigation" });
  await expect(navigation.getByRole("link", { name: "Stores" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Stores" })).toHaveAttribute("href", "/admin/next/stores/");
  await expect(navigation.getByRole("link", { name: "Layout Editor" })).toHaveAttribute("href", "/admin/next/editor/?storeId=store-1");
  await expect(navigation.getByRole("link", { name: "Rezepte" })).toHaveCount(0);
  await expect(page.getByText("Indooro Linz")).toBeVisible();
  await expect(page.getByRole("link", { name: "Logout" })).toHaveAttribute("href", "/admin/logout");
  await page.goto("/admin/next/stores/detail/?storeId=store-2");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
});

test("candidate displays session and role denial states", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.goto("/admin/next/");
  await expect(page.getByRole("alert")).toContainText("Sitzung abgelaufen");
  await expect(page.getByRole("link", { name: "Erneut anmelden" })).toHaveAttribute("href", "/admin/");

  await page.unroute("**/api/admin/me");
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "viewer-1", username: "viewer", email: null, role: "viewer", scope: null } }));
  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  await expect(page.getByRole("navigation", { name: "Admin Navigation" }).getByRole("link")).toHaveCount(0);
});

test("dashboard uses scoped backend totals and only admin loads audit activity", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [{ id: "region-1" }, { id: "region-2" }] }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 1, totalElements: route.request().url().includes("hasActiveLayout=false") ? 4 : 26 } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [{ id: "beacon-1" }] }));
  await page.route("**/api/admin/logs?*", (route) => route.fulfill({ json: { entries: [{ id: "event-1", action: "UPDATE", summary: "Layout veröffentlicht", createdAt: "2026-10-11T12:00:00Z" }] } }));
  await page.goto("/admin/next/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const metrics = page.getByRole("region", { name: "Kennzahlen" });
  await expect(metrics).toContainText("26");
  await expect(metrics).toContainText("4");
  await expect(metrics).toContainText("2");
  await expect(page.getByText("Layout veröffentlicht")).toBeVisible();
  await expect(page.getByRole("link", { name: "Layouts prüfen" })).toHaveAttribute("href", "/admin/next/stores/?layout=missing");
});

test("store manager dashboard omits admin activity and recovers from a failed request", async ({ page }) => {
  let fail = true;
  let auditRequests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "manager-1", username: "manager", email: null, role: "store-manager", scope: { storeId: "store-1", storeName: "Indooro Linz" } } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [{ id: "region-1" }] }));
  await page.route("**/api/stores?*", (route) => {
    if (fail) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    return route.fulfill({ json: { content: [], page: 0, size: 1, totalElements: route.request().url().includes("hasActiveLayout=false") ? 0 : 1 } });
  });
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/logs?*", (route) => { auditRequests += 1; return route.fulfill({ json: { entries: [] } }); });
  await page.goto("/admin/next/");
  await expect(page.getByRole("alert")).toContainText("Daten konnten nicht geladen werden");
  fail = false;
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByRole("region", { name: "Kennzahlen" })).toContainText("1");
  await expect(page.getByRole("heading", { name: "Letzte Aktivitäten" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Produkte verwalten" })).toHaveCount(0);
  expect(auditRequests).toBe(0);
});

test("region manager dashboard stays within scoped APIs without admin-only actions", async ({ page }) => {
  let auditRequests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "region-manager", email: null, role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich" } } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [{ id: "region-1" }] }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [], page: 0, size: 1, totalElements: route.request().url().includes("hasActiveLayout=false") ? 1 : 3 } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/logs?*", (route) => { auditRequests += 1; return route.fulfill({ json: { entries: [] } }); });
  await page.goto("/admin/next/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin Navigation" }).getByRole("link", { name: "Regionen" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin Navigation" }).getByRole("link", { name: "Rezepte" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Kennzahlen" })).toContainText("3");
  expect(auditRequests).toBe(0);
});

test("candidate store list keeps server filters and paging in direct links", async ({ page }) => {
  const storeRequests: string[] = [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [{ id: "region-1", code: "AT-OÖ", name: "Oberösterreich" }] }));
  await page.route("**/api/stores?*", (route) => {
    const url = new URL(route.request().url());
    storeRequests.push(url.search);
    return route.fulfill({ json: {
      content: [{ id: "store-21", storeCode: "LINZ-21", name: "Indooro Linz 21", city: "Linz", status: "ACTIVE", region: { id: "region-1", code: "AT-OÖ", name: "Oberösterreich" }, activeBeaconCount: 2, hasActiveLayout: url.searchParams.get("hasActiveLayout") === "true" }],
      page: Number(url.searchParams.get("page")), size: 20, totalElements: 22
    } });
  });
  await page.goto("/admin/next/stores/?query=Linz&regionId=region-1&layout=missing&page=1");
  await expect(page.getByRole("heading", { name: "Stores" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Store-Ergebnisse" })).toContainText("Seite 2 von 2");
  await expect(page.getByRole("link", { name: "Details" })).toHaveAttribute("href", "/admin/next/stores/detail/?storeId=store-21");
  expect(storeRequests.at(-1)).toContain("hasActiveLayout=false");
  expect(storeRequests.at(-1)).toContain("page=1");
  await expect(page.getByRole("link", { name: "Zurück" })).toHaveAttribute("href", "/admin/next/stores/?query=Linz&regionId=region-1&layout=missing");
  await page.getByRole("combobox", { name: "Layout" }).selectOption("ready");
  await page.getByRole("button", { name: "Anwenden" }).click();
  await expect(page).toHaveURL(/layout=ready/);
  await expect(page).not.toHaveURL(/page=1/);
  await expect.poll(() => storeRequests.at(-1)).toContain("hasActiveLayout=true");
});

test("candidate stores exposes empty, load-error, and keyboard retry states", async ({ page }) => {
  let fail = true;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores?*", (route) => fail
    ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
    : route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }));
  await page.goto("/admin/next/stores/");
  await expect(page.getByRole("alert")).toContainText("Stores konnten nicht geladen werden");
  await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();

  fail = false;
  await page.getByRole("button", { name: "Erneut versuchen" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Store-Ergebnisse" })).toContainText("Keine Stores passen zu den Filtern.");

  await page.getByRole("searchbox", { name: "Suche" }).focus();
  await page.keyboard.type("Linz");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Region" })).toBeFocused();
});
