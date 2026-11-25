// Usage (from admin-ui/): npm run package:candidate && node ../docs/polish/admin-pages/shots2.mjs after2
// Serves the packaged candidate via scripts/serve-candidate.mjs (port 4188), mocks the API with long codes/ids,
// screenshots the admin tables at 1280x800 and 1440x900 and reports horizontal document overflow and wrapped codes.
import { createRequire } from "node:module";
const { chromium } = createRequire(process.cwd() + "/")("@playwright/test");
import { spawn } from "node:child_process";

const tag = process.argv[2] || "after2";
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

const routes = [
  ["**/api/admin/me", adm], ["**/api/regions**", [region]], ["**/api/stores?*", { content: [store], page: 0, size: 100, totalElements: 1 }],
  ["**/api/beacons**", beacons], ["**/api/categories**", [{ categoryCode: 310, categoryName: "Obst und Gemüse" }]],
  ["**/api/admin/products?*", { content: [{ id: 100, name: "Apfel Gala", price: 1.5, layoutCode: "310/1/1/1", storeId: store.id, storeCode: store.storeCode }], page: 0, size: 20, totalElements: 1 }],
  ["**/api/admin/recipe-tags?*", []], ["**/api/admin/recipes?*", { content: [recipe], page: 0, size: 20, totalElements: 1 }],
  ["**/api/admin/access-assignments**", [assignment]],
  ["**/api/admin/index", { alias: "products_live", sourceIndex: "products_live", sourceCount: 153, activeIndices: ["products_v1"], versions: [{ name: "products_v1_20261104T080000", docCount: 153, active: true }, { name: "products_v2_20261111T080000", docCount: 150, active: false }] }],
  ["**/api/admin/logs?*", { limit: 50, entries }], ["**/api/admin/error-logs?*", { limit: 50, entries: errors }]
];
const pages = { beacons: "beacons", stores: "stores", regions: "regions", products: "products", categories: "categories", recipes: "recipes", access: "access", "search-index": "search-index", diagnostics: "server-logs" };
const sizes = [[1280, 800], [1440, 900]];

const browser = await chromium.launch();
for (const [w, h] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  for (const [pattern, json] of routes) await page.route(pattern, (r) => r.fulfill({ json }));
  for (const [name, path] of Object.entries(pages)) {
    await page.goto(`http://127.0.0.1:4188/admin/next/${path}/`);
    await page.waitForTimeout(700);
    const info = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      wrapped: [...document.querySelectorAll(".data-table td code, .data-table td strong, .data-table td small, .copy-id code")].filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight || "20") * 1.6).map((e) => e.textContent.slice(0, 40))
    }));
    console.log(`${name} ${w}: overflow=${info.overflow} wrapped=${JSON.stringify(info.wrapped)}`);
    await page.screenshot({ path: `${out}${name}-${w}-${tag}.png`, fullPage: true });
  }
  await ctx.close();
}
await browser.close();
server.kill();
