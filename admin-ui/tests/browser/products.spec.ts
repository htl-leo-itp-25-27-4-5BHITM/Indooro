import { expect, test, type Page } from "@playwright/test";

test("admin product list pages through server results and opens a validated edit", async ({ page }) => {
  const requests: string[] = [];
  await mockSingleStore(page);
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst" }] }));
  await page.route("**/api/admin/products?*", (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    const pageNo = Number(url.searchParams.get("page"));
    return route.fulfill({ json: { content: [{ id: 100 + pageNo, name: `Apfel ${pageNo}`, price: 1.5, layoutCode: "310/1/1/1", storeId: null, storeCode: null }], page: pageNo, size: 20, totalElements: 21 } });
  });
  await page.goto("/admin/next/products/?q=Apfel");
  await expect(page.getByRole("heading", { name: "Produkte", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "21 Produkte" })).toBeVisible();
  await expect(page.getByText("Apfel 0")).toBeVisible();
  await page.getByRole("link", { name: "Weiter" }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.getByText("Apfel 1")).toBeVisible();
  expect(requests.at(-1)).toContain("page=1");
  await page.getByRole("button", { name: "Bearbeiten" }).click();
  await expect(page.getByRole("heading", { name: "Produkt bearbeiten" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Apfel 1");
});

test("product search submits with the keyboard and list failures can be retried", async ({ page }) => {
  const queries: string[] = [];
  let listCalls = 0;
  await mockSingleStore(page);
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/admin/products?*", (route) => {
    listCalls += 1;
    const url = new URL(route.request().url());
    queries.push(url.searchParams.get("q") ?? "");
    if (listCalls === 1) return route.fulfill({ status: 503, json: { message: "Katalog vorübergehend nicht verfügbar." } });
    return route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } });
  });

  await page.goto("/admin/next/products/");
  await expect(page.getByRole("alert")).toContainText("Serverfehler. Bitte später erneut versuchen.");
  await page.getByRole("button", { name: "Erneut laden" }).click();
  await expect(page.getByText("Der Produktkatalog ist leer.")).toBeVisible();
  expect(listCalls).toBe(2);

  const search = page.getByRole("searchbox", { name: "Suche" });
  await search.fill("Birne");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Birne/);
  await expect(page.getByText("Keine Produkte zu Suche oder Filter gefunden.")).toBeVisible();
  expect(queries.at(-1)).toBe("Birne");
});

test("product sort and readiness filter are requested from the server before paging", async ({ page }) => {
  const requests: URL[] = [];
  await mockSingleStore(page);
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst" }] }));
  await page.route("**/api/admin/products?*", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const pageNo = Number(url.searchParams.get("page"));
    return route.fulfill({ json: { content: [{ id: pageNo + 1, name: `Apfel ${pageNo}`, price: 1, layoutCode: "310/1/1/1", storeId: null, storeCode: null }], page: pageNo, size: 20, totalElements: 21 } });
  });
  await page.goto("/admin/next/products/");
  await page.getByLabel("Sortierung").selectOption("layoutCode");
  await page.getByLabel("Readiness").selectOption("ready");
  await expect(page).toHaveURL(/sort=layoutCode.*readiness=ready/);
  await expect(page.getByText("Apfel 0")).toBeVisible();
  await page.getByRole("link", { name: "Weiter" }).click();
  await expect(page.getByText("Apfel 1")).toBeVisible();
  expect(requests.at(-1)?.searchParams.get("page")).toBe("1");
  expect(requests.at(-1)?.searchParams.get("sort")).toBe("layoutCode");
  expect(requests.at(-1)?.searchParams.get("routable")).toBe("true");
});

test("region manager product direct link calls no product API", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1" } } }));
  await page.route("**/api/admin/products?*", (route) => { calls += 1; return route.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }); });
  await page.goto("/admin/next/products/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(calls).toBe(0);
});

test("admin validates and creates a product with the documented layout code", async ({ page }) => {
  const products: Array<Record<string, unknown>> = [];
  const writes: Record<string, unknown>[] = [];
  await mockSingleStore(page);
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }] }));
  await page.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: products, page: 0, size: 20, totalElements: products.length } }));
  await page.route("**/api/admin/products", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    writes.push(payload);
    products.push(payload);
    return route.fulfill({ json: payload });
  });

  await page.goto("/admin/next/products/");
  await page.getByRole("button", { name: "Produkt anlegen" }).click();
  await expect(page.getByText("Layout-Code: 310/1/1/1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Produkt-ID muss eine positive ganze Zahl sein.")).toBeVisible();
  await expect(page.getByText("Name ist erforderlich.")).toBeVisible();
  expect(writes).toHaveLength(0);

  await page.getByLabel("Produkt-ID").fill("7310");
  await page.getByRole("textbox", { name: "Name Name ist erforderlich." }).fill("  Tomaten  ");
  await page.getByLabel("Preis (EUR)").fill("1,99");
  await page.getByLabel("Kategorie").selectOption("310");
  await page.getByLabel("Meter (1–5)").selectOption("5");
  await page.getByLabel("Fach (1–7)").selectOption("7");
  await page.getByLabel("Reihe (1–3)").selectOption("3");
  await expect(page.getByText("Layout-Code: 310/5/7/3", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Speichern" }).click();

  await expect(page.getByText("Produkt wurde angelegt.", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Tomaten" })).toBeVisible();
  expect(writes).toEqual([{ id: 7310, name: "Tomaten", price: 1.99, layoutCode: "310/5/7/3", storeId: "store-1", storeCode: "LINZ-01" }]);
});

test("admin can cancel product deletion or confirm it and sees the empty post-action state", async ({ page }) => {
  let product: Record<string, unknown> | null = { id: 42, name: "Tomaten", price: 1.99, layoutCode: "310/1/1/1", storeId: null, storeCode: null };
  let deleteCalls = 0;
  await mockSingleStore(page);
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }] }));
  await page.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: product ? [product] : [], page: 0, size: 20, totalElements: product ? 1 : 0 } }));
  await page.route("**/api/admin/products/42*", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleteCalls += 1;
    product = null;
    return route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/admin/next/products/");
  await expect(page.getByRole("cell", { name: "Tomaten" })).toBeVisible();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Produkt Tomaten (#42) löschen?");
    void dialog.dismiss();
  });
  await page.getByRole("button", { name: "Löschen" }).click();
  expect(deleteCalls).toBe(0);
  await expect(page.getByRole("cell", { name: "Tomaten" })).toBeVisible();

  page.once("dialog", (dialog) => { void dialog.accept(); });
  await page.getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText("Produkt Tomaten wurde gelöscht.", { exact: true })).toBeVisible();
  await expect(page.getByText("Der Produktkatalog ist leer.")).toBeVisible();
  expect(deleteCalls).toBe(1);
});

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const IMPORT_STORE = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz", region: null };
/** Ein zugänglicher Markt wird automatisch gewählt; ohne diesen Mock lädt die Produktseite keine Produkte. */
async function mockSingleStore(page: Page) {
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [IMPORT_STORE], page: 0, size: 100, totalElements: 1 } }));
}
const IMPORT_LAYOUT = {
  shopName: "Indooro Linz",
  gridSize: { width: 40, height: 40 },
  elements: [
    { id: 1, type: "shelf", x: 2, y: 4, width: 1, height: 6, category: "310/1", meter: 1, label: "Gang 1 · links · Obst", productPositions: [] },
    { id: 2, type: "shelf", x: 2, y: 14, width: 1, height: 6, category: "420/1", meter: 1, label: "Gang 2 · links · Milch", productPositions: [] }
  ]
};
const CSV_HEADER = "id;name;kategorie;meter;fach;reihe;preis";

interface BulkCall { query: string; key: string; body: Array<Record<string, unknown>> }
interface BulkReply { status: number; json: unknown }

const savedReply = (count: number): BulkReply => ({
  status: 200,
  json: {
    message: "ok",
    count,
    saved: count,
    failed: 0,
    unknown: 0,
    rows: Array.from({ length: count }, (_, index) => ({ row: index + 1, id: String(index + 1), status: "saved", reason: null }))
  }
});

/** Admin mit einem Markt, Layout mit Regalen 310/1 und 420/1 und einem Bulk-Endpunkt, der `reply` je Aufruf liefert. */
async function mockProductImport(page: Page, options: { existingIds?: number[]; reply?: (call: BulkCall, attempt: number) => BulkReply } = {}) {
  const bulkCalls: BulkCall[] = [];
  const existing = (options.existingIds ?? []).map((id) => ({ id, name: `Bestand ${id}`, price: 1, layoutCode: "310/1/1/1", storeId: "store-1", storeCode: "LINZ-01" }));
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst" }] }));
  await page.route("**/api/stores?*", (route) => route.fulfill({ json: { content: [IMPORT_STORE], page: 0, size: 100, totalElements: 1 } }));
  await page.route("**/api/stores/store-1/layout/editor-context", (route) => route.fulfill({ json: { store: IMPORT_STORE, currentLayout: { layoutId: "active-1", versionNo: 1, status: "ACTIVE", layout: IMPORT_LAYOUT }, assignedBeacons: [] } }));
  await page.route("**/api/admin/products?*", (route) => route.fulfill({ json: { content: existing, page: 0, size: 20, totalElements: existing.length } }));
  await page.route("**/api/admin/products/bulk?*", async (route) => {
    const url = new URL(route.request().url());
    const call: BulkCall = {
      query: url.search,
      key: (await route.request().headerValue("idempotency-key")) ?? "",
      body: route.request().postDataJSON() as Array<Record<string, unknown>>
    };
    bulkCalls.push(call);
    const reply = options.reply?.(call, bulkCalls.length) ?? savedReply(call.body.length);
    return route.fulfill({ status: reply.status, json: reply.json });
  });
  await page.goto("/admin/next/products/");
  await expect(page.getByRole("combobox", { name: "Markt" })).toHaveValue("store-1");
  await expect(page.getByLabel("CSV-Datei wählen")).toBeEnabled();
  return { bulkCalls };
}

const uploadCsv = (page: Page, text: string) =>
  page.getByLabel("CSV-Datei wählen").setInputFiles({ name: "produkte.csv", mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });

test("product CSV import shows row errors and keeps commit blocked", async ({ page }) => {
  const { bulkCalls } = await mockProductImport(page);
  await uploadCsv(page, [CSV_HEADER, "1;Apfel;310;1;1;1;1,99", "2;Birne;310;7;1;1;1,49"].join("\n"));

  await expect(page.getByText("2 Zeilen · 1 gültig · 1 ungültig")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Kein Regal 310/7 im aktiven Layout.", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "kategorie", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Produkte importieren" })).toBeDisabled();
  await expect(page.getByText("Vor dem Import alle Fehler in der Datei beheben.")).toBeVisible();
  expect(bulkCalls).toHaveLength(0);
});

test("product CSV import needs explicit overwrite confirmation and sends one keyed batch", async ({ page }) => {
  const { bulkCalls } = await mockProductImport(page, { existingIds: [2] });
  await uploadCsv(page, [CSV_HEADER, "1;Apfel;310;1;1;1;1,99", "2;Birne;420;1;1;2;1,49"].join("\n"));

  await expect(page.getByText("2 Zeilen · 2 gültig · 0 ungültig")).toBeVisible();
  await expect(page.getByText("1 vorhandene Produkte würden überschrieben: 2")).toBeVisible();
  const commit = page.getByRole("button", { name: "Produkte importieren" });
  await expect(commit).toBeDisabled();
  await page.getByLabel("Vorhandene Produkte überschreiben").check();
  await expect(commit).toBeEnabled();
  await commit.click();

  await expect(page.getByText("Import abgeschlossen: 2 Produkte gespeichert.")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Importfortschritt" })).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByRole("cell", { name: "Gespeichert", exact: true })).toHaveCount(2);
  expect(bulkCalls).toHaveLength(1);
  expect(bulkCalls[0].query).toContain("storeCode=LINZ-01");
  expect(bulkCalls[0].key).toMatch(IDEMPOTENCY_KEY_PATTERN);
  expect(bulkCalls[0].body).toEqual([
    { id: 1, name: "Apfel", price: 1.99, layoutCode: "310/1/1/1" },
    { id: 2, name: "Birne", price: 1.49, layoutCode: "420/1/1/2" }
  ]);
});

test("product CSV import retries an unconfirmed batch with the same key and reports the result", async ({ page }) => {
  const { bulkCalls } = await mockProductImport(page, {
    reply: (_call, attempt) => (attempt === 1 ? { status: 503, json: { message: "Transport failed" } } : savedReply(2))
  });
  await uploadCsv(page, [CSV_HEADER, "1;Apfel;310;1;1;1;1,99", "2;Birne;420;1;1;2;1,49"].join("\n"));
  await page.getByRole("button", { name: "Produkte importieren" }).click();

  await expect(page.getByRole("heading", { name: "Ergebnis unklar" })).toBeVisible();
  await expect(page.getByText("Unklar: 2")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Importfortschritt" })).toBeVisible();
  await page.getByRole("button", { name: "Wiederholen" }).click();

  await expect(page.getByText("Import abgeschlossen: 2 Produkte gespeichert.")).toBeVisible();
  await expect(page.getByText("Unklar: 0")).toBeVisible();
  expect(bulkCalls).toHaveLength(2);
  expect(bulkCalls[1].key).toBe(bulkCalls[0].key);
  expect(bulkCalls[1].body).toEqual(bulkCalls[0].body);
});

test("product CSV import stops after a 409 on the first batch and does not send the rest", async ({ page }) => {
  const rows = Array.from({ length: 150 }, (_, index) => `${index + 1};Produkt ${index + 1};310;1;${(index % 7) + 1};1;1,00`);
  const { bulkCalls } = await mockProductImport(page, {
    reply: () => ({ status: 409, json: { error: "Idempotency-Key wurde bereits für eine andere Anfrage verwendet." } })
  });
  await uploadCsv(page, [CSV_HEADER, ...rows].join("\n"));
  await expect(page.getByText("150 Zeilen · 150 gültig · 0 ungültig")).toBeVisible();
  await page.getByRole("button", { name: "Produkte importieren" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Import abgebrochen: Idempotency-Key wurde bereits für eine andere Anfrage verwendet." })).toBeVisible();
  await expect(page.getByText("50 Produkte wurden nicht gesendet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Produkte importieren" })).toBeDisabled();
  expect(bulkCalls).toHaveLength(1);
  expect(bulkCalls[0].body).toHaveLength(100);
});

test("product CSV import shows the access message when the bulk call is forbidden", async ({ page }) => {
  const { bulkCalls } = await mockProductImport(page, {
    reply: () => ({ status: 403, json: { error: "Kein Zugriff auf diesen Markt." } })
  });
  await uploadCsv(page, [CSV_HEADER, "1;Apfel;310;1;1;1;1,99"].join("\n"));
  await page.getByRole("button", { name: "Produkte importieren" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Import abgebrochen: Für diese Aktion fehlen die Berechtigungen." })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Fehlgeschlagen", exact: true })).toBeVisible();
  expect(bulkCalls).toHaveLength(1);
});
