import { expect, test } from "@playwright/test";

const document = {
  shopName: "Indooro Linz",
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: "entrance-1", type: "entrance", x: 1, y: 1, width: 2, height: 1, label: "Eingang" },
    { id: "shelf-1", type: "shelf", x: 4, y: 4, width: 4, height: 2, label: "Obst", category: "310/1" }
  ]
};

test("new editor saves a draft, reloads it, then activates the same version", async ({ page }) => {
  let current = { layoutId: null as string | null, versionNo: null as number | null, status: "DEFAULT", layout: document };
  let savedPayload: Record<string, unknown> | null = null;
  let activateCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/stores/store-1/layout/editor-context", (route) => route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz" }, currentLayout: current, assignedBeacons: [] } }));
  await page.route("**/api/stores/store-1/layout/versions", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: current.layoutId ? [{ layoutId: current.layoutId, versionNo: current.versionNo, layoutName: current.layout.shopName, status: current.status }] : [] });
    savedPayload = route.request().postDataJSON();
    current = { layoutId: "layout-2", versionNo: 2, status: "DRAFT", layout: savedPayload!.layout as typeof document };
    return route.fulfill({ json: current });
  });
  await page.route("**/api/stores/store-1/layout/versions/layout-2", (route) => route.fulfill({ json: current }));
  await page.route("**/api/stores/store-1/layout/versions/layout-2/activate", (route) => {
    activateCalls += 1;
    current = { ...current, status: "ACTIVE" };
    return route.fulfill({ json: current });
  });

  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("region", { name: "Layout-Editor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  await page.getByRole("textbox", { name: "Filialname" }).fill("Indooro Linz Neu");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();
  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect.poll(() => savedPayload?.activate).toBe(false);
  expect((savedPayload?.layout as typeof document).elements).toHaveLength(2);
  await expect(page.locator(".le-message")).toContainText("Entwurf gespeichert");
  await expect(page).toHaveURL(/layoutId=layout-2/);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Filialname" })).toHaveValue("Indooro Linz Neu");
  await expect(page.getByRole("button", { name: "Veröffentlichen" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect.poll(() => activateCalls).toBe(1);
  await expect(page.locator(".le-message")).toContainText("Layout veröffentlicht");
  expect(current.status).toBe("ACTIVE");
});

test("store-scoped direct link blocks another store before loading editor data", async ({ page }) => {
  let contextRequests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "manager-1", username: "manager", email: null, role: "store-manager", scope: { storeId: "store-1", storeName: "Indooro Linz" } } }));
  await page.route("**/api/stores/store-2/layout/editor-context", (route) => { contextRequests += 1; return route.fulfill({ status: 403 }); });
  await page.goto("/admin/next/editor/?storeId=store-2");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(contextRequests).toBe(0);
});

test("archived store version can be restored unchanged from its direct link", async ({ page }) => {
  const archived = { layoutId: "old-1", versionNo: 1, layoutName: "Earlier map", status: "ARCHIVED", layout: document };
  const active = { ...archived, layoutId: "new-2", versionNo: 2, status: "ACTIVE", layout: { ...document, shopName: "Newer map" } };
  let activatedId: string | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores/store-1/layout/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) return route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz" }, currentLayout: active, assignedBeacons: [] } });
    if (path.endsWith("/versions")) return route.fulfill({ json: [active, archived] });
    if (path.endsWith("/versions/old-1")) return route.fulfill({ json: archived });
    if (path.endsWith("/versions/old-1/activate")) { activatedId = "old-1"; return route.fulfill({ json: { ...archived, status: "ACTIVE" } }); }
    return route.fulfill({ status: 404 });
  });
  await page.route("**/api/mobile/stores/store-1/layout/current", (route) => route.fulfill({ json: { storeId: "store-1", layoutId: activatedId ?? "new-2", source: "ACTIVE", fallback: false, layout: activatedId ? archived.layout : active.layout } }));
  await page.goto("/admin/next/editor/?storeId=store-1&layoutId=old-1");
  await expect(page.getByRole("textbox", { name: "Filialname" })).toHaveValue("Indooro Linz");
  await expect(page.getByRole("button", { name: "Version wieder aktivieren" })).toBeEnabled();
  page.once("dialog", (dialog) => { expect(dialog.message()).toContain("ältere Version"); return dialog.accept(); });
  await page.getByRole("button", { name: "Version wieder aktivieren" }).click();
  await expect.poll(() => activatedId).toBe("old-1");
  await expect(page.getByRole("region", { name: "Aktuell mobiles Layout" })).toContainText("old-1");
  await expect(page.getByRole("button", { name: "Version wieder aktivieren" })).toHaveCount(0);
});
