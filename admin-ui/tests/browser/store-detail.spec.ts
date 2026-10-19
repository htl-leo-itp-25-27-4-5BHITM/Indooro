import { expect, test } from "@playwright/test";

test("store detail preserves a failed edit and refreshes after beacon assignment", async ({ page }) => {
  const store = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz", street: "Hauptstraße 1", zipCode: "4020", city: "Linz", country: "AT", latitude: null, longitude: null, notes: "Alt", status: "ACTIVE", region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich" }, activeLayout: null };
  let failSave = true;
  let assignCount = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [store.region] }));
  await page.route("**/api/stores/store-1", (route) => {
    if (route.request().method() === "PUT") {
      if (failSave) return route.fulfill({ status: 409, json: { error: "Store-Code bereits vorhanden" } });
      Object.assign(store, route.request().postDataJSON());
    }
    return route.fulfill({ json: store });
  });
  await page.route("**/api/stores/store-1/beacons", (route) => route.fulfill({ json: assignCount ? [{ beaconId: "beacon-1", beaconCode: "BC-1", identityKey: "uuid:1:1", assignedAt: "2026-10-11T10:00:00Z" }] : [] }));
  await page.route("**/api/stores/store-1/layout/versions", (route) => route.fulfill({ json: [{ layoutId: "layout-1", versionNo: 2, status: "ACTIVE", layoutName: "Verkaufsfläche", createdAt: "2026-10-10T08:00:00Z", activatedAt: "2026-10-11T09:00:00Z" }] }));
  await page.route("**/api/stores/store-1/audit", (route) => route.fulfill({ json: { entries: [{ id: "audit-1", entityType: "STORE", action: "UPDATED", summary: "Filiale geändert", actorLabel: "Admin", createdAt: "2026-10-11T10:00:00Z" }] } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: assignCount ? [] : [{ id: "beacon-1", beaconCode: "BC-1", identityKey: "uuid:1:1" }] }));
  await page.route("**/api/beacons/beacon-1/assign", (route) => { assignCount += 1; return route.fulfill({ json: { beaconId: "beacon-1" } }); });

  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Indooro Linz" })).toBeVisible();
  await expect(page.getByText("Noch kein aktives Layout")).toBeVisible();
  await expect(page.getByText(/Erstellt am/)).toBeVisible();
  await expect(page.getByText(/STORE · UPDATED · Admin/)).toBeVisible();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Indooro Linz Mitte");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("Store-Code bereits vorhanden");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Indooro Linz Mitte");
  failSave = false;
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name: "Indooro Linz Mitte" })).toBeVisible();
  await page.getByRole("combobox", { name: "Freien Beacon zuordnen" }).selectOption("beacon-1");
  await page.getByRole("button", { name: "Zuordnen" }).click();
  await expect(page.getByText("BC-1", { exact: true })).toBeVisible();
  expect(assignCount).toBe(1);
});

test("store detail exposes empty states and retries a failed load", async ({ page }) => {
  let detailCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores/store-empty", (route) => {
    detailCalls += 1;
    return detailCalls === 1
      ? route.fulfill({ status: 503, json: { error: "Temporär nicht verfügbar" } })
      : route.fulfill({ json: { id: "store-empty", storeCode: "EMPTY", name: "Leerer Store", street: "Testweg 1", zipCode: "4020", city: "Linz", country: "AT", latitude: null, longitude: null, notes: null, status: "ACTIVE", region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich" }, activeLayout: null } });
  });
  await page.route("**/api/regions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-empty/beacons", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-empty/layout/versions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-empty/audit", (route) => route.fulfill({ json: { entries: [] } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));

  await page.goto("/admin/next/stores/detail/?storeId=store-empty");
  await expect(page.getByRole("alert")).toContainText("Store konnte nicht geladen werden");
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByRole("heading", { name: "Leerer Store" })).toBeVisible();
  await expect(page.getByText("Keine Beacons zugeordnet.")).toBeVisible();
  await expect(page.getByText("Keine Änderungen protokolliert.")).toBeVisible();
  expect(detailCalls).toBe(2);
});

test("store detail can be edited and saved with keyboard only", async ({ page }) => {
  const store = { id: "store-keyboard", storeCode: "KEY-01", name: "Keyboard Store", street: "Testweg 1", zipCode: "4020", city: "Linz", country: "AT", latitude: null, longitude: null, notes: null, status: "ACTIVE", region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich" }, activeLayout: null };
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [store.region] }));
  await page.route("**/api/stores/store-keyboard", (route) => {
    if (route.request().method() === "PUT") Object.assign(store, route.request().postDataJSON());
    return route.fulfill({ json: store });
  });
  await page.route("**/api/stores/store-keyboard/beacons", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-keyboard/layout/versions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-keyboard/audit", (route) => route.fulfill({ json: { entries: [] } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));
  await page.goto("/admin/next/stores/detail/?storeId=store-keyboard&edit=1");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toBeVisible();
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  await name.focus();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Keyboard-geändert");
  await page.getByRole("button", { name: "Speichern" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Keyboard-geändert" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Store gespeichert.");
  await expect(page).toHaveURL("/admin/next/stores/detail/?storeId=store-keyboard");
});

function profileStore(readinessProfile: string) {
  return { id: "store-1", storeCode: "TEST-1", name: "Pilotraum Leonding", street: "Schulstraße 1", zipCode: "4060", city: "Leonding", country: "AT", latitude: null, longitude: null, notes: null, status: "ACTIVE", readinessProfile, region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich" }, activeLayout: null };
}

async function mockStoreDetail(page: import("@playwright/test").Page, role: string, store: ReturnType<typeof profileStore>, bodies: Array<Record<string, unknown>>) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "u-1", username: "user", role, scope: role === "admin" ? null : { regionId: "region-1", storeId: "store-1" } } }));
  await page.route("**/api/regions", (route) => route.fulfill({ json: [store.region] }));
  await page.route("**/api/stores/store-1", (route) => {
    if (route.request().method() === "PUT") {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      Object.assign(store, route.request().postDataJSON());
    }
    return route.fulfill({ json: store });
  });
  await page.route("**/api/stores/store-1/beacons", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-1/layout/versions", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/stores/store-1/audit", (route) => route.fulfill({ json: { entries: [] } }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));
}

test("admin sees the coverage profile and can switch the store to the test room profile", async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  await mockStoreDetail(page, "admin", profileStore("market"), bodies);

  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  await expect(page.getByText("Abdeckungsprofil", { exact: true })).toBeVisible();
  await expect(page.getByText("Markt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByRole("combobox", { name: "Abdeckungsprofil" }).selectOption("testroom");
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.getByText("Store gespeichert.")).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].readinessProfile).toBe("testroom");
  await expect(page.getByText("Testraum", { exact: true })).toBeVisible();
});

test("a store manager cannot pick the coverage profile and does not send it", async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  await mockStoreDetail(page, "store-manager", profileStore("testroom"), bodies);

  await page.goto("/admin/next/stores/detail/?storeId=store-1");
  await expect(page.getByText("Testraum", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("combobox", { name: "Abdeckungsprofil" })).toHaveCount(0);
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.getByText("Store gespeichert.")).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect("readinessProfile" in bodies[0]).toBe(false);
});
