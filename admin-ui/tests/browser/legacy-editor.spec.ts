import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { LayoutDocument } from "../../src/editor/model";

const layout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;

test("global editor sends raw layout JSON and confirms immediate publication", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/layout/current", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: layout });
    posted = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ json: { message: "Layout saved successfully", layoutId: "published-2", savedAt: "2026-10-11T12:00:00Z" } });
  });
  await page.route("**/api/layout/history?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/admin/next/editor/");
  await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
  await expect(page.getByText("Globales Legacy-Layout · nur Admin")).toBeVisible();
  await page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" }).click();
  await page.getByLabel("Bezeichnung").fill("Globales Obst");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Global veröffentlichen" }).click();
  await expect(page.getByText("Globales Layout veröffentlicht.")).toBeVisible();
  expect(posted).not.toBeNull();
  expect(posted!.elements).toHaveLength(3);
  expect((posted!.elements as LayoutDocument["elements"])[1].label).toBe("Globales Obst");
  expect(posted!.layout).toBeUndefined();
  expect(posted!.activate).toBeUndefined();
});

test("global editor load can be retried after a transient failure", async ({ page }) => {
  let fail = true;
  let reads = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/layout/current", (route) => {
    reads += 1;
    return fail ? route.fulfill({ status: 503, json: { error: "Unavailable" } }) : route.fulfill({ json: layout });
  });
  await page.route("**/api/layout/history?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/admin/next/editor/");
  await expect(page.getByRole("alert")).toContainText("Serverfehler");
  fail = false;
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Filialname" })).toHaveValue(layout.shopName);
  expect(reads).toBe(2);
});

test("failed immediate publication keeps edits local and the prior global layout published", async ({ page }) => {
  let fail = true;
  let published = layout;
  let attempts = 0;
  let posted: LayoutDocument | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/layout/current", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: published });
    attempts += 1;
    if (fail) return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    posted = route.request().postDataJSON() as LayoutDocument;
    published = posted;
    return route.fulfill({ json: { message: "Layout saved", layoutId: "published-3", savedAt: "2026-10-13T12:00:00Z" } });
  });
  await page.route("**/api/layout/history?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/admin/next/editor/");
  const name = page.getByRole("textbox", { name: "Filialname" });
  await name.fill("Noch nicht veröffentlicht");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Global veröffentlichen" }).click();
  await expect(page.locator(".le-message")).toContainText("Serverfehler");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();
  await expect(name).toHaveValue("Noch nicht veröffentlicht");
  expect(published.shopName).toBe(layout.shopName);
  expect(attempts).toBe(1);

  fail = false;
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Global veröffentlichen" }).click();
  await expect(page.getByText("Globales Layout veröffentlicht.")).toBeVisible();
  expect(attempts).toBe(2);
  expect(posted?.shopName).toBe("Noch nicht veröffentlicht");
  expect(published.shopName).toBe("Noch nicht veröffentlicht");
});

test("historical global version can be republished without a fake edit", async ({ page }) => {
  let posted: LayoutDocument | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/layout/versions/old-1", (route) => route.fulfill({ json: layout }));
  await page.route("**/api/layout/history?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/layout/current", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: posted ?? layout });
    posted = route.request().postDataJSON() as LayoutDocument;
    return route.fulfill({ json: { message: "Layout saved", layoutId: "restored-2", savedAt: "2026-10-13T12:00:00Z" } });
  });
  await page.goto("/admin/next/editor/?layoutId=old-1");
  await expect(page.getByRole("button", { name: "Global veröffentlichen" })).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Global veröffentlichen" }).click();
  await expect(page.locator(".legacy-editor-route-published")).toContainText("Version restored-2");
  await expect(page).toHaveURL(/\/admin\/next\/editor\/$/);
  expect(posted).toEqual(layout);
  await expect(page.getByRole("button", { name: "Global veröffentlichen" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Global veröffentlichen" })).toBeDisabled();
});

test("global history loads versions older than the first twelve", async ({ page }) => {
  const entries = Array.from({ length: 15 }, (_, index) => ({ layoutId: `version-${index + 1}`, shopName: `Map ${index + 1}`, savedAt: "2026-10-13T12:00:00Z", elementCount: 3 }));
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/layout/current", (route) => route.fulfill({ json: layout }));
  await page.route("**/api/layout/history?*", (route) => {
    const limit = Number(new URL(route.request().url()).searchParams.get("limit"));
    return route.fulfill({ json: entries.slice(0, limit) });
  });
  await page.goto("/admin/next/editor/");
  const history = page.getByRole("region", { name: "Globale Layout-Historie" });
  await expect(history.getByRole("listitem")).toHaveCount(12);
  await history.getByRole("button", { name: "Weitere Versionen laden" }).focus();
  await page.keyboard.press("Enter");
  await expect(history.getByRole("listitem")).toHaveCount(15);
  await expect(history.getByRole("link", { name: "Öffnen" }).last()).toHaveAttribute("href", "/admin/next/editor/?layoutId=version-15");
  await expect(history.getByRole("button", { name: "Weitere Versionen laden" })).toHaveCount(0);
});

test("global history retries without replacing unsaved editor work", async ({ page }) => {
  let fail = true;
  let currentReads = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/layout/current", (route) => { currentReads += 1; return route.fulfill({ json: layout }); });
  await page.route("**/api/layout/history?*", (route) => fail
    ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
    : route.fulfill({ json: [{ layoutId: "old-1", shopName: "Earlier map", savedAt: "2026-10-13T12:00:00Z", elementCount: 3 }] }));
  await page.goto("/admin/next/editor/");
  await expect(page.getByRole("region", { name: "Globale Layout-Historie" }).getByRole("alert")).toContainText("Serverfehler");
  await page.getByRole("textbox", { name: "Filialname" }).fill("Ungespeicherter Name");
  fail = false;
  await page.getByRole("button", { name: "Historie erneut laden" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Globale Layout-Historie" }).getByRole("link", { name: "Öffnen", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Filialname" })).toHaveValue("Ungespeicherter Name");
  expect(currentReads).toBe(1);
});

test("non-admin cannot open global editor or call legacy layout APIs", async ({ page }) => {
  let legacyCalls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "manager-1", username: "manager", email: null, role: "store-manager", scope: { storeId: "store-1" } } }));
  await page.route("**/api/layout/**", (route) => { legacyCalls += 1; return route.fulfill({ json: layout }); });
  await page.goto("/admin/next/editor/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(legacyCalls).toBe(0);
});

test("mobile preview stays on fallback until draft activation then shows active version", async ({ page }) => {
  let mobileActive = false;
  let mobileReads = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/stores/store-1/layout/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) return route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" }, currentLayout: { layoutId: "draft-1", versionNo: 1, status: "DRAFT", layout }, assignedBeacons: [{ beaconCode: "IN-001" }] } });
    if (path.endsWith("/versions") && route.request().method() === "GET") return route.fulfill({ json: [{ layoutId: "draft-1", versionNo: 1, status: "DRAFT" }] });
    if (path.endsWith("/activate")) { mobileActive = true; return route.fulfill({ json: { layoutId: "draft-1", versionNo: 1, status: "ACTIVE", layout } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route("**/api/mobile/stores/store-1/layout/current", (route) => {
    mobileReads += 1;
    return route.fulfill({ json: { storeId: "store-1", layoutId: mobileActive ? "draft-1" : null, source: mobileActive ? "ACTIVE" : "DEFAULT", fallback: !mobileActive, layout } });
  });
  await page.goto("/admin/next/editor/?storeId=store-1");
  const preview = page.getByRole("region", { name: "Aktuell mobiles Layout" });
  await expect(preview).toContainText("Standardlayout (Fallback)");
  await expect(preview).toContainText("Keine aktive Version");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Veröffentlichen" }).click();
  await expect(preview).toContainText("Aktive Version");
  await expect(preview).toContainText("draft-1");
  expect(mobileReads).toBeGreaterThanOrEqual(2);
});

test("mobile preview distinguishes a saved draft from the public layout", async ({ page }) => {
  const draftLayout = { ...layout, shopName: "Unveröffentlichter Entwurf" };
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/stores/store-1/layout/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) return route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" }, currentLayout: { layoutId: "draft-1", versionNo: 1, status: "DRAFT", layout: draftLayout }, assignedBeacons: [] } });
    if (path.endsWith("/versions")) return route.fulfill({ json: [{ layoutId: "draft-1", versionNo: 1, status: "DRAFT" }] });
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route("**/api/mobile/stores/store-1/layout/current", (route) => route.fulfill({ json: { storeId: "store-1", layoutId: null, source: "DEFAULT", fallback: true, layout } }));
  await page.goto("/admin/next/editor/?storeId=store-1");
  const preview = page.getByRole("region", { name: "Aktuell mobiles Layout" });
  await expect(preview).toContainText("Standardlayout (Fallback)");
  await preview.getByRole("button", { name: "Gespeicherten Entwurf ansehen" }).click();
  await expect(preview).toContainText("Gespeicherter Entwurf · nicht öffentlich");
  await expect(preview).toContainText("Unveröffentlichter Entwurf");
  await expect(preview).toContainText("Produktpositionen");
  await expect(preview).toContainText("Mobile Route nicht geprüft");
  await preview.getByRole("button", { name: "Öffentlich aktiv" }).click();
  await expect(preview).toContainText("Standardlayout (Fallback)");
});
