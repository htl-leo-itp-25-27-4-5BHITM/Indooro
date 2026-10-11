import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = join(process.cwd(), "backend/indooro_server/src/main/resources/META-INF/resources");
const port = Number(process.env.ADMIN_SMOKE_PORT || 4177);
const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin"
};

const json = (response, body, status = 200) => {
  response.writeHead(status, { ...securityHeaders, "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const okUser = {
  username: "admin",
  email: "admin@indooro.test",
  role: "admin",
  scope: {}
};

const mock = {
  regions: [{ id: "region-1", code: "AT-OÖ", name: "Oberoesterreich", status: "ACTIVE" }],
  stores: {
    items: [{ id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz", city: "Linz", status: "ACTIVE", region: { id: "region-1", code: "AT-OÖ", name: "Oberoesterreich" }, activeBeaconCount: 1, hasActiveLayout: true }]
  },
  beacons: [{ id: "beacon-1", beaconCode: "B-001", uuid: "fda50693-a4e2-4fb1-afcf-c6eb07647825", major: 1, minor: 1, identityKey: "fda:1:1", status: "ACTIVE", currentStore: { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz" } }],
  products: [{ id: 1, name: "Apfel", price: 1.99, layoutCode: "A-01", storeCode: "LINZ-01" }],
  categories: [{ categoryCode: 310, categoryName: "Obst und Gemuese", name: "Obst und Gemuese" }],
  recipes: [{ id: "recipe-1", slug: "apfelkuchen", title: "Apfelkuchen", status: "DRAFT", mappedIngredientCount: 1, totalIngredientCount: 2, tags: [] }],
  recipeMapping: {
    recipeId: "recipe-1",
    storeId: null,
    storeCode: null,
    ingredients: [
      {
        ingredientId: "ingredient-1",
        ingredientName: "Aepfel",
        status: "UNMAPPED",
        product: null,
        candidates: [{ id: 1, name: "Apfel", price: 1.99, layoutCode: "A-01", storeCode: "LINZ-01" }],
        confidence: null,
        manuallyConfirmed: false,
        reason: "Keine Produktzuordnung vorhanden."
      }
    ]
  },
  logs: [{ id: "log-1", action: "SMOKE", summary: "Smoke event", createdAt: new Date().toISOString() }]
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/api/admin/me") return json(response, okUser);
  if (url.pathname === "/api/regions") return json(response, mock.regions);
  if (url.pathname === "/api/stores") return json(response, mock.stores);
  if (url.pathname === "/api/beacons") return json(response, mock.beacons);
  if (url.pathname === "/api/admin/products") return json(response, mock.products);
  if (url.pathname === "/api/categories") return json(response, mock.categories);
  if (url.pathname === "/api/admin/recipes") return json(response, mock.recipes);
  if (url.pathname === "/api/admin/recipes/recipe-1/mapping-status") return json(response, mock.recipeMapping);
  if (url.pathname === "/api/admin/recipes/recipe-1/ingredients/ingredient-1/mapping-suggestions") return json(response, mock.products);
  if (url.pathname === "/api/admin/recipes/recipe-1/ingredients/ingredient-1/product-mapping" && request.method === "PUT") {
    mock.recipeMapping.ingredients[0] = {
      ...mock.recipeMapping.ingredients[0],
      status: "MAPPED",
      product: mock.products[0],
      candidates: [],
      confidence: 1,
      manuallyConfirmed: true,
      reason: null
    };
    return json(response, mock.recipeMapping.ingredients[0]);
  }
  if (url.pathname === "/api/admin/logs" || url.pathname === "/api/admin/error-logs") return json(response, mock.logs);
  if (url.pathname === "/api/stores/store-1") return json(response, { ...mock.stores.items[0], street: "Hauptstrasse 1", zipCode: "4020", country: "Austria", activeLayout: { versionNo: 1, createdAt: new Date().toISOString() } });
  if (url.pathname === "/api/stores/store-1/beacons") return json(response, mock.beacons);
  if (url.pathname === "/api/stores/store-1/audit") return json(response, { entries: mock.logs });
  if (url.pathname === "/api/stores/store-1/layout/versions") return json(response, [{ layoutId: "layout-1", versionNo: 1, active: true }]);
  if (url.pathname === "/api/stores/store-1/layout/editor-context") {
    return json(response, {
      store: mock.stores.items[0],
      assignedBeacons: mock.beacons.map((beacon) => ({ beaconId: beacon.id, beaconCode: beacon.beaconCode, identityKey: beacon.identityKey })),
      currentLayout: { layoutId: "layout-1", layout: { shopName: "Indooro Linz", gridSize: { width: 20, height: 20 }, elements: [{ id: 1, type: "entrance", x: 1, y: 1, width: 2, height: 2, label: "Eingang" }] } }
    });
  }
  if (url.pathname === "/api/layout/current") return json(response, { shopName: "Legacy", gridSize: { width: 20, height: 20 }, elements: [] });
  if (url.pathname === "/assets/data/categories.json") return json(response, mock.categories);

  let filePath = normalize(join(root, url.pathname));
  if (!filePath.startsWith(root)) {
    response.writeHead(403, securityHeaders);
    response.end("Forbidden");
    return;
  }
  if (url.pathname.endsWith("/")) filePath = join(filePath, "index.html");
  try {
    const bytes = await readFile(filePath);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
    response.writeHead(200, { ...securityHeaders, "content-type": types[extname(filePath)] || "application/octet-stream" });
    response.end(bytes);
  } catch {
    response.writeHead(404, securityHeaders);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Admin smoke server on http://127.0.0.1:${port}`);
});
