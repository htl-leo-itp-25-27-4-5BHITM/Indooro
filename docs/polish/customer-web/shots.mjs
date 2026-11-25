// Usage: ADMIN_SMOKE_PORT=5185 node scripts/serve-admin-smoke.mjs &  node docs/polish/customer-web/shots.mjs before|after
// Screenshots landing + customer web at 375x812, 768x1024, 1440x900 with mocked API; reports horizontal overflow.
import { chromium } from "@playwright/test";

const tag = process.argv[2] || "after";
const out = "docs/polish/customer-web/";
const O = "http://127.0.0.1:5185";
const STORES = [{ id: "store-spar", storeCode: "SPAR-Leonding-001", name: "SPAR Leonding", city: "Leonding", address: "Hauptstraße 1", latitude: 48.27, longitude: 14.25 }];
const LAYOUT = {
  shopName: "SPAR Leonding", gridSize: { width: 20, height: 12 },
  elements: [
    { id: "ent", type: "entrance", x: 0, y: 11, width: 2, height: 1 },
    { id: "e1", type: "anchor", x: 10, y: 1, width: 1, height: 1, anchorId: "E1" },
    { id: "s1", type: "shelf", x: 2, y: 9, width: 6, height: 1, category: "800/1", label: "Gang 4 · links · Backzutaten" },
    { id: "s2", type: "shelf", x: 10, y: 3, width: 3, height: 1, rotation: 45, category: "310/2" },
    { id: "w1", type: "wall", x: 0, y: 6, width: 8, height: 1 }
  ]
};
const PRODUCTS = [
  { id: 1, name: "Backpulver", price: 1.99, layoutCode: "800/1/3/2", storeCode: "SPAR-Leonding-001" },
  { id: 2, name: "Mehl", price: 0.89, layoutCode: "310/2/1/1", storeCode: "SPAR-Leonding-001" }
];
const VP = { mobile: [375, 812], tablet: [768, 1024], desktop: [1440, 900] };

const browser = await chromium.launch();
const report = [];
for (const [vn, [w, h]] of Object.entries(VP)) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.route("**/api/mobile/stores", (r) => r.fulfill({ json: STORES }));
  await page.route("**/api/mobile/stores/*/layout/current", (r) => r.fulfill({ json: { storeId: "store-spar", layoutId: "l1", source: "PUBLISHED", fallback: false, layout: LAYOUT } }));
  await page.route("**/api/products/search?*", (r) => {
    const q = (new URL(r.request().url()).searchParams.get("q") || "").toLowerCase();
    r.fulfill({ json: PRODUCTS.filter((p) => p.name.toLowerCase().includes(q)) });
  });
  const snap = async (name) => {
    await page.screenshot({ path: `${out}${tag}-${name}-${vn}.png`, fullPage: true });
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    if (o.sw > o.cw) report.push(`OVERFLOW ${name} ${vn} ${o.sw}>${o.cw}`);
  };
  await page.goto(O + "/"); await snap("landing");
  await page.goto(O + "/customer/"); await page.waitForSelector("#store-list button"); await snap("stores");
  await page.goto(O + "/customer/?store=SPAR-Leonding-001&a=E1"); await page.waitForSelector("#search-input:visible"); await snap("finder-empty");
  for (const q of ["Mehl", "Backpulver"]) {
    await page.fill("#search-input", q); await page.waitForTimeout(700);
    await page.getByRole("button", { name: "Zur Liste" }).first().click();
  }
  await page.fill("#search-input", "Back"); await page.waitForTimeout(700); await snap("finder-results");
  await page.fill("#search-input", ""); await page.waitForTimeout(400); await snap("finder-list");
  await page.fill("#search-input", "zzzz"); await page.waitForTimeout(800); await snap("finder-noresult");
  await ctx.close();
}
console.log(report.join("\n") || "no horizontal overflow");
await browser.close();
