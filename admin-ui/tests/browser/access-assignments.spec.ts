import { expect, test, type Page } from "@playwright/test";

const ADMIN = { subject: "admin-sub", username: "indooro-admin", email: null, role: "admin", scope: null };
const STORE_A = { id: "store-a", storeCode: "SPAR-Leonding-002", name: "SPAR Leonding Testraum", status: "ACTIVE", region: { id: "region-1", name: "Oberösterreich" } };
const STORE_B = { id: "store-b", storeCode: "SPAR-Linz-001", name: "SPAR Linz", status: "ACTIVE", region: { id: "region-1", name: "Oberösterreich" } };
const REGION = { id: "region-1", code: "AT-OO", name: "Oberösterreich", description: null, status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const NEW_SUB = "6d1f0c2e-1b7a-4c55-9a0e-3f3b8d2a9e11";

function assignment(overrides: Record<string, unknown>) {
  return {
    id: "assignment-1", keycloakSubject: "sub-1", username: "user", email: null, role: "store-manager",
    regionId: null, regionName: null, storeId: STORE_A.id, storeCode: STORE_A.storeCode, storeName: STORE_A.name,
    status: "ACTIVE", createdAt: "2026-11-04T08:00:00Z", updatedAt: "2026-11-04T08:00:00Z", ...overrides
  };
}

async function mockAdminPage(page: Page, rows: Array<Record<string, unknown>>) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: ADMIN }));
  await page.route("**/api/regions?status=ACTIVE", (route) => route.fulfill({ json: [REGION] }));
  await page.route("**/api/stores?status=ACTIVE&page=0&size=100", (route) => route.fulfill({ json: { content: [STORE_B, STORE_A], page: 0, size: 100, totalElements: 2 } }));
  await page.route("**/api/admin/access-assignments?status=ACTIVE", (route) => route.fulfill({ json: rows.filter((row) => row.status === "ACTIVE") }));
}

test("admin gives a new store manager access to exactly one store", async ({ page }) => {
  const rows: Array<Record<string, unknown>> = [assignment({ id: "own", keycloakSubject: ADMIN.subject, username: ADMIN.username, role: "admin", storeId: null, storeCode: null, storeName: null })];
  const posted: unknown[] = [];
  await mockAdminPage(page, rows);
  await page.route("**/api/admin/access-assignments", (route) => {
    expect(route.request().method()).toBe("POST");
    const body = route.request().postDataJSON();
    posted.push(body);
    const created = assignment({ id: "assignment-new", keycloakSubject: body.keycloakSubject, username: body.username, email: body.email });
    rows.push(created);
    return route.fulfill({ json: created });
  });

  await page.goto("/admin/next/access/");
  await expect(page.getByRole("heading", { name: "Zugänge" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Zugänge" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Eigener Zugang")).toBeVisible();
  await expect(page.getByRole("button", { name: /Zugang von indooro-admin deaktivieren/ })).toHaveCount(0);

  await page.getByLabel("Keycloak-ID (sub)").fill(` ${NEW_SUB} `);
  await page.getByLabel("Benutzername").fill("marta");
  await page.getByLabel("E-Mail").fill("marta@example.test");
  await expect(page.getByLabel("Rolle")).toHaveValue("store-manager");
  await expect(page.getByLabel("Region")).toHaveCount(0);
  await page.getByLabel("Markt").selectOption({ label: "SPAR Leonding Testraum (SPAR-Leonding-002) – Oberösterreich" });
  await page.getByRole("button", { name: "Zugang anlegen" }).click();

  await expect(page.locator(".notice.success")).toContainText("Zugang für „marta“ angelegt");
  expect(posted).toEqual([{ keycloakSubject: NEW_SUB, username: "marta", email: "marta@example.test", role: "store-manager", regionId: null, storeId: "store-a" }]);
  const row = page.getByRole("row", { name: /marta/ });
  await expect(row).toContainText("SPAR Leonding Testraum (SPAR-Leonding-002)");
  await expect(row).toContainText(NEW_SUB);
  await expect(page.getByLabel("Keycloak-ID (sub)")).toHaveValue("");
});

test("store manager without a store and region manager without a region are not sent", async ({ page }) => {
  let posts = 0;
  await mockAdminPage(page, []);
  await page.route("**/api/admin/access-assignments", (route) => { posts += 1; return route.fulfill({ status: 500, json: {} }); });
  await page.goto("/admin/next/access/");
  await page.getByLabel("Keycloak-ID (sub)").fill("abc def");
  await page.getByLabel("Benutzername").fill("marta");
  await page.getByRole("button", { name: "Zugang anlegen" }).click();
  await expect(page.locator("#access-keycloakSubject-error")).toHaveText("Die Keycloak-ID darf keine Leerzeichen enthalten.");
  await expect(page.locator("#access-storeId-error")).toHaveText("Ein Marktleiter braucht einen Markt.");

  await page.getByLabel("Rolle").selectOption("region-manager");
  await expect(page.getByLabel("Markt")).toHaveCount(0);
  await page.getByRole("button", { name: "Zugang anlegen" }).click();
  await expect(page.locator("#access-regionId-error")).toHaveText("Ein Regionsmanager braucht eine Region.");
  expect(posts).toBe(0);
});

test("a second active access for the same Keycloak id shows the server conflict and keeps the input", async ({ page }) => {
  await mockAdminPage(page, []);
  await page.route("**/api/admin/access-assignments", (route) => route.fulfill({ status: 409, json: { error: "Für diese Keycloak-ID gibt es bereits einen aktiven Zugang." } }));
  await page.goto("/admin/next/access/");
  await page.getByLabel("Keycloak-ID (sub)").fill(NEW_SUB);
  await page.getByLabel("Benutzername").fill("marta");
  await page.getByLabel("Rolle").selectOption("region-manager");
  await page.getByLabel("Region").selectOption("region-1");
  await page.getByRole("button", { name: "Zugang anlegen" }).click();
  await expect(page.getByRole("alert")).toContainText("bereits einen aktiven Zugang");
  await expect(page.getByLabel("Keycloak-ID (sub)")).toHaveValue(NEW_SUB);
});

test("admin deactivates another user's access after confirming", async ({ page }) => {
  const rows = [assignment({ id: "assignment-9", keycloakSubject: "sub-9", username: "alt-leiter" })];
  await mockAdminPage(page, rows);
  await page.route("**/api/admin/access-assignments?status=DISABLED", (route) => route.fulfill({ json: rows.filter((row) => row.status === "DISABLED") }));
  await page.route("**/api/admin/access-assignments/assignment-9/deactivate", (route) => {
    expect(route.request().method()).toBe("PATCH");
    rows[0] = { ...rows[0], status: "DISABLED" };
    return route.fulfill({ json: rows[0] });
  });
  await page.goto("/admin/next/access/");
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("alt-leiter");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Zugang von alt-leiter deaktivieren" }).click();
  await expect(page.locator(".notice.success")).toHaveText("Zugang von „alt-leiter“ wurde deaktiviert.");
  await expect(page.getByText("Keine Zugänge in diesem Status.")).toBeVisible();
  await page.getByLabel("Status").selectOption("DISABLED");
  await expect(page.getByRole("row", { name: /alt-leiter/ })).toContainText("Deaktiviert");
});

for (const role of ["store-manager", "region-manager"] as const) {
  test(`${role} is denied the access page without any access API call`, async ({ page }) => {
    let requests = 0;
    await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: `${role}-sub`, username: role, email: null, role, scope: role === "store-manager" ? { regionId: null, regionName: null, storeId: "store-a", storeName: "SPAR Leonding Testraum" } : { regionId: "region-1", regionName: "Oberösterreich", storeId: null, storeName: null } } }));
    await page.route("**/api/admin/access-assignments**", (route) => { requests += 1; return route.fulfill({ json: [] }); });
    await page.goto("/admin/next/access/");
    await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
    await expect(page.getByRole("link", { name: "Zugänge" })).toHaveCount(0);
    expect(requests).toBe(0);
  });
}

test("signed-in user without access sees the own Keycloak id to copy", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: 403, json: { status: 403, error: "Kein aktiver Indooro Admin-Zugriff fuer diesen Benutzer." } }));
  await page.route("**/api/admin/me/identity", (route) => route.fulfill({ json: { subject: NEW_SUB, username: "marta", email: "marta@example.test" } }));
  await page.goto("/admin/next/");
  await expect(page.getByRole("heading", { name: "Zugriff verweigert" })).toBeVisible();
  await expect(page.getByText("Angemeldet als marta")).toBeVisible();
  await expect(page.getByLabel("Ihre Keycloak-ID (sub)")).toHaveValue(NEW_SUB);
  await page.getByRole("button", { name: "Kopieren" }).click();
  await expect(page.getByText("Keycloak-ID kopiert.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(NEW_SUB);
});

test("expired session shows no Keycloak id", async ({ page }) => {
  let identityRequests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ status: 401, json: {} }));
  await page.route("**/api/admin/me/identity", (route) => { identityRequests += 1; return route.fulfill({ status: 401, json: {} }); });
  await page.goto("/admin/next/");
  await expect(page.getByRole("heading", { name: "Sitzung abgelaufen" })).toBeVisible();
  await expect(page.getByLabel("Ihre Keycloak-ID (sub)")).toHaveCount(0);
  expect(identityRequests).toBe(0);
});
