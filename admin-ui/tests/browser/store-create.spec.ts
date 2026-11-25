import { expect, test, type Page } from "@playwright/test";
import { fulfillCreated } from "./support/created";

/** Answers the reads of the store detail page, where "Store anlegen" lands. */
async function mockCreatedStore(page: Page, id: string, name: string) {
  const region = { id: "region-1", code: "AT-OOE", name: "Oberösterreich" };
  const store = { id, storeCode: "NEW-01", name, street: "Testweg 1", zipCode: "4020", city: "Linz", country: "AT", latitude: null, longitude: null, notes: null, status: "ACTIVE", region, activeLayout: null };
  await page.route(`**/api/stores/${id}**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith(`/${id}`)) return route.fulfill({ json: store });
    if (path.endsWith("/audit")) return route.fulfill({ json: { entries: [] } });
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/regions", (route) => route.fulfill({ json: [region] }));
  await page.route("**/api/beacons/free", (route) => route.fulfill({ json: [] }));
}

test("region manager creates a scoped store and continues in detail", async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich" } } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: [{ id: "region-1", code: "AT-OOE", name: "Oberösterreich", status: "ACTIVE" }] }));
  await page.route("**/api/stores", (route) => { createdBody = route.request().postDataJSON(); return fulfillCreated(route, "/api/stores/store-new", { id: "store-new", name: createdBody?.name }); });
  await mockCreatedStore(page, "store-new", "Indooro Linz Süd");
  await page.goto("/admin/next/stores/new/");
  await page.getByRole("textbox", { name: "Store-Code" }).fill("LINZ-02");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Indooro Linz Süd");
  await page.getByRole("textbox", { name: "Straße" }).fill("Bahnhofstraße 1");
  await page.getByRole("textbox", { name: "PLZ" }).fill("4020");
  await page.getByRole("textbox", { name: "Ort" }).fill("Linz");
  await page.getByRole("textbox", { name: "Land" }).fill("AT");
  await page.getByRole("button", { name: "Store anlegen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "wurde angelegt" })).toContainText("Indooro Linz Süd");
  await expect(page).toHaveURL(/\/admin\/next\/stores\/detail\/\?storeId=store-new$/);
  expect(createdBody?.regionId).toBe("region-1");
  expect(createdBody?.latitude).toBeNull();
});

test("store manager cannot load store creation data", async ({ page }) => {
  let regionCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "manager", role: "store-manager", scope: { storeId: "store-1" } } }));
  await page.route("**/api/regions**", (route) => { regionCalls += 1; return route.fulfill({ json: [] }); });
  await page.goto("/admin/next/stores/new/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(regionCalls).toBe(0);
});

test("store creation retries region loading and reports an empty region state", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => {
    calls += 1;
    return calls === 1
      ? route.fulfill({ status: 503, json: { error: "Regionen nicht erreichbar" } })
      : route.fulfill({ json: [] });
  });
  await page.goto("/admin/next/stores/new/");
  await expect(page.getByRole("alert")).toContainText("Serverfehler");
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByRole("status")).toContainText("Keine aktiven Regionen vorhanden");
  expect(calls).toBe(2);
});

test("admin creates a store using keyboard controls", async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: [{ id: "region-1", code: "AT-OOE", name: "Oberösterreich", status: "ACTIVE" }] }));
  await page.route("**/api/stores", (route) => { createdBody = route.request().postDataJSON(); return fulfillCreated(route, "/api/stores/store-keyboard", { id: "store-keyboard", name: createdBody?.name }); });
  await mockCreatedStore(page, "store-keyboard", "Keyboard Store");
  await page.goto("/admin/next/stores/new/");
  const fields = [
    ["Store-Code", "KEY-02"], ["Name", "Keyboard Store"], ["Straße", "Testweg 2"],
    ["PLZ", "4020"], ["Ort", "Linz"], ["Land", "AT"]
  ] as const;
  for (const [label, value] of fields) {
    const field = page.getByRole("textbox", { name: label, exact: true });
    await field.focus();
    await page.keyboard.type(value);
  }
  await page.getByRole("button", { name: "Store anlegen" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Keyboard Store" })).toBeVisible();
  expect(createdBody).toMatchObject({ storeCode: "KEY-02", name: "Keyboard Store", regionId: "region-1" });
});

test("store create with empty required fields is blocked by native validation and sends no POST", async ({ page }) => {
  let postCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: [{ id: "region-1", code: "AT-OOE", name: "Oberösterreich", status: "ACTIVE" }] }));
  await page.route("**/api/stores", (route) => {
    if (route.request().method() === "POST") postCalls += 1;
    return route.fulfill({ json: { id: "store-empty", name: "" } });
  });
  await page.goto("/admin/next/stores/new/");
  await expect(page.getByRole("textbox", { name: "Store-Code" })).toBeVisible();
  await page.getByRole("button", { name: "Store anlegen" }).click();
  const storeCode = page.getByRole("textbox", { name: "Store-Code" });
  await expect(storeCode).toBeFocused();
  expect(await storeCode.evaluate((element: HTMLInputElement) => element.validationMessage)).not.toBe("");
  expect(await page.locator("form.detail-form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
  await expect(page).toHaveURL(/\/stores\/new\/$/);
  expect(postCalls).toBe(0);
});
