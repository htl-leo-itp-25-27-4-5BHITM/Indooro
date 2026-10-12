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

  for (const [user, role] of [[regionUser, "region-manager"], [storeUser, "store-manager"]]) {
    const page = await login(user);
    const me = expectOk(await api(page, "GET", "/api/admin/me"), `${role} login`);
    assert.equal(me.role, role);
    assert.equal((await api(page, "GET", `/api/stores/${store.id}`)).status, 200);
    assert.equal((await api(page, "GET", `/api/stores/${foreignStore.id}`)).status, 403);
    assert.equal((await api(page, "GET", `/api/regions/${foreignRegion.id}`)).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/logs")).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/error-logs")).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/products?page=0&size=1")).status, 403);
    assert.equal((await api(page, "GET", "/api/admin/recipes?page=0&size=1")).status, 403);
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
      assert.equal(expectOk(await api(page, "POST", `/api/beacons/${ownBeacon.id}/assign`, { storeId: store.id }), "region beacon assignment").storeId, store.id);
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
    } else {
      assert.equal(attemptedCreate.status, 403, "store manager cannot create a store");
    }
    const deniedLinks = ["/admin/next/products/", "/admin/next/recipes/", "/admin/next/server-logs/", "/admin/next/editor/"];
    if (role === "store-manager") deniedLinks.push(`/admin/next/stores/detail/?storeId=${foreignStore.id}`, `/admin/next/editor/?storeId=${foreignStore.id}`, "/admin/next/regions/");
    for (const deniedLink of deniedLinks) {
      await page.goto(base + deniedLink, { waitUntil: "domcontentloaded" });
      await page.getByRole("alert").getByRole("heading", { name: "Zugriff verweigert" }).waitFor();
    }
    await page.close();
  }

  const manager = await login(storeUser, `/admin/next/editor/?storeId=${store.id}`);
  await manager.locator(".le-canvas").waitFor();
  await manager.locator(".le-layers button").nth(1).click();
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
  assert.equal(edited.layout.elements[1].accessAngle, 135);
  assert.equal(edited.layout.elements[1].layoutCode, "310/1/1/1");
  assert.deepEqual(edited.layout.elements[1].productPositions, ["310-42"]);
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

  const saves = await Promise.all(Array.from({ length: 4 }, (_, index) =>
    api(admin, "POST", layoutPath, { layoutName: `Concurrent ${index}`, activate: false, layout: documentFor(`Concurrent ${index}`) })));
  const versions = saves.map((result) => expectOk(result, "concurrent draft save"));
  assert.equal(new Set(versions.map((version) => version.versionNo)).size, 4);
  const activations = await Promise.all(versions.slice(0, 2).map((version) => api(admin, "POST", `${layoutPath}/${version.layoutId}/activate`, {})));
  const activated = activations.map((result) => expectOk(result, "concurrent activation"));
  assert.equal(activeCount(store.id), 1);
  const current = await currentLayout(store.id);
  assert.ok(activated.some((version) => version.layoutId === current.layoutId));

  console.log(JSON.stringify({ result: "PASS", regionId: region.id, storeId: store.id, directLinks: candidateRoutes.length, deniedDirectLinks: 11, roleChecks: 2, scopedMutationChecks: 18, beaconLifecycle: true, publicContracts: 6, publicProductAfterMutation: true, swiftStoreLayoutShape: true, recipeLifecycle: true, globalPublication: true, concurrentSaves: 4, concurrentActivations: 2, activeLayouts: 1 }));
  await admin.close();
} finally {
  await browser.close();
}
