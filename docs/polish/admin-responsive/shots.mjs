// Usage (from admin-ui/): npm run package:candidate && node ../docs/polish/admin-responsive/shots.mjs
// Serves the packaged candidate via scripts/serve-candidate.mjs (port 4188), mocks the API with long codes/ids,
// screenshots every admin page at 390x844, 768x1024 and 1280x800 and reports horizontal document overflow,
// the number of h1 elements and (below 900 px) interactive targets smaller than 40 px.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/")("@playwright/test");
import { spawn } from "node:child_process";

const tag = process.argv[2] || "";
const out = new URL("./", import.meta.url).pathname;
const server = spawn("node", ["scripts/serve-candidate.mjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1000));

const uuid = "fda50693a4e24fb1afcfc6eb07647825";
const region = { id: "region-1", code: "AT-OBEROESTERREICH", name: "Oberösterreich", description: "Region Linz und Umgebung", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const store = { id: "store-1", storeCode: "SPAR-Leonding-Testraum-002", name: "SPAR Leonding Testraum", city: "Leonding", status: "ACTIVE", region: { id: "region-1", name: "Oberösterreich" }, updatedAt: "2026-11-04T08:00:00Z" };
const beacons = [1, 2, 3, 4].map((n) => ({ id: `b${n}`, beaconCode: `SPAR-LEO-BEACON-00${n}`, uuid, major: 1, minor: n, identityKey: `${uuid}:1:${n}`, status: "ACTIVE", notes: n === 1 ? "Montiert links neben dem Eingang an der Kühlregal-Oberkante, Kabelkanal beachten" : null, currentStore: n % 2 ? store : null, createdAt: "", updatedAt: "" }));
const adm = { subject: "admin-sub", username: "indooro-admin", email: null, role: "admin", scope: null };
const assignment = { id: "a1", keycloakSubject: "8f3c1d2e-aaaa-4bbb-8ccc-0123456789ab", username: "marktleiter.leonding", email: "marktleiter.leonding@spar-beispiel.example", role: "store-manager", regionId: null, regionName: null, storeId: store.id, storeCode: store.storeCode, storeName: store.name, status: "ACTIVE", createdAt: "2026-11-04T08:00:00Z", updatedAt: "2026-11-04T08:00:00Z" };
const recipe = { id: "recipe-1", slug: "apfel-hafer-crumble-mit-zimt-und-vanille", title: "Apfel-Hafer-Crumble", summary: "Kurz", servings: 4, status: "DRAFT", mappedIngredientCount: 1, totalIngredientCount: 1, stepCount: 1, tags: [], ingredients: [], steps: [], updatedAt: "2026-11-04T08:00:00Z" };
const entries = [{ id: "a1", entityType: "STORE", action: "UPDATE", summary: "Filiale geändert", actorLabel: "Erik", createdAt: "2026-10-11T10:00:00Z" }];
const errors = [{ id: "e2", statusCode: 400, method: "POST", path: "/api/admin/products/import-validate", message: "Validation failed", errorType: "InputError", stackTrace: null, createdAt: "2026-10-11T10:01:00Z" }];

const detail = { ...store, street: "Limesstraße 12", zipCode: "4060", country: "AT", latitude: null, longitude: null, notes: "Testraum im Erdgeschoß", readinessProfile: "testroom", region: { id: "region-1", code: "AT-OOE", name: "Oberösterreich" }, activeLayout: { id: "layout-1", versionNo: 3 } };
const report = { storeId: "store-1", layoutId: "layout-1", layoutVersionNo: 3, radius: 8, status: "RED", blockingCount: 1, warningCount: 1, profile: "testroom", coverageComputed: true, minBeaconsPerCell: 3, maxLowCoverageShare: 0.05,
  counts: { shelves: 12, entrances: 1, products: 340, placedBeacons: 4, assignedBeacons: 5, walkableCells: 300, lowCoverageCells: 12 },
  findings: [{ severity: "WARNING", code: "BEACON_NOT_PLACED", message: "Beacon zugewiesen, aber nicht platziert.", elementId: null, productId: null, layoutCode: null, beaconCode: "SPAR-LEO-BEACON-002" }, { severity: "BLOCKING", code: "PRODUCT_WITHOUT_SHELF", message: "Produkt hat keinen passenden Regalplatz.", elementId: null, productId: 42, layoutCode: "310/1/1/1", beaconCode: null }] };
const layout = { layoutId: "layout-1", storeId: "store-1", versionNo: 3, status: "ACTIVE", createdAt: "2026-10-10T08:00:00Z", activatedAt: "2026-10-11T09:00:00Z", layout: { shopName: store.name, gridSize: { width: 40, height: 60 }, elements: [{ id: 1, type: "entrance", x: 1, y: 1, width: 3, height: 1, label: "Eingang" }, ...[1, 2, 3, 4].map((n) => ({ id: 100 + n, type: "anchor", x: n * 2, y: 3, width: 1, height: 1, label: `Gang ${n} Anfang`, anchorId: `A${n}` }))] } };

// Later entries win: Playwright tries the most recently registered route first.
const routes = [
  ["**/api/admin/me", adm], ["**/api/regions**", [region]], ["**/api/stores?*", { content: [store], page: 0, size: 100, totalElements: 1 }],
  ["**/api/stores/store-1", detail], ["**/api/stores/store-1/beacons", [{ beaconId: "b1", beaconCode: "SPAR-LEO-BEACON-001", identityKey: `${uuid}:1:1`, assignedAt: "2026-10-11T10:00:00Z" }]],
  ["**/api/stores/store-1/layout/versions", [{ layoutId: "layout-1", versionNo: 3, status: "ACTIVE", layoutName: "Verkaufsfläche", createdAt: "2026-10-10T08:00:00Z", activatedAt: "2026-10-11T09:00:00Z" }]],
  ["**/api/stores/store-1/layout/current", layout], ["**/api/stores/store-1/audit", { entries }], ["**/api/stores/store-1/readiness*", report],
  ["**/api/mobile/stores/store-1/layout/current", { storeId: "store-1", source: "ACTIVE", fallback: false, layout: {} }], ["**/api/products?*", []], ["**/api/products/search?*", []],
  ["**/api/beacons**", beacons], ["**/api/beacons/free", [beacons[1]]], ["**/api/categories**", [{ categoryCode: 310, categoryName: "Obst und Gemüse" }]],
  ["**/api/admin/products?*", { content: [{ id: 100, name: "Apfel Gala", price: 1.5, layoutCode: "310/1/1/1", storeId: store.id, storeCode: store.storeCode }], page: 0, size: 20, totalElements: 1 }],
  ["**/api/admin/recipe-tags?*", []], ["**/api/admin/recipes?*", { content: [recipe], page: 0, size: 20, totalElements: 1 }], ["**/api/admin/recipes/recipe-1", recipe],
  ["**/api/admin/access-assignments**", [assignment]],
  ["**/api/admin/index", { alias: "products_live", sourceIndex: "products_live", sourceCount: 153, activeIndices: ["products_v1"], versions: [{ name: "products_v1_20261104T080000", docCount: 153, active: true }, { name: "products_v2_20261111T080000", docCount: 150, active: false }] }],
  ["**/api/admin/logs?*", { limit: 50, entries }], ["**/api/admin/error-logs?*", { limit: 50, entries: errors }]
];

const click = (name) => (page) => page.getByRole("button", { name, exact: true }).first().click();
const csv = async (page, label, text) => { await page.getByLabel(label).first().fill(text); };
// [name, path, optional interaction before the screenshot]
const pages = [
  ["dashboard", ""], ["regions", "regions/"], ["stores", "stores/"], ["store-create", "stores/new/"], ["store-detail", "stores/detail/?storeId=store-1"],
  ["store-detail-edit", "stores/detail/?storeId=store-1&edit=1"], ["beacons", "beacons/"], ["beacons-menu", "beacons/", click("Weitere Aktionen für SPAR-LEO-BEACON-001")],
  ["beacons-create", "beacons/", click("Beacon anlegen")], ["products", "products/"], ["categories", "categories/"], ["recipes", "recipes/"], ["recipe-editor", "recipes/", click("Bearbeiten")],
  ["access", "access/"], ["search-index", "search-index/"], ["readiness", "stores/readiness/?storeId=store-1"], ["diagnostics", "server-logs/"],
  ["anchor-print", "stores/anchors/?storeId=store-1"], ["nav-open", "stores/", (page) => page.locator(".menu-toggle").click()],
  ["forbidden", ""]
];
const only = process.env.ONLY?.split(",");

function audit(narrow) {
  const small = !narrow ? [] : [...document.querySelectorAll("a[href], button, select, input:not([type=hidden]), textarea, summary")].filter((element) => {
    if (element.closest(".skip-link, .visually-hidden") || element.matches(".skip-link")) return false;
    const target = element.matches("input[type=checkbox], input[type=radio]") ? element.closest("label") ?? element : element;
    const box = target.getBoundingClientRect();
    const inline = element.matches("a") && getComputedStyle(element).display === "inline" && element.closest("p");
    return box.width > 0 && !inline && (box.height < 39.5 || box.width < 39.5);
  }).map((element) => `${element.tagName.toLowerCase()}.${element.className} "${(element.getAttribute("aria-label") || element.textContent || element.name || element.type || "").slice(0, 30)}" ${Math.round(element.getBoundingClientRect().width)}x${Math.round(element.getBoundingClientRect().height)}`);
  return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, h1: document.querySelectorAll("h1").length, small };
}

const browser = await chromium.launch();
for (const [w, h] of [[390, 844], [768, 1024], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  for (const [name, path, act] of pages) {
    if ((only && !only.includes(name)) || (name === "nav-open" && w > 900)) continue;
    const page = await ctx.newPage();
    await page.route("**/api/**", (r) => r.fulfill({ status: 404, json: { error: "not mocked" } }));
    for (const [pattern, json] of routes) await page.route(pattern, (r) => r.fulfill({ json }));
    if (name === "forbidden") {
      await page.route("**/api/admin/me", (r) => r.fulfill({ status: 403, json: { error: "Kein aktiver Indooro Admin-Zugriff für diesen Benutzer." } }));
      await page.route("**/api/admin/me/identity", (r) => r.fulfill({ json: { subject: assignment.keycloakSubject, username: "neu.benutzer", email: "neu.benutzer@spar-beispiel.example" } }));
    }
    await page.goto(`http://127.0.0.1:4188/admin/next/${path}`);
    await page.waitForTimeout(600);
    if (act) { await act(page).catch((error) => console.log(`${name} ${w}: interaction failed: ${error.message.split("\n")[0]}`)); await page.waitForTimeout(400); }
    const info = await page.evaluate(audit, w <= 900);
    console.log(`${name} ${w}: overflow=${info.overflow} h1=${info.h1}${info.small.length ? ` small=${JSON.stringify(info.small)}` : ""}`);
    await page.screenshot({ path: `${out}${name}-${w}${tag ? `-${tag}` : ""}.png`, fullPage: !act });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
server.kill();
