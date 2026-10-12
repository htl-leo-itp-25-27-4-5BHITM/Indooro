import { expect, test } from "@playwright/test";

test("admin region create retains input after conflict and reloads confirmed detail", async ({ page }) => {
  const regions: Array<Record<string, unknown>> = [];
  let fail = true;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: regions }));
  await page.route("**/api/regions", (route) => {
    if (fail) return route.fulfill({ status: 409, json: { error: "Code existiert bereits" } });
    const region = { id: "region-1", status: "ACTIVE", ...route.request().postDataJSON() };
    regions.push(region);
    return route.fulfill({ json: region });
  });
  await page.route("**/api/regions/region-1", (route) => route.fulfill({ json: regions[0] }));
  await page.goto("/admin/next/regions/");
  await page.getByRole("button", { name: "Region anlegen" }).click();
  await page.getByRole("textbox", { name: "Code" }).fill("AT-OOE");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Oberösterreich");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("alert")).toContainText("Code existiert bereits");
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Oberösterreich");
  fail = false;
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name: "Details" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Oberösterreich" })).toBeVisible();
});

test("store manager is denied region route without region API calls", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "store-1", username: "store-manager", role: "store-manager", scope: { storeId: "store-1" } } }));
  await page.route("**/api/regions**", (route) => { requests += 1; return route.fulfill({ json: [] }); });
  await page.goto("/admin/next/regions/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(requests).toBe(0);
});

test("admin edits a region and shows the confirmed server state", async ({ page }) => {
  let region = { id: "region-2", code: "AT-T", name: "Tirol", description: "Alt", status: "ACTIVE", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: [region] }));
  await page.route("**/api/regions/region-2", async (route) => {
    if (route.request().method() === "PUT") {
      region = { ...region, ...route.request().postDataJSON(), updatedAt: "2026-01-02" };
      return route.fulfill({ json: region });
    }
    return route.fulfill({ json: region });
  });
  await page.goto("/admin/next/regions/");
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByText("Alt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Tirol Nord");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("cell", { name: "Tirol Nord" })).toBeVisible();
  await expect(page.getByLabel("Details").getByText("Tirol Nord", { exact: true })).toBeVisible();
  await expect(page.getByText("Alt", { exact: true })).toBeVisible();
});

test("admin confirms archive and can find the archived region in its status filter", async ({ page }) => {
  let region = { id: "region-3", code: "AT-S", name: "Salzburg", description: null, status: "ACTIVE", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: region.status === "ACTIVE" ? [region] : [] }));
  await page.route("**/api/regions?status=ARCHIVED", (route) => route.fulfill({ json: region.status === "ARCHIVED" ? [region] : [] }));
  await page.route("**/api/regions/region-3", (route) => route.fulfill({ json: region }));
  await page.route("**/api/regions/region-3/archive", async (route) => {
    expect(route.request().method()).toBe("PATCH");
    region = { ...region, status: "ARCHIVED" };
    return route.fulfill({ json: region });
  });
  await page.goto("/admin/next/regions/");
  await page.getByRole("button", { name: "Details" }).click();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Salzburg archivieren?");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Archivieren" }).click();
  await expect(page.getByText("Region „Salzburg“ wurde archiviert.", { exact: true })).toBeVisible();
  await expect(page.getByText("Archiviert", { exact: true }).last()).toBeVisible();
  await page.getByLabel("Status").selectOption("ARCHIVED");
  await expect(page.getByRole("cell", { name: "Salzburg" })).toBeVisible();
});

test("region manager receives only the assigned region and has no mutation controls", async ({ page }) => {
  const requested: string[] = [];
  const assigned = { id: "region-assigned", code: "AT-O", name: "Ost", description: null, status: "ACTIVE", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "region-manager", role: "region-manager", scope: { regionId: assigned.id } } }));
  await page.route("**/api/regions**", (route) => {
    requested.push(new URL(route.request().url()).pathname + new URL(route.request().url()).search);
    return route.fulfill({ json: route.request().url().includes("/api/regions/") && !route.request().url().includes("status=") ? assigned : [assigned] });
  });
  await page.goto("/admin/next/regions/");
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByText("Ost", { exact: true }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Region anlegen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archivieren" })).toHaveCount(0);
  expect(requested).toContain("/api/regions?status=ACTIVE");
  expect(requested).toContain("/api/regions/region-assigned");
});
