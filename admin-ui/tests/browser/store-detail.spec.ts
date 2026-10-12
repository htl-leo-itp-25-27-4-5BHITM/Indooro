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
