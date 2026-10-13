import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Explicit local-stack acceptance check. It creates disposable records in the
// dedicated admin-rebuild PostgreSQL container and never prints demo passwords.
const base = "http://localhost:8080";
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });

async function login(user, path = "/admin/next/") {
  const page = await browser.newPage();
  await page.goto(base + path, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL(`**${path.split("?")[0]}*`, { timeout: 15_000 });
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(base + path, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { status: response.status(), body };
}

function expectOk(result, action) {
  assert.equal(result.status, 200, `${action}: HTTP ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`);
  return result.body;
}

async function publicJson(path) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, `anonymous ${path}: HTTP ${response.status}`);
  return response.json();
}

function currentLayout(storeId) {
  return fetch(`${base}/api/mobile/stores/${storeId}/layout/current`).then(async (response) => {
    assert.equal(response.status, 200, "anonymous current layout");
    return response.json();
  });
}

function assignDemoScopes(regionId, storeId) {
  const sql = `INSERT INTO user_access_assignments
    (id, keycloak_subject, username, email, role, region_id, store_id, status, created_at, updated_at)
    VALUES
    (gen_random_uuid(), '${regionUser.id}', '${regionUser.username}', '${regionUser.email}', 'region-manager', '${regionId}', NULL, 'ACTIVE', NOW(), NOW()),
    (gen_random_uuid(), '${storeUser.id}', '${storeUser.username}', '${storeUser.email}', 'store-manager', NULL, '${storeId}', 'ACTIVE', NOW(), NOW())
    ON CONFLICT (keycloak_subject) WHERE status = 'ACTIVE'
    DO UPDATE SET region_id = EXCLUDED.region_id, store_id = EXCLUDED.store_id, updated_at = NOW()`;
  execFileSync("docker", ["exec", "indooro-admin-rebuild-pg", "psql", "-U", "indooro", "-d", "indooro", "-c", sql], { stdio: "pipe" });
}

function activeCount(storeId) {
  const sql = `SELECT COUNT(*) FROM layout_versions WHERE store_id = '${storeId}' AND status = 'ACTIVE'`;
  return Number(execFileSync("docker", ["exec", "indooro-admin-rebuild-pg", "psql", "-U", "indooro", "-d", "indooro", "-Atc", sql], { encoding: "utf8" }).trim());
}

const documentFor = (name) => ({
  shopName: name,
  gridSize: { width: 20, height: 20 },
  elements: [
    { id: 1, type: "entrance", x: 2, y: 0, width: 3, height: 1, label: "Eingang" },
    { id: 2, type: "shelf", x: 5, y: 5, width: 3, height: 2, category: "310/1", meter: 1, label: name },
  ],
});

try {
  const admin = await login(adminUser);
  assert.equal(expectOk(await api(admin, "GET", "/api/admin/me"), "admin login").role, "admin");
  const indexInitialization = await api(admin, "POST", "/api/admin/index/create", {});
  assert.ok([200, 409].includes(indexInitialization.status), `product index initialization: HTTP ${indexInitialization.status}`);
  const categoryInitialization = await api(admin, "POST", "/api/categories", { categoryCode: 310, categoryName: "Obst & Gemüse" });
  assert.ok([200, 409].includes(categoryInitialization.status), `category initialization: HTTP ${categoryInitialization.status}`);
  assert.ok(Array.isArray(await publicJson("/api/categories?size=5")), "anonymous category reads stay public");
  const run = Date.now().toString(36).slice(-7).toUpperCase();
  const region = expectOk(await api(admin, "POST", "/api/regions", { code: `LIVE-${run}`, name: `Live Region ${run}` }), "region create");
  const store = expectOk(await api(admin, "POST", "/api/stores", {
    regionId: region.id, storeCode: `LIVE-STORE-${run}`, name: `Live Store ${run}`,
    street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
  }), "store create");
  const foreignRegion = expectOk(await api(admin, "POST", "/api/regions", { code: `OTHER-${run}`, name: `Other Region ${run}` }), "other region create");
  const foreignStore = expectOk(await api(admin, "POST", "/api/stores", {
    regionId: foreignRegion.id, storeCode: `OTHER-STORE-${run}`, name: `Other Store ${run}`,
    street: "Fremdgasse 2", zipCode: "1010", city: "Wien", country: "AT",
  }), "other store create");
  const ownBeacon = expectOk(await api(admin, "POST", "/api/beacons", { beaconCode: `LIVE-B-${run}`, uuid: randomUUID(), major: 1, minor: 1 }), "beacon create");
  const foreignBeacon = expectOk(await api(admin, "POST", "/api/beacons", { beaconCode: `OTHER-B-${run}`, uuid: randomUUID(), major: 1, minor: 2 }), "foreign beacon create");
  expectOk(await api(admin, "POST", `/api/beacons/${foreignBeacon.id}/assign`, { storeId: foreignStore.id }), "foreign beacon assign");
  assignDemoScopes(region.id, store.id);
  const uiRegionCode = `UI-${run}`;
  const uiRegionName = `UI Region ${run}`;
  await admin.goto(`${base}/admin/next/regions/`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: "Region anlegen" }).click();
  await admin.getByRole("textbox", { name: "Code" }).fill(uiRegionCode);
  await admin.getByRole("textbox", { name: "Name", exact: true }).fill(uiRegionName);
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByRole("cell", { name: uiRegionName }).waitFor();
  const uiRegion = expectOk(await api(admin, "GET", "/api/regions?status=ACTIVE"), "candidate region create")
    .find((item) => item.code === uiRegionCode);
  assert.ok(uiRegion, "candidate region create persists in the API");
  await admin.getByRole("button", { name: "Bearbeiten" }).click();
  const editedUiRegionName = `${uiRegionName} geprüft`;
  await admin.getByRole("textbox", { name: "Name", exact: true }).fill(editedUiRegionName);
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByRole("cell", { name: editedUiRegionName }).waitFor();
  assert.equal(expectOk(await api(admin, "GET", `/api/regions/${uiRegion.id}`), "candidate region edit").name, editedUiRegionName);
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("button", { name: "Archivieren" }).click();
  await admin.getByRole("status").getByText(`Region „${editedUiRegionName}“ wurde archiviert.`).waitFor();
  assert.equal(expectOk(await api(admin, "GET", `/api/regions/${uiRegion.id}`), "candidate region archive").status, "ARCHIVED");
  await admin.getByLabel("Status").selectOption("ARCHIVED");
  await admin.getByRole("cell", { name: editedUiRegionName }).waitFor();
  const uiBeaconCode = `UI-B-${run}`;
  const editedUiBeaconCode = `${uiBeaconCode}-EDIT`;
  await admin.goto(`${base}/admin/next/beacons/`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: "Beacon anlegen" }).click();
  await admin.getByRole("textbox", { name: "Beacon-Code" }).fill(uiBeaconCode);
  await admin.getByRole("textbox", { name: "UUID", exact: true }).fill(randomUUID());
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByRole("status").getByText("Beacon wurde angelegt.").waitFor();
  const uiBeacon = expectOk(await api(admin, "GET", `/api/beacons?query=${uiBeaconCode}`), "candidate beacon create")
    .find((item) => item.beaconCode === uiBeaconCode);
  assert.ok(uiBeacon, "candidate beacon create persists in the API");
  await admin.getByRole("row").filter({ hasText: uiBeaconCode }).getByRole("button", { name: "Bearbeiten" }).click();
  await admin.getByRole("textbox", { name: "Beacon-Code" }).fill(editedUiBeaconCode);
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByRole("status").getByText("Beacon wurde gespeichert.").waitFor();
  assert.equal(expectOk(await api(admin, "GET", `/api/beacons/${uiBeacon.id}`), "candidate beacon edit").beaconCode, editedUiBeaconCode);
  await admin.getByRole("row").filter({ hasText: editedUiBeaconCode }).getByRole("button", { name: "Zuweisen" }).click();
  await admin.getByLabel("Ziel-Store").selectOption(store.id);
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("button", { name: "Zuweisung bestätigen" }).click();
  await admin.getByRole("status").getByText(`${editedUiBeaconCode} wurde ${store.name} zugewiesen.`).waitFor();
  assert.equal(expectOk(await api(admin, "GET", `/api/beacons/${uiBeacon.id}`), "candidate beacon assign").currentStore?.id, store.id);
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("row").filter({ hasText: editedUiBeaconCode }).getByRole("button", { name: "Freigeben" }).click();
  await admin.getByRole("status").getByText(`${editedUiBeaconCode} wurde freigegeben.`).waitFor();
  assert.equal(expectOk(await api(admin, "GET", `/api/beacons/${uiBeacon.id}`), "candidate beacon release").currentStore, null);
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("row").filter({ hasText: editedUiBeaconCode }).getByRole("button", { name: "Archivieren" }).click();
  await admin.getByRole("status").getByText(`${editedUiBeaconCode} wurde archiviert.`).waitFor();
  assert.equal(expectOk(await api(admin, "GET", `/api/beacons/${uiBeacon.id}`), "candidate beacon archive").status, "ARCHIVED");
  await admin.getByLabel("Status").selectOption("ARCHIVED");
  await admin.getByRole("row").filter({ hasText: editedUiBeaconCode }).waitFor();
  const bulkBeaconCode = `UI-BULK-${run}`;
  const bulkBeaconUuid = randomUUID();
  await admin.getByRole("button", { name: "Bulk anlegen" }).click();
  await admin.getByRole("textbox", { name: "Gemeinsame UUID" }).fill(bulkBeaconUuid);
  await admin.getByRole("textbox", { name: "Gemeinsamer Major" }).fill("5");
  await admin.locator("section[aria-labelledby='beacon-bulk-title'] textarea").last().fill(`${bulkBeaconCode}-1,1\n${bulkBeaconCode}-2,2`);
  await admin.getByRole("button", { name: "Review", exact: true }).click();
  await admin.getByRole("button", { name: "Review bestätigen und 2 anlegen" }).waitFor();
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("button", { name: "Review bestätigen und 2 anlegen" }).click();
  await admin.getByRole("status").getByText("2 Beacons wurden angelegt.").waitFor();
  const bulkBeacons = expectOk(await api(admin, "GET", `/api/beacons?query=${bulkBeaconCode}`), "candidate beacon bulk create");
  assert.equal(bulkBeacons.filter((item) => item.beaconCode.startsWith(bulkBeaconCode)).length, 2);
  assert.ok(bulkBeacons.every((item) => item.uuid.replaceAll("-", "").toLowerCase() === bulkBeaconUuid.replaceAll("-", "").toLowerCase()));
  const mobileStores = await publicJson("/api/mobile/stores");
  assert.ok(Array.isArray(mobileStores));
  const mobileStore = mobileStores.find((item) => item.id === store.id);
  assert.ok(mobileStore, "new store appears in the anonymous iOS store list");
  for (const key of ["id", "storeCode", "name", "city"]) assert.equal(typeof mobileStore[key], "string", `iOS store field ${key}`);
  const beaconIdentities = await publicJson("/api/mobile/stores/beacon-identities");
  assert.ok(Array.isArray(beaconIdentities.uuids));
  assert.ok(Array.isArray(await publicJson("/api/products?size=5")));
  assert.ok(Array.isArray(await publicJson("/api/products/search?q=apfel&size=5")));
  const productId = Math.floor(Date.now() / 1000);
  const productName = `Live Produkt ${run}`;
  expectOk(await api(admin, "POST", "/api/admin/products", { id: productId, name: productName, price: 2.49, layoutCode: "310/1/1/1", storeCode: store.storeCode }), "product create");
  let publicProduct;
  for (let attempt = 0; attempt < 20 && !publicProduct; attempt += 1) {
    publicProduct = (await publicJson(`/api/products/search?q=${encodeURIComponent(productName)}&size=10`)).find((item) => item.id === productId);
    if (!publicProduct) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(publicProduct, "new product appears in the anonymous iOS/customer search");
  assert.equal(publicProduct.name, productName);
  assert.equal(publicProduct.price, 2.49);
  assert.equal(publicProduct.layoutCode, "310/1/1/1");
  await admin.goto(`${base}/admin/next/products/?q=${encodeURIComponent(productName)}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("cell", { name: productName }).waitFor();
  await admin.getByRole("button", { name: "Bearbeiten" }).first().click();
  const updatedProductName = `${productName} geprüft`;
  await admin.getByRole("textbox", { name: "Name" }).fill(updatedProductName);
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByText("Produkt wurde aktualisiert.").waitFor();
  let updatedPublicProduct;
  for (let attempt = 0; attempt < 20 && !updatedPublicProduct; attempt += 1) {
    updatedPublicProduct = (await publicJson(`/api/products/search?q=${encodeURIComponent(updatedProductName)}&size=10`)).find((item) => item.id === productId);
    if (!updatedPublicProduct) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(updatedPublicProduct?.name, updatedProductName, "candidate product edit reaches the public catalog");
  assert.equal(updatedPublicProduct.layoutCode, "310/1/1/1");
  const uiProductId = productId + 1;
  const uiProductName = `UI Produkt ${run}`;
  await admin.getByRole("button", { name: "Produkt anlegen" }).click();
  await admin.getByRole("textbox", { name: "Produkt-ID" }).fill(String(uiProductId));
  await admin.getByRole("textbox", { name: "Name" }).fill(uiProductName);
  await admin.getByRole("textbox", { name: "Preis (EUR)" }).fill("3.29");
  await admin.locator("section[aria-labelledby='product-form-title'] select[required]").selectOption("310");
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByRole("status").getByText("Produkt wurde angelegt.").waitFor();
  let uiPublicProduct;
  for (let attempt = 0; attempt < 20 && !uiPublicProduct; attempt += 1) {
    uiPublicProduct = (await publicJson(`/api/products/search?q=${encodeURIComponent(uiProductName)}&size=10`)).find((item) => item.id === uiProductId);
    if (!uiPublicProduct) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(uiPublicProduct?.name, uiProductName, "candidate product create reaches the public catalog");
  assert.equal(uiPublicProduct.layoutCode, "310/1/1/1");
  await admin.goto(`${base}/admin/next/products/?q=${encodeURIComponent(uiProductName)}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("row").filter({ hasText: uiProductName }).waitFor();
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("row").filter({ hasText: uiProductName }).getByRole("button", { name: "Löschen" }).click();
  await admin.getByRole("status").getByText(`Produkt ${uiProductName} wurde gelöscht.`).waitFor();
  let deletedFromAdmin = false;
  let deletedFromPublic = false;
  for (let attempt = 0; attempt < 20 && (!deletedFromAdmin || !deletedFromPublic); attempt += 1) {
    deletedFromAdmin = !expectOk(await api(admin, "GET", `/api/admin/products?q=${encodeURIComponent(uiProductName)}&page=0&size=10`), "candidate product delete post-state").content.some((item) => item.id === uiProductId);
    deletedFromPublic = !(await publicJson(`/api/products/search?q=${encodeURIComponent(uiProductName)}&size=10`)).some((item) => item.id === uiProductId);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(deletedFromAdmin && deletedFromPublic, "candidate product delete disappears from admin and public search");
  const existingCategories = await publicJson("/api/categories?size=500");
  const usedCategoryCodes = new Set(existingCategories.map((item) => item.categoryCode));
  const liveCategoryCode = Array.from({ length: 500 }, (_, index) => 500 + index).find((code) => !usedCategoryCodes.has(code));
  assert.ok(liveCategoryCode, "a free local category code is available");
  await admin.goto(`${base}/admin/next/categories/`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: "Kategorie anlegen" }).click();
  await admin.getByRole("spinbutton", { name: "Kategorie-Code" }).fill(String(liveCategoryCode));
  await admin.getByRole("textbox", { name: "Name" }).fill(`Live Kategorie ${run}`);
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByRole("status").getByText(`Kategorie ${liveCategoryCode} gespeichert.`).waitFor();
  assert.ok((await publicJson("/api/categories?size=500")).some((item) => item.categoryCode === liveCategoryCode && item.categoryName === `Live Kategorie ${run}`));
  await admin.getByRole("row").filter({ hasText: `Live Kategorie ${run}` }).getByRole("button", { name: "Bearbeiten" }).click();
  await admin.getByRole("textbox", { name: "Name" }).fill(`Geprüfte Kategorie ${run}`);
  await admin.getByRole("button", { name: "Speichern" }).click();
  await admin.getByRole("status").getByText(`Kategorie ${liveCategoryCode} gespeichert.`).waitFor();
  assert.ok((await publicJson("/api/categories?size=500")).some((item) => item.categoryCode === liveCategoryCode && item.categoryName === `Geprüfte Kategorie ${run}`));
  const mobileRecipes = await publicJson("/api/mobile/recipes?page=0&size=5");
  assert.ok(Array.isArray(mobileRecipes.content));

  const recipe = expectOk(await api(admin, "POST", "/api/admin/recipes", {
    recipe: { slug: `live-recipe-${run.toLowerCase()}`, title: `Live Rezept ${run}`, summary: "Lokaler Vertragstest", servings: 2, status: "DRAFT", tagIds: [] },
    ingredients: [{ position: 1, displayName: "Apfel", quantity: 1, unitCode: "piece" }],
    steps: [{ position: 1, instruction: "Apfel schneiden." }],
  }), "recipe draft create");
  assert.equal(recipe.status, "DRAFT");
  assert.equal((await fetch(`${base}/api/mobile/recipes/${recipe.id}`)).status, 404);
  assert.equal(expectOk(await api(admin, "PATCH", `/api/admin/recipes/${recipe.id}/publish`, {}), "recipe publish").status, "PUBLISHED");
  const publicRecipe = await publicJson(`/api/mobile/recipes/${recipe.id}`);
  assert.equal(publicRecipe.title, recipe.title);
  assert.equal(publicRecipe.ingredients[0].displayName, "Apfel");
  assert.equal(publicRecipe.steps[0].instruction, "Apfel schneiden.");
  assert.equal(expectOk(await api(admin, "PATCH", `/api/admin/recipes/${recipe.id}/deactivate`, {}), "recipe deactivate").status, "DRAFT");
  assert.equal((await fetch(`${base}/api/mobile/recipes/${recipe.id}`)).status, 404);
  await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(recipe.title)}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("row").filter({ hasText: recipe.title }).getByRole("button", { name: "Bearbeiten" }).click();
  const recipeDialog = admin.getByRole("dialog");
  const candidateRecipeTitle = `${recipe.title} UI`;
  await recipeDialog.getByRole("textbox", { name: "Titel" }).fill(candidateRecipeTitle);
  await recipeDialog.getByRole("textbox", { name: "Bild-URL" }).fill("/images/live-recipe.jpg");
  await recipeDialog.getByRole("textbox", { name: "Bildbeschreibung" }).fill("Live Rezeptbild");
  await recipeDialog.getByRole("button", { name: "Speichern" }).click();
  await recipeDialog.waitFor({ state: "hidden" });
  const candidateRecipe = expectOk(await api(admin, "GET", `/api/admin/recipes/${recipe.id}`), "candidate recipe edit");
  assert.equal(candidateRecipe.title, candidateRecipeTitle);
  assert.equal(candidateRecipe.imageUrl, "/images/live-recipe.jpg");
  assert.equal(candidateRecipe.imageAlt, "Live Rezeptbild");
  assert.equal(candidateRecipe.ingredients[0].displayName, "Apfel");
  assert.equal(candidateRecipe.steps[0].instruction, "Apfel schneiden.");
  await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(candidateRecipeTitle)}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("row").filter({ hasText: candidateRecipeTitle }).getByRole("button", { name: "Bearbeiten" }).click();
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("dialog").getByRole("button", { name: "Veröffentlichen" }).click();
  await admin.getByRole("dialog").locator(".status-pill").getByText("PUBLISHED").waitFor();
  const candidatePublicRecipe = await publicJson(`/api/mobile/recipes/${recipe.id}`);
  assert.equal(candidatePublicRecipe.title, candidateRecipeTitle);
  assert.equal(candidatePublicRecipe.imageAlt, "Live Rezeptbild");
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("dialog").getByRole("button", { name: "Deaktivieren" }).click();
  await admin.getByRole("dialog").locator(".status-pill").getByText("DRAFT").waitFor();
  assert.equal((await fetch(`${base}/api/mobile/recipes/${recipe.id}`)).status, 404);

  const uiRecipeTitle = `UI Rezept ${run}`;
  await admin.goto(`${base}/admin/next/recipes/`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("button", { name: "Rezept anlegen" }).click();
  const newRecipeDialog = admin.getByRole("dialog");
  await newRecipeDialog.getByRole("textbox", { name: "Slug" }).fill(`ui-recipe-${run.toLowerCase()}`);
  await newRecipeDialog.getByRole("textbox", { name: "Titel" }).fill(uiRecipeTitle);
  await newRecipeDialog.getByRole("button", { name: "+ Zutat" }).click();
  await newRecipeDialog.getByRole("textbox", { name: "Produkt aus Katalog" }).fill(updatedProductName);
  await newRecipeDialog.getByRole("button", { name: "Suchen" }).click();
  await newRecipeDialog.locator(".recipe-product-search select").selectOption(String(productId));
  await newRecipeDialog.getByRole("textbox", { name: "Menge" }).fill("1 Stück");
  await newRecipeDialog.getByRole("button", { name: "+ Schritt" }).click();
  await newRecipeDialog.getByRole("textbox", { name: "Schritt 1" }).fill("Vorbereiten.");
  await newRecipeDialog.getByRole("button", { name: "Entwurf anlegen" }).click();
  await newRecipeDialog.waitFor({ state: "hidden" });
  const uiRecipeList = expectOk(await api(admin, "GET", `/api/admin/recipes?q=${encodeURIComponent(uiRecipeTitle)}&page=0&size=20`), "candidate recipe create list");
  const uiRecipe = uiRecipeList.content.find((item) => item.title === uiRecipeTitle);
  assert.ok(uiRecipe, "candidate recipe create appears in admin list");
  const uiRecipeDetail = expectOk(await api(admin, "GET", `/api/admin/recipes/${uiRecipe.id}`), "candidate recipe create detail");
  assert.equal(uiRecipeDetail.ingredients[0].displayName, updatedProductName);
  assert.equal(uiRecipeDetail.steps[0].instruction, "Vorbereiten.");
  assert.equal((await fetch(`${base}/api/mobile/recipes/${uiRecipe.id}`)).status, 404);
  await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(uiRecipeTitle)}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("row").filter({ hasText: uiRecipeTitle }).getByRole("button", { name: "Bearbeiten" }).click();
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("dialog").getByRole("button", { name: "Veröffentlichen" }).click();
  await admin.getByRole("dialog").locator(".status-pill").getByText("PUBLISHED").waitFor();
  assert.equal((await publicJson(`/api/mobile/recipes/${uiRecipe.id}`)).title, uiRecipeTitle);

  const candidateRoutes = [
    "/admin/next/", "/admin/next/regions/", "/admin/next/stores/", "/admin/next/stores/new/",
    `/admin/next/stores/detail/?storeId=${store.id}`, "/admin/next/beacons/", "/admin/next/products/",
    "/admin/next/categories/", "/admin/next/recipes/", "/admin/next/server-logs/",
    `/admin/next/editor/?storeId=${store.id}`, "/admin/next/editor/",
  ];
  for (const route of candidateRoutes) {
    const response = await admin.goto(base + route, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200, `candidate deep link ${route}`);
    await admin.getByRole("navigation").waitFor();
    const refreshed = await admin.reload({ waitUntil: "domcontentloaded" });
    assert.equal(refreshed.status(), 200, `candidate refresh ${route}`);
  }

  assert.equal((await currentLayout(store.id)).source, "DEFAULT");
  const layoutPath = `/api/stores/${store.id}/layout/versions`;
  const draft = expectOk(await api(admin, "POST", layoutPath, { layoutName: "First draft", activate: false, layout: documentFor("First draft") }), "draft save");
  assert.equal(draft.status, "DRAFT");
  assert.equal((await currentLayout(store.id)).source, "DEFAULT");
  const published = expectOk(await api(admin, "POST", `${layoutPath}/${draft.layoutId}/activate`, {}), "draft publish");
  assert.equal(published.status, "ACTIVE");
  const mobilePublished = await currentLayout(store.id);
  assert.equal(mobilePublished.layoutId, draft.layoutId);
  assert.equal(mobilePublished.storeId, store.id);
  assert.equal(mobilePublished.layout.shopName, "First draft");
  assert.equal(typeof mobilePublished.layout.gridSize.width, "number");
  assert.equal(typeof mobilePublished.layout.gridSize.height, "number");
  assert.ok(mobilePublished.layout.elements.every((item) => Number.isInteger(item.id) && typeof item.type === "string" && typeof item.x === "number" && typeof item.y === "number"));

  let deniedDirectLinks = 0;
  let regionCreatedStoreId = null;
  for (const [user, role] of [[regionUser, "region-manager"], [storeUser, "store-manager"]]) {
    const page = await login(user);
    const me = expectOk(await api(page, "GET", "/api/admin/me"), `${role} login`);
    assert.equal(me.role, role);
    const dashboardRegions = expectOk(await api(page, "GET", "/api/regions"), `${role} dashboard regions`);
    const dashboardStores = expectOk(await api(page, "GET", "/api/stores?size=1"), `${role} dashboard stores`);
    const dashboardMissingLayouts = expectOk(await api(page, "GET", "/api/stores?size=1&hasActiveLayout=false"), `${role} dashboard missing layouts`);
    const dashboardFreeBeacons = expectOk(await api(page, "GET", "/api/beacons/free"), `${role} dashboard free beacons`);
    await page.goto(`${base}/admin/next/`, { waitUntil: "domcontentloaded" });
    const metrics = page.getByRole("region", { name: "Kennzahlen" });
    for (const [label, expected] of [
      ["Regionen", dashboardRegions.length], ["Stores", dashboardStores.totalElements],
      ["Freie Beacons", dashboardFreeBeacons.length], ["Layouts offen", dashboardMissingLayouts.totalElements]
    ]) assert.equal(Number(await metrics.locator(".metric").filter({ hasText: label }).locator("strong").textContent()), expected, `${role} dashboard metric ${label}`);
    assert.equal(await page.getByRole("heading", { name: "Letzte Aktivitäten" }).count(), 0);
    assert.equal((await api(page, "GET", `/api/stores/${store.id}`)).status, 200);
    assert.equal((await api(page, "GET", `/api/stores/${foreignStore.id}`)).status, 403);
    assert.equal((await api(page, "GET", `/api/regions/${foreignRegion.id}`)).status, 403);
    assert.equal((await api(page, "GET", `/api/regions/${uiRegion.id}`)).status, 403);
    assert.equal((await api(page, "POST", "/api/regions", { code: `DENIED-${run}`, name: "Denied" })).status, 403);
    assert.equal((await api(page, "PUT", `/api/regions/${region.id}`, { code: region.code, name: "Denied" })).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/logs")).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/error-logs")).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/products?page=0&size=1")).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/recipes?page=0&size=1")).status, 403);
    assert.equal((await api(page, "POST", "/api/categories", { categoryCode: 999, categoryName: "Denied" })).status, 403);
    assert.equal((await api(page, "GET", `/api/stores/${store.id}/layout/editor-context`)).status, 200);
    assert.equal((await api(page, "GET", `/api/stores/${foreignStore.id}/layout/editor-context`)).status, 403);
    assert.equal((await api(page, "GET", `/api/beacons/${foreignBeacon.id}`)).status, 403);
    const visibleStores = expectOk(await api(page, "GET", "/api/stores?page=0&size=50"), `${role} scoped store list`);
    assert.ok(visibleStores.content.some((item) => item.id === store.id));
    assert.ok(!visibleStores.content.some((item) => item.id === foreignStore.id));
    const visibleBeacons = expectOk(await api(page, "GET", "/api/beacons"), `${role} scoped beacons`);
    assert.ok(!visibleBeacons.some((item) => item.id === foreignBeacon.id));
    assert.equal((await api(page, "POST", "/api/beacons", { beaconCode: `DENIED-${run}`, uuid: randomUUID() })).status, 403);
    assert.equal((await api(page, "POST", "/api/beacons/bulk", { uuid: randomUUID(), items: [{ beaconCode: `DENIED-BULK-${run}` }] })).status, 403);
    assert.equal((await api(page, "POST", `/api/beacons/${ownBeacon.id}/assign`, { storeId: foreignStore.id })).status, 403);
    if (role === "region-manager") {
      const visibleRegions = expectOk(await api(page, "GET", "/api/regions?status=ACTIVE"), "region manager region list");
      assert.deepEqual(visibleRegions.map((item) => item.id), [region.id]);
      await page.goto(`${base}/admin/next/regions/`, { waitUntil: "domcontentloaded" });
      await page.getByRole("cell", { name: region.name }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Region anlegen" }).count(), 0);
      assert.equal(await page.getByRole("cell", { name: editedUiRegionName }).count(), 0);
      assert.equal(expectOk(await api(page, "POST", `/api/beacons/${ownBeacon.id}/assign`, { storeId: store.id }), "region beacon assignment").storeId, store.id);
      assert.equal(expectOk(await api(page, "GET", `/api/beacons/${ownBeacon.id}`), "scoped beacon store region").currentStore?.regionId, region.id);
    } else {
      assert.equal((await api(page, "GET", `/api/beacons/${ownBeacon.id}`)).status, 200);
      assert.equal(expectOk(await api(page, "POST", `/api/beacons/${ownBeacon.id}/release`, {}), "store beacon release").released, true);
      assert.equal(expectOk(await api(page, "POST", `/api/beacons/${ownBeacon.id}/assign`, { storeId: store.id }), "store beacon reassignment").storeId, store.id);
    }
    assert.equal((await api(page, "POST", "/api/admin/index/create", {})).status, 403);
    assert.equal((await api(page, "DELETE", "/api/admin/index")).status, 403);
    const ownUpdate = {
      regionId: region.id, storeCode: store.storeCode, name: `Updated by ${role} ${run}`,
      street: "Testgasse 1", zipCode: "4020", city: "Linz", country: "AT",
    };
    assert.equal(expectOk(await api(page, "PUT", `/api/stores/${store.id}`, ownUpdate), `${role} own store update`).name, ownUpdate.name);
    assert.equal((await api(page, "PUT", `/api/stores/${foreignStore.id}`, { ...ownUpdate, regionId: foreignRegion.id, storeCode: foreignStore.storeCode })).status, 403);
    assert.equal((await api(page, "POST", `/api/stores/${foreignStore.id}/layout/versions`, { layoutName: "Forbidden", activate: false, layout: documentFor("Forbidden") })).status, 403);
    const attemptedCreate = await api(page, "POST", "/api/stores", {
      regionId: role === "region-manager" ? region.id : foreignRegion.id,
      storeCode: `SCOPED-${role === "region-manager" ? "RM" : "SM"}-${run}`,
      name: "Scoped creation check", street: "Testgasse 3", zipCode: "4020", city: "Linz", country: "AT",
    });
    if (role === "region-manager") {
      assert.equal(attemptedCreate.status, 200, "region manager creates in assigned region");
      assert.equal((await api(page, "POST", "/api/stores", { ...ownUpdate, storeCode: `FOREIGN-${run}`, regionId: foreignRegion.id })).status, 403);
      const uiStoreCode = `UI-STORE-${run}`;
      const uiStoreName = `UI Store ${run}`;
      await page.goto(`${base}/admin/next/stores/new/`, { waitUntil: "domcontentloaded" });
      for (const [label, value] of [
        ["Store-Code", uiStoreCode], ["Name", uiStoreName], ["Straße", "UI Testgasse 4"],
        ["PLZ", "4020"], ["Ort", "Linz"], ["Land", "AT"]
      ]) await page.getByRole("textbox", { name: label, exact: true }).fill(value);
      await page.getByRole("button", { name: "Store anlegen" }).click();
      await page.getByRole("heading", { name: "Store angelegt" }).waitFor();
      const createdStoreLink = await page.getByRole("link", { name: "Store-Detail öffnen" }).getAttribute("href");
      assert.ok(createdStoreLink, "candidate store creation links to detail");
      const uiStoreId = new URL(createdStoreLink, base).searchParams.get("storeId");
      assert.ok(uiStoreId, "candidate store creation returned a store ID");
      regionCreatedStoreId = uiStoreId;
      const uiStore = expectOk(await api(page, "GET", `/api/stores/${uiStoreId}`), "candidate scoped store create");
      assert.equal(uiStore.region.id, region.id);
      assert.equal(uiStore.name, uiStoreName);
      await page.getByRole("link", { name: "Store-Detail öffnen" }).click();
      await page.getByRole("heading", { name: uiStoreName }).waitFor();
      assert.ok((await publicJson("/api/mobile/stores")).some((item) => item.id === uiStoreId && item.name === uiStoreName));
      await page.getByRole("combobox", { name: "Freien Beacon zuordnen" }).selectOption(bulkBeacons[0].id);
      await page.getByRole("button", { name: "Zuordnen" }).click();
      await page.getByRole("status").getByText("Beacon zugeordnet.").waitFor();
      assert.ok(expectOk(await api(page, "GET", `/api/stores/${uiStoreId}/beacons`), "candidate detail beacon assignment").some((item) => item.beaconId === bulkBeacons[0].id));
      page.once("dialog", (dialog) => { void dialog.accept(); });
      await page.getByRole("button", { name: "Freigeben" }).click();
      await page.getByRole("status").getByText("Beacon freigegeben.").waitFor();
      assert.ok(!expectOk(await api(page, "GET", `/api/stores/${uiStoreId}/beacons`), "candidate detail beacon release").some((item) => item.beaconId === bulkBeacons[0].id));
    } else {
      assert.equal(attemptedCreate.status, 403, "store manager cannot create a store");
    }
    const deniedLinks = [
      "/admin/next/products/", "/admin/next/categories/", "/admin/next/recipes/", "/admin/next/server-logs/",
      "/admin/next/editor/", `/admin/next/stores/detail/?storeId=${foreignStore.id}`,
      `/admin/next/editor/?storeId=${foreignStore.id}`
    ];
    if (role === "store-manager") deniedLinks.push("/admin/next/regions/");
    for (const deniedLink of deniedLinks) {
      await page.goto(base + deniedLink, { waitUntil: "domcontentloaded" });
      try {
        await page.getByRole("alert").getByRole("heading", { name: "Zugriff verweigert" }).waitFor({ timeout: 5_000 });
      } catch {
        throw new Error(`${role} did not receive candidate access denial at ${deniedLink}`);
      }
      deniedDirectLinks += 1;
    }
    await page.close();
  }

  assert.ok(regionCreatedStoreId, "region manager created a store for archive acceptance");
  await admin.goto(`${base}/admin/next/stores/detail/?storeId=${regionCreatedStoreId}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: `UI Store ${run}` }).waitFor();
  admin.once("dialog", (dialog) => { void dialog.accept(); });
  await admin.getByRole("button", { name: "Archivieren" }).click();
  await admin.getByRole("status").getByText("Store archiviert.").waitFor();
  assert.equal(expectOk(await api(admin, "GET", `/api/stores/${regionCreatedStoreId}`), "candidate store archive").status, "ARCHIVED");
  assert.ok(!(await publicJson("/api/mobile/stores")).some((item) => item.id === regionCreatedStoreId), "archived store disappears from public store list");
  const archivedStoreAudit = expectOk(await api(admin, "GET", `/api/stores/${regionCreatedStoreId}/audit`), "candidate store audit");
  assert.ok(archivedStoreAudit.entries.some((entry) => entry.action === "ARCHIVE"));
  await admin.getByRole("region", { name: "Änderungsverlauf" }).getByText("Filiale archiviert").waitFor();

  const manager = await login(storeUser, `/admin/next/editor/?storeId=${store.id}`);
  await manager.locator(".le-canvas").waitFor();
  const downloadPromise = manager.waitForEvent("download");
  await manager.getByRole("button", { name: "JSON exportieren" }).click();
  const exportedLayout = JSON.parse(readFileSync(await (await downloadPromise).path(), "utf8"));
  assert.equal(exportedLayout.shopName, "First draft");
  assert.equal(exportedLayout.elements.length, 2);
  delete exportedLayout.exportDate;
  exportedLayout.navigationMetadata = { ...(exportedLayout.navigationMetadata ?? {}), smokeMarker: run };
  await manager.getByLabel("Grundrissdatei importieren").setInputFiles({
    name: "live-layout.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(exportedLayout))
  });
  await manager.getByRole("status").getByText("Grundriss importiert. Bitte prüfen und als Entwurf speichern.").waitFor();
  await manager.locator(".le-layers button").nth(1).click();
  const selectedX = manager.getByLabel("X", { exact: true });
  const initialX = Number(await selectedX.inputValue());
  await manager.getByRole("img", { name: "Interaktiver Grundriss" }).focus();
  await manager.keyboard.press("ArrowRight");
  assert.equal(Number(await selectedX.inputValue()), initialX + 1, "live editor keyboard moves selected shelf");
  await manager.keyboard.press("ControlOrMeta+z");
  assert.equal(Number(await selectedX.inputValue()), initialX, "live editor undo restores selected shelf");
  await manager.keyboard.press("ControlOrMeta+Shift+z");
  assert.equal(Number(await selectedX.inputValue()), initialX + 1, "live editor redo restores selected shelf move");
  await manager.getByRole("textbox", { name: "Bezeichnung" }).fill("Published from live editor");
  await manager.getByRole("spinbutton", { name: "Zugriffswinkel" }).fill("135");
  await manager.getByRole("textbox", { name: "Layout-Code" }).fill("310/1/1/1");
  await manager.getByRole("textbox", { name: "Produktposition hinzufügen" }).fill("310-42");
  await manager.getByRole("button", { name: "Hinzufügen" }).click();
  await manager.getByRole("button", { name: "Entwurf speichern" }).click();
  await manager.getByText("Entwurf gespeichert.").waitFor();
  assert.equal((await currentLayout(store.id)).layoutId, draft.layoutId);
  const mobilePreview = manager.getByRole("region", { name: "Aktuell mobiles Layout" });
  await mobilePreview.getByRole("button", { name: "Gespeicherten Entwurf ansehen" }).click();
  await mobilePreview.getByText("Gespeicherter Entwurf · nicht öffentlich").waitFor();
  await mobilePreview.getByRole("button", { name: "Öffentlich aktiv" }).click();
  await mobilePreview.getByText("Aktive Version").waitFor();
  manager.once("dialog", (dialog) => void dialog.accept());
  await manager.getByRole("button", { name: "Veröffentlichen", exact: true }).click();
  await manager.getByText("Layout veröffentlicht.").waitFor();
  const edited = await currentLayout(store.id);
  assert.notEqual(edited.layoutId, draft.layoutId);
  assert.equal(edited.layout.elements[1].label, "Published from live editor");
  assert.equal(edited.layout.elements[1].x, initialX + 1);
  assert.equal(edited.layout.elements[1].accessAngle, 135);
  assert.equal(edited.layout.elements[1].layoutCode, "310/1/1/1");
  assert.deepEqual(edited.layout.elements[1].productPositions, ["310-42"]);
  assert.equal(edited.layout.navigationMetadata.smokeMarker, run);
  await manager.goto(`${base}/admin/next/stores/detail/?storeId=${store.id}`, { waitUntil: "domcontentloaded" });
  await manager.getByRole("heading", { name: "Stammdaten" }).waitFor();
  await manager.getByText("Aktiv: Version", { exact: false }).waitFor();
  await manager.getByText(ownBeacon.beaconCode).first().waitFor();
  await manager.getByRole("button", { name: "Bearbeiten" }).click();
  const candidateStoreName = `Store UI ${run}`;
  await manager.getByRole("textbox", { name: "Name" }).fill(candidateStoreName);
  await manager.getByRole("button", { name: "Speichern" }).click();
  await manager.getByRole("status").getByText("Store gespeichert.").waitFor();
  await manager.getByRole("heading", { name: candidateStoreName }).waitFor();
  assert.equal(expectOk(await api(manager, "GET", `/api/stores/${store.id}`), "candidate store detail edit").name, candidateStoreName);
  assert.equal((await publicJson("/api/mobile/stores")).find((item) => item.id === store.id)?.name, candidateStoreName);
  await manager.close();

  const globalBefore = expectOk(await api(admin, "GET", "/api/layout/current"), "global layout before edit");
  await admin.goto(base + "/admin/next/editor/", { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Globales Layout", exact: true }).waitFor();
  await admin.getByLabel("Filialname").fill(`Live Global ${run}`);
  admin.once("dialog", (dialog) => void dialog.accept());
  await admin.getByRole("button", { name: "Global veröffentlichen" }).click();
  await admin.getByText("Globales Layout veröffentlicht.").waitFor();
  const globalAfter = expectOk(await api(admin, "GET", "/api/layout/current"), "global layout after edit");
  assert.equal(globalAfter.shopName, `Live Global ${run}`);
  assert.equal(globalAfter.elements.length, globalBefore.elements.length);
  assert.equal(globalAfter.recordType, "current");
  const history = expectOk(await api(admin, "GET", "/api/layout/history?limit=12"), "global layout history");
  assert.ok(history.some((entry) => entry.layoutId === globalAfter.layoutId));
  assert.equal((await api(admin, "GET", `/api/layout/versions/${globalAfter.layoutId}`)).status, 200);
  await admin.goto(`${base}/admin/next/editor/?layoutId=${globalBefore.layoutId}`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("heading", { name: "Historische Version bearbeiten" }).waitFor();
  admin.once("dialog", (dialog) => void dialog.accept());
  await admin.getByRole("button", { name: "Global veröffentlichen" }).click();
  await admin.getByText("Globales Layout veröffentlicht.").waitFor();
  const globalRestored = expectOk(await api(admin, "GET", "/api/layout/current"), "restored global layout");
  assert.notEqual(globalRestored.layoutId, globalBefore.layoutId);
  assert.equal(globalRestored.shopName, globalBefore.shopName);
  assert.deepEqual(globalRestored.elements, globalBefore.elements);

  const saves = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    api(admin, "POST", layoutPath, { layoutName: `Concurrent ${index}`, activate: false, layout: documentFor(`Concurrent ${index}`) })));
  const versions = saves.map((result) => expectOk(result, "concurrent draft save"));
  assert.equal(new Set(versions.map((version) => version.versionNo)).size, 4);
  const activations = await Promise.all(versions.slice(0, 2).map((version) => api(admin, "POST", `${layoutPath}/${version.layoutId}/activate`, {})));
  const activated = activations.map((result) => expectOk(result, "concurrent activation"));
  assert.equal(activeCount(store.id), 1);
  const current = await currentLayout(store.id);
  assert.ok(activated.some((version) => version.layoutId === current.layoutId));
  const restoreManager = await login(storeUser, `/admin/next/editor/?storeId=${store.id}&layoutId=${edited.layoutId}`);
  await restoreManager.getByRole("button", { name: "Version wieder aktivieren" }).waitFor();
  restoreManager.once("dialog", (dialog) => void dialog.accept());
  await restoreManager.getByRole("button", { name: "Version wieder aktivieren" }).click();
  await restoreManager.getByText("Layout veröffentlicht.").waitFor();
  await restoreManager.close();
  assert.equal(activeCount(store.id), 1);
  const restoredPublicLayout = await currentLayout(store.id);
  assert.equal(restoredPublicLayout.layoutId, edited.layoutId);
  assert.equal(restoredPublicLayout.layout.elements[1].x, initialX + 1);
  assert.equal(restoredPublicLayout.layout.elements[1].accessAngle, 135);
  assert.equal(restoredPublicLayout.layout.navigationMetadata.smokeMarker, run);

  const auditLogs = expectOk(await api(admin, "GET", "/api/admin/logs?limit=50"), "admin audit logs");
  const errorLogs = expectOk(await api(admin, "GET", "/api/admin/error-logs?limit=50"), "admin error logs");
  assert.ok(Array.isArray(auditLogs.entries) && auditLogs.entries.length > 0);
  assert.ok(Array.isArray(errorLogs.entries));
  await admin.goto(`${base}/admin/next/server-logs/`, { waitUntil: "domcontentloaded" });
  await admin.getByRole("region", { name: "Änderungsverlauf" }).getByRole("row").nth(1).waitFor();
  await admin.getByRole("region", { name: "Serverfehler" }).waitFor();
  await admin.getByRole("button", { name: "Aktualisieren" }).focus();
  await admin.keyboard.press("Enter");
  await admin.getByRole("region", { name: "Änderungsverlauf" }).getByRole("row").nth(1).waitFor();

  console.log(JSON.stringify({ result: "PASS", regionId: region.id, storeId: store.id, directLinks: candidateRoutes.length, deniedDirectLinks, roleChecks: 2, scopedRoleMatrix: true, candidateScopedDashboard: true, beaconLifecycle: true, anonymousContracts: true, publicProductAfterMutation: true, candidateRegionLifecycle: true, candidateBeaconLifecycle: true, candidateBeaconBulkCreate: true, candidateStoreCreate: true, candidateStoreArchive: true, candidateStoreDetailEdit: true, candidateDetailBeaconLifecycle: true, candidateProductLifecycle: true, candidateCategoryCreateEdit: true, candidateRecipeCreatePublish: true, candidateDiagnosticsReadRefresh: true, layoutJsonRoundTrip: true, layoutVersionRecovery: true, globalVersionRecovery: true, swiftStoreLayoutShape: true, recipeLifecycle: true, globalPublication: true, concurrentSaves: 4, concurrentActivations: 2, activeLayouts: 1 }));
  await admin.close();
} finally {
  await browser.close();
}
