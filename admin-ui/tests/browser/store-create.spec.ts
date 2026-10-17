import { expect, test } from "@playwright/test";

test("region manager creates a scoped store and continues in detail", async ({ page }) => {
  let createdBody: Record<string, unknown> | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich" } } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: [{ id: "region-1", code: "AT-OOE", name: "Oberösterreich", status: "ACTIVE" }] }));
  await page.route("**/api/stores", (route) => { createdBody = route.request().postDataJSON(); return route.fulfill({ json: { id: "store-new", name: createdBody?.name } }); });
  await page.goto("/admin/next/stores/new/");
  await page.getByRole("textbox", { name: "Store-Code" }).fill("LINZ-02");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Indooro Linz Süd");
  await page.getByRole("textbox", { name: "Straße" }).fill("Bahnhofstraße 1");
  await page.getByRole("textbox", { name: "PLZ" }).fill("4020");
  await page.getByRole("textbox", { name: "Ort" }).fill("Linz");
  await page.getByRole("textbox", { name: "Land" }).fill("AT");
  await page.getByRole("button", { name: "Store anlegen" }).click();
  await expect(page.getByRole("heading", { name: "Store angelegt" })).toBeVisible();
  expect(createdBody?.regionId).toBe("region-1");
  expect(createdBody?.latitude).toBeNull();
  await expect(page.getByRole("link", { name: "Store-Detail öffnen" })).toHaveAttribute("href", "/admin/next/stores/detail/?storeId=store-new");
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
  await page.route("**/api/stores", (route) => { createdBody = route.request().postDataJSON(); return route.fulfill({ json: { id: "store-keyboard", name: createdBody?.name } }); });
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
  await expect(page.getByRole("heading", { name: "Store angelegt" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Store angelegt" })).toHaveCount(0);
  expect(postCalls).toBe(0);
});
