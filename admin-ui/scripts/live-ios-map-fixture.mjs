import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Creates disposable, map-visible data in the dedicated local acceptance stack.
const base = process.env.ADMIN_SMOKE_BASE_URL ?? "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8").replace(/\$\{(\w+)\}/g, (match, name) => process.env[name] ?? match));
const admin = realm.users[0];
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  assert.equal(response.status(), 200, `${method} ${path}: HTTP ${response.status()} ${raw.slice(0, 300)}`);
  return body;
}

try {
  const page = await browser.newPage();
  await page.goto(base + "/admin/next/", { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(admin.username);
  await page.locator("#password").fill(admin.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/**", { timeout: 15_000 });

  const suffix = randomUUID().slice(0, 7).toUpperCase();
  const region = await api(page, "POST", "/api/regions", { code: `IOS-${suffix}`, name: `iOS Simulator ${suffix}` });
  const store = await api(page, "POST", "/api/stores", {
    regionId: region.id,
    storeCode: `IOS-STORE-${suffix}`,
    name: `AAA iOS Editor ${suffix}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
    latitude: 48.3069, longitude: 14.2858,
  });
  const layout = {
    shopName: `iOS Editor ${suffix}`,
    gridSize: { width: 40, height: 60 },
    elements: [
      { id: 1, type: "entrance", x: 19, y: 0, width: 2, height: 1, label: "Eingang" },
      { id: 2, type: "shelf", x: 5, y: 9, width: 4, height: 2, category: "3100/1", meter: 1, label: "Falsches Präfixregal" },
      { id: 3, type: "shelf", x: 19, y: 9, width: 4, height: 2, category: "310/1", meter: 1, label: "Richtiges Regal" },
    ],
  };
  const version = await api(page, "POST", `/api/stores/${store.id}/layout/versions`, {
    layoutName: layout.shopName, activate: true, layout,
  });
  assert.equal(version.status, "ACTIVE");

  const productId = Number(String(Date.now()).slice(-9));
  const product = await api(page, "POST", "/api/admin/products", {
    id: productId,
    name: `iOS Routenprodukt ${suffix}`,
    price: 2.49,
    layoutCode: "310/1/1/1",
    storeCode: store.storeCode,
  });
  const missingProductId = productId + 1;
  const missingProduct = await api(page, "POST", "/api/admin/products", {
    id: missingProductId,
    name: `iOS Fehlziel ${suffix}`,
    price: 1.49,
    layoutCode: "310/2/1/1",
    storeCode: store.storeCode,
  });
  const publicStores = await (await fetch(base + "/api/mobile/stores")).json();
  assert.ok(publicStores.some((item) => item.id === store.id && item.latitude === 48.3069));
  const publicLayout = await (await fetch(`${base}/api/mobile/stores/${store.id}/layout/current`)).json();
  assert.equal(publicLayout.layout.elements.find((item) => item.category === "310/1")?.id, 3);
  console.log(JSON.stringify({ storeId: store.id, storeName: store.name, layoutId: version.layoutId, productId: product.id ?? productId, productName: `iOS Routenprodukt ${suffix}`, missingProductId: missingProduct.id ?? missingProductId, missingProductName: `iOS Fehlziel ${suffix}` }));
} finally {
  await browser.close();
}
