import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

// Authenticated legacy/candidate recipe parity against the disposable local stack only.
const base = process.env.ADMIN_SMOKE_BASE_URL || "http://localhost:8080";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "recipe parity requires a local admin stack");
const realm = JSON.parse(readFileSync(new URL("../../keycloak/realm/indooro-realm.json", import.meta.url), "utf8"));
const [adminUser, regionUser, storeUser] = realm.users;
const browser = await chromium.launch({ args: process.env.ADMIN_SMOKE_HOST_ALIAS ? ["--host-resolver-rules=MAP host.docker.internal 127.0.0.1"] : [] });
const stamp = randomUUID().replaceAll("-", "").slice(0, 10).toLowerCase();
// The old page filters only the API's first twenty rows; an early title keeps
// disposable draft fixtures reachable there for action comparison.
const recipeTitle = `000 Parity Rezept ${stamp}`;
const recipeSlug = `parity-rezept-${stamp}`;
const results = [];
const parityFailures = [];
const recipeIds = [];
const productCandidates = [1_800_000_000 + Math.floor(Math.random() * 100_000), 1_900_000_000 + Math.floor(Math.random() * 100_000)];
const productIds = [];
const productNames = [`${recipeTitle} Legacy Produkt`, `${recipeTitle} Candidate Produkt`];
let recipeId = null;
let failedAt = "authentication";
let failure = null;

async function login(user) {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/next/recipes/`, { waitUntil: "domcontentloaded" });
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.credentials.find((item) => item.type === "password").value);
  await page.locator("#kc-login").click();
  await page.waitForURL("**/admin/next/recipes/**");
  return page;
}

async function api(page, method, path, data) {
  const response = await page.context().request.fetch(`${base}${path}`, { method, data, failOnStatusCode: false });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { body = raw; }
  return { status: response.status(), body };
}

function ok(result, label, expected = 200) {
  assert.equal(result.status, expected, `${label}: expected HTTP ${expected}, got ${result.status}: ${JSON.stringify(result.body).slice(0, 300)}`);
  return result.body;
}

async function check(name, run) {
  failedAt = name;
  try {
    const evidence = await run();
    results.push({ check: name, result: "PASS", ...(evidence ?? {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    parityFailures.push({ check: name, error: message });
    results.push({ check: name, result: "FAIL", error: message });
    process.exitCode = 1;
  }
}

async function forceLegacy(page) {
  await page.route("**/admin/route-cutover.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replace(/recipes: (true|false)/, "recipes: false") });
  });
}

try {
  const admin = await login(adminUser);
  const region = await login(regionUser);
  const store = await login(storeUser);

  await check("recipe admin role and scope denials", async () => {
    for (const [label, page] of [["region", region], ["store", store]]) {
      ok(await api(page, "GET", "/api/admin/recipes?page=0&size=5"), `${label} recipe list denial`, 403);
      ok(await api(page, "GET", "/api/admin/recipes/00000000-0000-0000-0000-000000000000"), `${label} recipe detail denial`, 403);
      const response = await page.goto(`${base}/admin/next/recipes/`, { waitUntil: "domcontentloaded" });
      assert.equal(response.status(), 200, `${label} candidate direct-link shell`);
      await page.getByRole("alert").getByText("Zugriff verweigert").waitFor();
    }
    return { nonAdminRoles: ["region-manager", "store-manager"], apiDenied: true, candidateDirectLinksDenied: true };
  });

  failedAt = "recipe fixture seed";
  const created = ok(await api(admin, "POST", "/api/admin/recipes", {
    recipe: { slug: recipeSlug, title: recipeTitle, summary: "Lokaler Rezept-Paritätsnachweis", description: "Rezeptdetails für den lokalen Test.", imageUrl: "/images/parity-recipe.jpg", imageAlt: "Testbild", servings: 2, status: "DRAFT", tagIds: [] },
    ingredients: [{ position: 1, displayName: "Apfel", canonicalName: "Apfel", quantityText: "2 Stück", optional: false }],
    steps: [{ position: 1, instruction: "Apfel schneiden.", durationMinutes: 3 }]
  }), "fixture recipe create");
  recipeId = created.id;
  recipeIds.push(recipeId);
  assert.ok(recipeId, "fixture create must return an ID for guaranteed archive cleanup");

  await check("isolated catalog products for legacy and candidate create", async () => {
    const inventory = ok(await api(admin, "GET", "/api/admin/products?size=1000"), "product inventory for fixture safety");
    assert.ok(Array.isArray(inventory), "legacy product inventory must be an array");
    for (let index = 0; index < productCandidates.length; index++) {
      assert.equal(inventory.some((product) => product.id === productCandidates[index]), false, `fixture product id ${productCandidates[index]} must be unused`);
      ok(await api(admin, "POST", "/api/admin/products", { id: productCandidates[index], name: productNames[index], price: 1.25, layoutCode: "310/1/1/1" }), `recipe create product ${index + 1}`);
      productIds.push(productCandidates[index]);
      let indexed = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        const search = ok(await api(admin, "GET", `/api/admin/products?page=0&size=100&q=${encodeURIComponent(productNames[index] )}&sort=id`), `recipe create product ${index + 1} search`);
        if (search.content.some((product) => product.id === productCandidates[index])) { indexed = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      assert.ok(indexed, `fixture product ${productNames[index]} must be searchable before recipe creation`);
    }
    return { products: productIds.length, fixtureNamesAreUnique: true };
  });

  await check("legacy and candidate create workflows persist after reload", async () => {
    await forceLegacy(admin);
    await admin.goto(`${base}/admin/recipes/`, { waitUntil: "domcontentloaded" });
    await admin.locator("#page-content table").waitFor();
    await admin.locator("[data-open-recipe]").click();
    const legacy = admin.locator(".drawer");
    const legacyTitle = `${recipeTitle} Legacy Create`;
    await legacy.locator("#slug").fill(`parity-legacy-${stamp}`);
    await legacy.locator("#title").fill(legacyTitle);
    await legacy.locator("[data-ingredient-product-search='0']").fill(productNames[0]);
    const legacyOption = legacy.locator("[data-recipe-select-product='0']").filter({ hasText: productNames[0] });
    await legacyOption.waitFor();
    await legacyOption.click();
    await legacy.locator("[data-step-instruction='0']").fill("Legacy Create Schritt.");
    await legacy.locator("button.primary").focus();
    await admin.keyboard.press("Enter");
    await legacy.waitFor({ state: "detached" });
    const legacyList = ok(await api(admin, "GET", `/api/admin/recipes?q=${encodeURIComponent(legacyTitle)}&page=0&size=20`), "legacy recipe create readback");
    const legacyRecipe = legacyList.content.find((item) => item.title === legacyTitle);
    assert.ok(legacyRecipe, "legacy create appears in list API");
    recipeIds.push(legacyRecipe.id);
    let persisted = ok(await api(admin, "GET", `/api/admin/recipes/${legacyRecipe.id}`), "legacy recipe create detail");
    assert.equal(persisted.ingredients[0].displayName, productNames[0]);
    assert.equal(persisted.steps[0].instruction, "Legacy Create Schritt.");
    await admin.goto(`${base}/admin/recipes/`, { waitUntil: "domcontentloaded" });
    await admin.locator("#page-content table").waitFor();
    await admin.locator("[data-filter=query]").fill(legacyTitle);
    let legacyListVisible = true;
    try {
      await admin.locator("#page-content tbody tr").filter({ hasText: legacyTitle }).waitFor({ timeout: 2500 });
    } catch {
      legacyListVisible = false;
      results.push({ check: "legacy draft outside its loaded list page", result: "OBSERVED_LIMITATION", apiPersisted: true, listVisible: false, cause: "legacy query filters only the loaded API page; candidate server query finds it" });
    }

    await admin.unroute("**/admin/route-cutover.js");
    await admin.goto(`${base}/admin/next/recipes/`, { waitUntil: "domcontentloaded" });
    await admin.getByRole("region", { name: "Rezept-Ergebnisse" }).waitFor();
    await admin.getByRole("button", { name: "Rezept anlegen" }).focus();
    await admin.keyboard.press("Enter");
    const candidate = admin.getByRole("dialog");
    const candidateTitle = `${recipeTitle} Candidate Create`;
    await candidate.getByRole("textbox", { name: "Slug" }).fill(`parity-candidate-${stamp}`);
    await candidate.getByRole("textbox", { name: "Titel" }).fill(candidateTitle);
    await candidate.getByRole("button", { name: "+ Zutat" }).click();
    await candidate.getByRole("textbox", { name: "Produkt aus Katalog" }).fill(productNames[1]);
    await candidate.getByRole("button", { name: "Suchen" }).click();
    await candidate.locator(`.recipe-product-search select option[value='${productIds[1]}']`).waitFor({ state: "attached" });
    await candidate.locator(".recipe-product-search select").selectOption(String(productIds[1]));
    await candidate.getByRole("button", { name: "+ Schritt" }).click();
    await candidate.getByRole("textbox", { name: "Schritt 1" }).fill("Candidate Create Schritt.");
    await candidate.getByRole("button", { name: "Entwurf anlegen" }).focus();
    await admin.keyboard.press("Enter");
    await candidate.waitFor({ state: "hidden" });
    const candidateList = ok(await api(admin, "GET", `/api/admin/recipes?q=${encodeURIComponent(candidateTitle)}&page=0&size=20`), "candidate recipe create readback");
    const candidateRecipe = candidateList.content.find((item) => item.title === candidateTitle);
    assert.ok(candidateRecipe, "candidate create appears in list API");
    recipeIds.push(candidateRecipe.id);
    persisted = ok(await api(admin, "GET", `/api/admin/recipes/${candidateRecipe.id}`), "candidate recipe create detail");
    assert.equal(persisted.ingredients[0].displayName, productNames[1]);
    assert.equal(persisted.steps[0].instruction, "Candidate Create Schritt.");
    await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(candidateTitle)}`, { waitUntil: "domcontentloaded" });
    await admin.reload({ waitUntil: "domcontentloaded" });
    await admin.getByRole("row").filter({ hasText: candidateTitle }).waitFor();
    return { legacyCreate: true, legacyListVisible, candidateCreate: true, keyboardSubmit: true, persistedAfterReload: true };
  });

  await check("legacy recipe direct-link query", async () => {
    await forceLegacy(admin);
    const response = await admin.goto(`${base}/admin/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    await admin.reload({ waitUntil: "domcontentloaded" });
    await admin.locator("#page-content table").waitFor();
    const row = admin.locator("#page-content tbody tr").filter({ hasText: recipeSlug });
    await row.waitFor({ timeout: 2500 });
    return { directLink: true, listVisible: true };
  });

  await check("candidate list and detail survive direct refresh", async () => {
    const response = await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    await admin.reload({ waitUntil: "domcontentloaded" });
    const row = admin.getByRole("row").filter({ hasText: recipeSlug });
    await row.waitFor();
    await row.getByRole("button", { name: "Bearbeiten" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Titel" }).waitFor();
    assert.equal(await dialog.getByRole("textbox", { name: "Beschreibung", exact: true }).inputValue(), "Rezeptdetails für den lokalen Test.");
    assert.equal(await dialog.getByRole("textbox", { name: "Bild-URL" }).inputValue(), "/images/parity-recipe.jpg");
    assert.equal(await dialog.getByRole("textbox", { name: "Schritt 1" }).inputValue(), "Apfel schneiden.");
    await dialog.getByRole("button", { name: "Schließen" }).click();
    const detail = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "candidate recipe detail readback");
    assert.equal(detail.ingredients[0].displayName, "Apfel");
    assert.equal(detail.steps[0].instruction, "Apfel schneiden.");
    return { candidateList: true, directRefresh: true, detailFields: ["description", "imageUrl", "ingredient", "step"] };
  });

  await check("legacy and candidate edit persistence after reload", async () => {
    await forceLegacy(admin);
    await admin.goto(`${base}/admin/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    const legacyEdit = admin.locator("#page-content tbody tr").filter({ hasText: recipeSlug }).getByRole("button", { name: "Bearbeiten" });
    await legacyEdit.waitFor({ timeout: 2500 });
    await legacyEdit.click();
    await admin.locator(".drawer #title").fill(`${recipeTitle} Legacy`);
    await admin.locator(".drawer button.primary").focus();
    await admin.keyboard.press("Enter");
    await admin.locator(".drawer").waitFor({ state: "detached" });
    let detail = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "legacy edit persistence");
    assert.equal(detail.title, `${recipeTitle} Legacy`);
    await admin.goto(`${base}/admin/recipes/?q=${encodeURIComponent(`${recipeTitle} Legacy`)}`, { waitUntil: "domcontentloaded" });
    await admin.locator("#page-content tbody tr").filter({ hasText: recipeSlug }).waitFor();
    await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    const row = admin.getByRole("row").filter({ hasText: recipeSlug });
    await row.getByRole("button", { name: "Bearbeiten" }).focus();
    await admin.keyboard.press("Enter");
    const dialog = admin.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Titel" }).fill(`${recipeTitle} Candidate`);
    await dialog.getByRole("textbox", { name: "Bildbeschreibung" }).fill("Kandidat gespeichert");
    await dialog.getByRole("button", { name: "Speichern" }).focus();
    await admin.keyboard.press("Enter");
    await dialog.waitFor({ state: "hidden" });
    await admin.reload({ waitUntil: "domcontentloaded" });
    await admin.getByRole("row").filter({ hasText: recipeSlug }).waitFor();
    detail = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "candidate edit persistence");
    assert.equal(detail.title, `${recipeTitle} Candidate`);
    assert.equal(detail.imageAlt, "Kandidat gespeichert");
    assert.equal(detail.ingredients[0].displayName, "Apfel");
    return { legacyEdit: true, candidateEdit: true, keyboardSubmit: true, persistedAfterReload: true, untouchedContentPreserved: true };
  });


  await check("candidate edit persists while retaining recipe content", async () => {
    await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    await admin.getByRole("row").filter({ hasText: recipeSlug }).getByRole("button", { name: "Bearbeiten" }).focus();
    await admin.keyboard.press("Enter");
    const dialog = admin.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Titel" }).fill(`${recipeTitle} Candidate`);
    await dialog.getByRole("textbox", { name: "Bildbeschreibung" }).fill("Kandidat gespeichert");
    await dialog.getByRole("button", { name: "Speichern" }).focus();
    await admin.keyboard.press("Enter");
    await dialog.waitFor({ state: "hidden" });
    await admin.reload({ waitUntil: "domcontentloaded" });
    await admin.getByRole("row").filter({ hasText: recipeSlug }).waitFor();
    const detail = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "candidate edit persistence");
    assert.equal(detail.title, `${recipeTitle} Candidate`);
    assert.equal(detail.imageAlt, "Kandidat gespeichert");
    assert.equal(detail.ingredients[0].displayName, "Apfel");
    return { candidateEdit: true, keyboardSubmit: true, persistedAfterReload: true, untouchedContentPreserved: true };
  });

  await check("multi-step save failure retains and retries draft", async () => {
    await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    await admin.getByRole("row").filter({ hasText: recipeSlug }).getByRole("button", { name: "Bearbeiten" }).click();
    const dialog = admin.getByRole("dialog");
    const oldInstruction = (await api(admin, "GET", `/api/admin/recipes/${recipeId}`)).body.steps[0].instruction;
    const attempted = `Mehrstufiger Retry ${stamp}.`;
    await dialog.getByRole("textbox", { name: "Schritt 1" }).fill(attempted);
    const route = `**/api/admin/recipes/${recipeId}/steps/*`;
    const failOnce = (request) => request.fulfill({ status: 503, json: { error: "Injected recipe step failure" } });
    await admin.route(route, failOnce);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await dialog.getByRole("alert").getByText(/Schritt 1 speichern fehlgeschlagen/).waitFor();
    let detail = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "partial step failure server state");
    assert.equal(detail.steps[0].instruction, oldInstruction, "failed step write leaves that step unchanged on the server");
    await dialog.getByRole("button", { name: "Meine Eingaben wiederherstellen" }).click();
    assert.equal(await dialog.getByRole("textbox", { name: "Schritt 1" }).inputValue(), attempted);
    await admin.unroute(route, failOnce);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await dialog.waitFor({ state: "hidden" });
    detail = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "retried step state");
    assert.equal(detail.steps[0].instruction, attempted);
    return { injectedStage: "step update after metadata save", recoverableDraft: true, retryPersisted: true };
  });

  await check("partial ingredient mapping failure reuses the created row", async () => {
    await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    await admin.getByRole("row").filter({ hasText: recipeSlug }).getByRole("button", { name: "Bearbeiten" }).click();
    const dialog = admin.getByRole("dialog");
    const before = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "ingredient mapping pre-state");
    await dialog.getByRole("button", { name: "+ Zutat" }).click();
    await dialog.getByRole("textbox", { name: "Produkt aus Katalog" }).fill(productNames[0]);
    await dialog.getByRole("button", { name: "Suchen" }).click();
    await dialog.locator(`.recipe-product-search select option[value='${productIds[0]}']`).waitFor({ state: "attached" });
    await dialog.locator(".recipe-product-search select").last().selectOption(String(productIds[0]));
    await dialog.getByRole("textbox", { name: "Menge" }).last().fill("1 Stück");
    const route = `**/api/admin/recipes/${recipeId}/ingredients/*/product-mapping`;
    const mappingResponses = [];
    admin.on("response", (response) => { if (response.url().includes("/product-mapping")) mappingResponses.push(response.status()); });
    const failOnce = (request) => request.fulfill({ status: 503, json: { error: "Injected recipe mapping failure" } });
    await admin.route(route, failOnce);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await dialog.getByRole("alert").getByText(/Produktzuordnung für Zutat 2 speichern fehlgeschlagen/).waitFor();
    let after = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "ingredient mapping partial state");
    assert.equal(after.ingredients.length, before.ingredients.length + 1, "ingredient creation reached the server before mapping failed");
    await dialog.getByRole("button", { name: "Meine Eingaben wiederherstellen" }).click();
    await dialog.getByRole("alert").getByText(/Ihre Eingaben wurden wiederhergestellt/).waitFor();
    await admin.unroute(route, failOnce);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    try {
      await dialog.waitFor({ state: "hidden", timeout: 5000 });
    } catch {
      const alerts = await dialog.getByRole("alert").allTextContents();
      throw new Error(`mapping retry kept the dialog open: ${alerts.join(" | ")}; mapping HTTP statuses ${mappingResponses.join(",")}`);
    }
    after = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "ingredient mapping retry state");
    assert.equal(after.ingredients.length, before.ingredients.length + 1, "retry must not duplicate the ingredient");
    const mapped = ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}/mapping-status`), "mapping status after retry");
    const row = mapped.ingredients.find((item) => item.ingredientName === productNames[0]);
    assert.equal(row?.product?.id, productIds[0]);
    return { injectedStage: "product mapping after ingredient create", reusedIngredient: true, mappingPersistedAfterRetry: true };
  });

  await check("list empty state and injected 503 keyboard retry", async () => {
    let failOnce = true;
    const route = "**/api/admin/recipes?*";
    const inject = (request) => {
      if (failOnce) { failOnce = false; return request.fulfill({ status: 503, json: { error: "Injected recipe list failure" } }); }
      return request.continue();
    };
    await admin.route(route, inject);
    await admin.reload({ waitUntil: "domcontentloaded" });
    await admin.getByRole("alert").getByRole("button", { name: "Erneut versuchen" }).waitFor();
    await admin.getByRole("button", { name: "Erneut versuchen" }).focus();
    await admin.keyboard.press("Enter");
    await admin.getByRole("row").filter({ hasText: recipeSlug }).waitFor();
    await admin.unroute(route, inject);
    await admin.route(route, (request) => request.fulfill({ json: { content: [], page: 0, size: 20, totalElements: 0 } }));
    await admin.reload({ waitUntil: "domcontentloaded" });
    await admin.getByText("Keine Rezepte passen zu den Filtern.").waitFor();
    await admin.unroute(route);
    return { status503: true, keyboardRetry: true, emptyState: true };
  });

  await check("failed publication is recoverable and retryable", async () => {
    await admin.goto(`${base}/admin/next/recipes/?q=${encodeURIComponent(recipeTitle)}`, { waitUntil: "domcontentloaded" });
    await admin.getByRole("row").filter({ hasText: recipeSlug }).getByRole("button", { name: "Bearbeiten" }).click();
    const dialog = admin.getByRole("dialog");
    const route = `**/api/admin/recipes/${recipeId}/publish`;
    const fail = (request) => request.fulfill({ status: 503, json: { error: "Injected recipe publish failure" } });
    await admin.route(route, fail);
    admin.once("dialog", (confirmation) => void confirmation.accept());
    await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await dialog.getByRole("alert").getByText(/Statusänderung fehlgeschlagen/).waitFor();
    assert.equal(ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "failed publication status").status, "DRAFT");
    await admin.unroute(route, fail);
    admin.once("dialog", (confirmation) => void confirmation.accept());
    await dialog.getByRole("button", { name: "Veröffentlichen" }).click();
    await dialog.locator(".status-pill").getByText("PUBLISHED").waitFor();
    assert.equal(ok(await api(admin, "GET", `/api/admin/recipes/${recipeId}`), "published status readback").status, "PUBLISHED");
    return { injectedStage: "publication action", retryPersisted: true };
  });

  // Recipes have no hard-delete route. Archiving the random fixture is the supported cleanup path.
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  const cleanupFailures = [];
  let recipeCleanupVerified = false;
  if (recipeIds.length) {
    try {
      const admin = await login(adminUser);
      for (const id of recipeIds) {
        const detail = await api(admin, "GET", `/api/admin/recipes/${id}`);
        if (detail.status === 200 && Array.isArray(detail.body.ingredients)) {
          for (const ingredient of detail.body.ingredients) {
            const removed = await api(admin, "DELETE", `/api/admin/recipes/${id}/ingredients/${ingredient.id}`);
            if (![200, 204].includes(removed.status)) cleanupFailures.push(`fixture recipe ${id} ingredient cleanup: HTTP ${removed.status}`);
          }
        }
        if (detail.status === 200 && detail.body.status !== "ARCHIVED") {
          const archived = await api(admin, "PATCH", `/api/admin/recipes/${id}/archive`, {});
          if (archived.status !== 200) { cleanupFailures.push(`fixture recipe ${id} archive: HTTP ${archived.status}`); continue; }
        }
        const cleaned = await api(admin, "GET", `/api/admin/recipes/${id}`);
        if (cleaned.status !== 200 || cleaned.body.status !== "ARCHIVED") cleanupFailures.push(`fixture recipe ${id} archive state could not be verified`);
      }
      if (cleanupFailures.length) {
        failure = [failure, ...cleanupFailures].filter(Boolean).join("; ");
        process.exitCode = 1;
        results.push({ check: "recipe fixture cleanup", result: "FAIL", details: cleanupFailures });
      } else {
        recipeCleanupVerified = true;
        results.push({ check: "recipe fixture cleanup", result: "PASS", archivedRecipes: recipeIds.length, ingredientsRemoved: true });
      }
      await admin.context().close();
    } catch (error) {
      failure = [failure, `recipe fixture cleanup: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("; ");
      process.exitCode = 1;
    }
  }
  if (productIds.length && recipeCleanupVerified) {
    try {
      const admin = await login(adminUser);
      for (const id of productIds) {
        const result = await api(admin, "DELETE", `/api/admin/products/${id}`);
        if (![204, 404].includes(result.status)) cleanupFailures.push(`fixture product ${id} cleanup: HTTP ${result.status}`);
      }
      if (cleanupFailures.length) {
        failure = [failure, ...cleanupFailures].filter(Boolean).join("; ");
        process.exitCode = 1;
        results.push({ check: "product fixture cleanup", result: "FAIL", details: cleanupFailures });
      } else results.push({ check: "product fixture cleanup", result: "PASS", deletedProducts: productIds.length });
      await admin.context().close();
    } catch (error) {
      failure = [failure, `product fixture cleanup: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("; ");
      process.exitCode = 1;
    }
  } else if (productIds.length) {
    results.push({ check: "product fixture cleanup", result: "SKIPPED", reason: "recipe cleanup was not verified; preserve referenced products" });
  }
  await browser.close();
  console.log(JSON.stringify({ result: process.exitCode === 1 ? "FAIL" : "PASS", scope: "local-stack-only", failedAt: process.exitCode === 1 ? failedAt : null, error: failure, failures: parityFailures, checks: results, openParity: ["legacy list filters only the first API page; late draft direct links can be missing", "ingredient mapping suggestions and confirmation are not exercised", "deactivate parity is not exercised", "fault injection covers step update, list load, and publication; other write stages remain unverified"] }));
}
