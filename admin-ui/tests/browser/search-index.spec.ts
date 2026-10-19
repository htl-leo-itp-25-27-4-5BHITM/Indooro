import { expect, test, type Page } from "@playwright/test";

const adminUser = { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null };

function overview(overrides: Record<string, unknown> = {}) {
  return {
    alias: "products_live", sourceIndex: "products_live", sourceCount: 153, activeIndices: ["products_v1"],
    versions: [{ name: "products_v1", docCount: 153, active: true }, { name: "products_v2", docCount: 150, active: false }],
    ...overrides
  };
}

async function asAdmin(page: Page) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: adminUser }));
}

test("admin sees the alias target, versions with counts and the navigation entry", async ({ page }) => {
  await asAdmin(page);
  await page.route("**/api/admin/index", (route) => route.fulfill({ json: overview() }));
  await page.goto("/admin/next/search-index/");

  await expect(page.getByRole("heading", { name: "Suchindex", level: 2 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin Navigation" }).getByRole("link", { name: "Suchindex" })).toHaveAttribute("href", "/admin/next/search-index/");
  await expect(page.getByText("Der Alias products_live zeigt auf products_v1.")).toBeVisible();
  const active = page.getByRole("row").filter({ hasText: "products_v1" });
  await expect(active).toContainText("153");
  await expect(active).toContainText("gleich wie Quelle");
  await expect(active).toContainText("Aktiv");
  await expect(active.getByRole("button")).toHaveCount(0);
  const other = page.getByRole("row").filter({ hasText: "products_v2" });
  await expect(other).toContainText("weicht von der Quelle ab (153)");
  await expect(other.getByRole("button", { name: "products_v2 aktivieren" })).toBeEnabled();
});

test("an unreadable count is shown as not readable and not as zero", async ({ page }) => {
  await asAdmin(page);
  await page.route("**/api/admin/index", (route) => route.fulfill({ json: overview({ sourceCount: null, versions: [{ name: "products_v1", docCount: null, active: true }] }) }));
  await page.goto("/admin/next/search-index/");
  const row = page.getByRole("row").filter({ hasText: "products_v1" });
  await expect(row).toContainText("nicht lesbar");
  await expect(row).toContainText("nicht vergleichbar");
  await expect(page.getByText("Quellindex")).toContainText("nicht lesbar");
});

test("reindex shows source and target counts, leaves the alias alone and reloads the versions", async ({ page }) => {
  await asAdmin(page);
  let overviewCalls = 0;
  const posts: string[] = [];
  await page.route("**/api/admin/index", (route) => {
    overviewCalls += 1;
    return route.fulfill({ json: overviewCalls === 1 ? overview({ versions: [{ name: "products_v1", docCount: 153, active: true }] }) : overview({ versions: [{ name: "products_v1", docCount: 153, active: true }, { name: "products_v2", docCount: 153, active: false }] }) });
  });
  await page.route("**/api/admin/index/reindex", (route) => {
    posts.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.fulfill({ json: { source: "products_live", target: "products_v2", sourceCount: 153, targetCount: 153, status: "OK" } });
  });
  await page.goto("/admin/next/search-index/");
  await expect(page.getByRole("row").filter({ hasText: "products_v2" })).toHaveCount(0);

  await page.getByRole("button", { name: "Reindex starten" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reindex abgeschlossen." })).toContainText("Quelle products_live: 153 Dokumente, Ziel products_v2: 153 Dokumente.");
  await expect(page.getByRole("row").filter({ hasText: "products_v2" })).toContainText("gleich wie Quelle");
  expect(posts).toEqual(["POST /api/admin/index/reindex"]);
  await expect(page.getByText("Der Alias products_live zeigt auf products_v1.")).toBeVisible();
});

test("activate needs the confirmation dialog and never sends force", async ({ page }) => {
  await asAdmin(page);
  let activeIndex = "products_v1";
  const activations: string[] = [];
  const dialogs: string[] = [];
  await page.route("**/api/admin/index", (route) => route.fulfill({ json: overview({ activeIndices: [activeIndex], versions: [{ name: "products_v1", docCount: 153, active: activeIndex === "products_v1" }, { name: "products_v2", docCount: 153, active: activeIndex === "products_v2" }] }) }));
  await page.route("**/api/admin/index/activate?*", (route) => {
    activations.push(route.request().url());
    activeIndex = "products_v2";
    return route.fulfill({ json: { alias: "products_live", index: "products_v2", previous: ["products_v1"] } });
  });
  page.on("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.dismiss(); });
  await page.goto("/admin/next/search-index/");

  await page.getByRole("button", { name: "products_v2 aktivieren" }).click();
  await expect.poll(() => dialogs.length).toBe(1);
  expect(dialogs[0]).toContain("Alias products_live auf products_v2 umschalten?");
  expect(dialogs[0]).toContain("Dokumente in products_v2: 153. Quelle products_live: 153.");
  expect(activations).toEqual([]);

  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => { dialogs.push(dialog.message()); void dialog.accept(); });
  await page.getByRole("button", { name: "products_v2 aktivieren" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Alias products_live zeigt jetzt auf products_v2." })).toBeVisible();
  expect(activations).toHaveLength(1);
  expect(new URL(activations[0]).searchParams.get("index")).toBe("products_v2");
  expect(new URL(activations[0]).searchParams.has("force")).toBe(false);
  await expect(page.getByText("Der Alias products_live zeigt auf products_v2.")).toBeVisible();
});

test("a count mismatch conflict shows the server text and keeps the alias", async ({ page }) => {
  await asAdmin(page);
  await page.route("**/api/admin/index", (route) => route.fulfill({ json: overview() }));
  await page.route("**/api/admin/index/activate?*", (route) => route.fulfill({ status: 409, json: { status: 409, error: "Dokumentzahlen weichen ab: Quelle products_live hat 153 Dokumente, Ziel products_v2 hat 150." } }));
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("/admin/next/search-index/");
  await page.getByRole("button", { name: "products_v2 aktivieren" }).click();
  await expect(page.getByRole("alert")).toContainText("Umschaltung abgelehnt");
  await expect(page.getByRole("alert")).toContainText("Quelle products_live hat 153 Dokumente, Ziel products_v2 hat 150.");
  await expect(page.getByText("Der Alias products_live zeigt auf products_v1.")).toBeVisible();
});

test("a failed reindex reports the failure and reloads the overview", async ({ page }) => {
  await asAdmin(page);
  let overviewCalls = 0;
  await page.route("**/api/admin/index", (route) => { overviewCalls += 1; return route.fulfill({ json: overview() }); });
  await page.route("**/api/admin/index/reindex", (route) => route.fulfill({ status: 500, json: { error: "Reindex unvollständig" } }));
  await page.goto("/admin/next/search-index/");
  await page.getByRole("button", { name: "Reindex starten" }).click();
  await expect(page.getByRole("alert")).toContainText("Der Reindex ist fehlgeschlagen.");
  await expect.poll(() => overviewCalls).toBe(2);
  await expect(page.getByRole("button", { name: "Reindex starten" })).toBeEnabled();
});

test("store and region managers are denied and no index request is sent", async ({ page }) => {
  for (const role of ["store-manager", "region-manager"]) {
    let indexRequests = 0;
    await page.unroute("**/api/**").catch(() => undefined);
    await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "m-1", username: "manager", email: null, role, scope: { regionId: "r1", storeId: "s1", storeName: "Linz" } } }));
    await page.route("**/api/admin/index**", (route) => { indexRequests += 1; return route.fulfill({ json: overview() }); });
    await page.goto("/admin/next/search-index/");
    await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
    await expect(page.getByRole("navigation", { name: "Admin Navigation" }).getByRole("link", { name: "Suchindex" })).toHaveCount(0);
    expect(indexRequests).toBe(0);
  }
});

test("server forbidden on load shows an access message", async ({ page }) => {
  await asAdmin(page);
  await page.route("**/api/admin/index", (route) => route.fulfill({ status: 403, json: { error: "Forbidden" } }));
  await page.goto("/admin/next/search-index/");
  await expect(page.getByRole("alert")).toContainText("Administratoren vorbehalten");
});
