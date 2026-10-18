// Mock payloads and route table for the admin smoke server (scripts/serve-admin-smoke.mjs).
// Every payload must validate against the response schema of its operation in
// openspec/specs/shared-api/openapi.yaml; backend/indooro_server/src/test/js/admin-smoke-contract.test.mjs enforces this.

const now = () => new Date().toISOString();

const region = { id: "region-1", code: "AT-OÖ", name: "Oberoesterreich" };

const storeSummary = {
  id: "store-1",
  storeCode: "LINZ-01",
  name: "Indooro Linz",
  city: "Linz",
  status: "ACTIVE",
  region,
  activeBeaconCount: 1,
  hasActiveLayout: true
};

const beaconResponse = {
  id: "beacon-1",
  beaconCode: "B-001",
  uuid: "fda50693a4e24fb1afcfc6eb07647825",
  major: 1,
  minor: 1,
  identityKey: "fda:1:1",
  status: "ACTIVE",
  currentStore: { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz" }
};

const layoutDocument = {
  shopName: "Indooro Linz",
  gridSize: { width: 20, height: 20 },
  elements: [{ id: 1, type: "entrance", x: 1, y: 1, width: 2, height: 2, label: "Eingang" }]
};

const apfel = { id: 1, name: "Apfel", price: 1.99, layoutCode: "310/1/1/1", storeCode: "LINZ-01" };

const ingredientBase = {
  ingredientId: "ingredient-1",
  ingredientName: "Aepfel",
  status: "UNMAPPED",
  product: null,
  candidates: [apfel],
  confidence: null,
  manuallyConfirmed: false,
  reason: "Keine Produktzuordnung vorhanden."
};

// Response of PUT .../product-mapping. The server also swaps it into the mapping status served afterwards.
const confirmedIngredient = {
  ...ingredientBase,
  status: "MAPPED",
  product: apfel,
  candidates: [],
  confidence: 1,
  manuallyConfirmed: true,
  reason: null
};

const auditEntries = [
  { id: "log-1", entityType: "STORE", entityId: "store-1", action: "SMOKE", summary: "Smoke event", actorRole: "admin", actorLabel: "admin", createdAt: now() }
];

export const mock = {
  currentUser: {
    subject: "smoke-admin",
    username: "admin",
    email: "admin@indooro.test",
    role: "admin",
    scope: {}
  },
  regions: [{ id: "region-1", code: "AT-OÖ", name: "Oberoesterreich", status: "ACTIVE" }],
  stores: { content: [storeSummary], page: 0, size: 20, totalElements: 1 },
  beacons: [beaconResponse],
  products: [apfel],
  categories: [{ categoryCode: 310, categoryName: "Obst und Gemuese", name: "Obst und Gemuese" }],
  recipes: {
    content: [
      {
        id: "recipe-1",
        slug: "apfelkuchen",
        title: "Apfelkuchen",
        summary: null,
        servings: 4,
        stepCount: 2,
        status: "DRAFT",
        mappedIngredientCount: 1,
        totalIngredientCount: 2,
        tags: []
      }
    ],
    page: 0,
    size: 20,
    totalElements: 1
  },
  recipeMapping: {
    recipeId: "recipe-1",
    storeId: null,
    storeCode: null,
    ingredients: [ingredientBase]
  },
  confirmedIngredient,
  logs: { limit: 20, entries: auditEntries },
  errorLogs: {
    limit: 50,
    entries: [
      {
        id: "error-1",
        statusCode: 500,
        method: "GET",
        path: "/api/stores",
        message: "Smoke error",
        errorType: "SmokeError",
        stackTrace: null,
        createdAt: now()
      }
    ]
  },
  storeDetail: {
    ...storeSummary,
    street: "Hauptstrasse 1",
    zipCode: "4020",
    country: "Austria",
    latitude: null,
    longitude: null,
    notes: null,
    archivedAt: null,
    activeLayout: { id: "layout-1", versionNo: 1, createdAt: now() },
    createdAt: now(),
    updatedAt: now()
  },
  storeBeacons: [
    {
      assignmentId: "assignment-1",
      beaconId: "beacon-1",
      beaconCode: "B-001",
      identityKey: "fda:1:1",
      storeId: "store-1",
      storeCode: "LINZ-01",
      storeName: "Indooro Linz",
      assignedAt: now(),
      isActive: true
    }
  ],
  storeAudit: { storeId: "store-1", entries: auditEntries },
  layoutVersions: [
    { layoutId: "layout-1", versionNo: 1, layoutName: null, status: "ACTIVE", createdAt: now(), activatedAt: now() }
  ],
  editorContext: {
    store: storeSummary,
    assignedBeacons: [{ beaconId: "beacon-1", beaconCode: "B-001", identityKey: "fda:1:1" }],
    currentLayout: {
      layoutId: "layout-1",
      storeId: "store-1",
      versionNo: 1,
      status: "ACTIVE",
      createdAt: now(),
      activatedAt: now(),
      layout: layoutDocument
    }
  },
  legacyLayout: { shopName: "Legacy", gridSize: { width: 20, height: 20 }, elements: [] }
};

// Route table. `path` is the OpenAPI path template, `url` the concrete pathname the smoke server answers.
// `schema` is a "#/components/schemas/..." ref or the inline response schema exactly as written in the yaml.
// GET entries answer any method (as the smoke server always did); other methods must be listed explicitly.
export const mockRoutes = [
  { name: "currentUser", method: "GET", path: "/api/admin/me", url: "/api/admin/me", status: 200, schema: "#/components/schemas/CurrentUserResponse", payload: mock.currentUser },
  { name: "regions", method: "GET", path: "/api/regions", url: "/api/regions", status: 200, schema: { type: "array", items: { $ref: "#/components/schemas/RegionResponse" } }, payload: mock.regions },
  { name: "stores", method: "GET", path: "/api/stores", url: "/api/stores", status: 200, schema: "#/components/schemas/StoreSummaryPage", payload: mock.stores },
  { name: "beacons", method: "GET", path: "/api/beacons", url: "/api/beacons", status: 200, schema: { type: "array", items: { $ref: "#/components/schemas/BeaconResponse" } }, payload: mock.beacons },
  {
    name: "products",
    method: "GET",
    path: "/api/admin/products",
    url: "/api/admin/products",
    status: 200,
    schema: {
      oneOf: [
        { type: "array", items: { $ref: "#/components/schemas/Product" } },
        { $ref: "#/components/schemas/ProductPageResponse" }
      ]
    },
    payload: mock.products
  },
  { name: "categories", method: "GET", path: "/api/categories", url: "/api/categories", status: 200, schema: { type: "array", items: { $ref: "#/components/schemas/Category" } }, payload: mock.categories },
  { name: "recipes", method: "GET", path: "/api/admin/recipes", url: "/api/admin/recipes", status: 200, schema: "#/components/schemas/RecipeSummaryPage", payload: mock.recipes },
  { name: "recipeMappingStatus", method: "GET", path: "/api/admin/recipes/{recipeId}/mapping-status", url: "/api/admin/recipes/recipe-1/mapping-status", status: 200, schema: "#/components/schemas/RecipeProductMappingResponse", payload: mock.recipeMapping },
  {
    name: "mappingSuggestions",
    method: "GET",
    path: "/api/admin/recipes/{recipeId}/ingredients/{ingredientId}/mapping-suggestions",
    url: "/api/admin/recipes/recipe-1/ingredients/ingredient-1/mapping-suggestions",
    status: 200,
    schema: { type: "array", items: { $ref: "#/components/schemas/MappedRecipeProduct" } },
    payload: mock.products
  },
  {
    name: "confirmIngredientMapping",
    method: "PUT",
    path: "/api/admin/recipes/{recipeId}/ingredients/{ingredientId}/product-mapping",
    url: "/api/admin/recipes/recipe-1/ingredients/ingredient-1/product-mapping",
    status: 200,
    schema: "#/components/schemas/IngredientMappingStatus",
    payload: mock.confirmedIngredient,
    onServe: () => {
      mock.recipeMapping.ingredients[0] = mock.confirmedIngredient;
    }
  },
  { name: "adminLogs", method: "GET", path: "/api/admin/logs", url: "/api/admin/logs", status: 200, schema: "#/components/schemas/SystemLogResponse", payload: mock.logs },
  { name: "errorLogs", method: "GET", path: "/api/admin/error-logs", url: "/api/admin/error-logs", status: 200, schema: "#/components/schemas/ErrorLogResponse", payload: mock.errorLogs },
  { name: "storeDetail", method: "GET", path: "/api/stores/{storeId}", url: "/api/stores/store-1", status: 200, schema: "#/components/schemas/StoreDetailResponse", payload: mock.storeDetail },
  { name: "storeBeacons", method: "GET", path: "/api/stores/{storeId}/beacons", url: "/api/stores/store-1/beacons", status: 200, schema: { type: "array", items: { $ref: "#/components/schemas/BeaconAssignmentResponse" } }, payload: mock.storeBeacons },
  { name: "storeAudit", method: "GET", path: "/api/stores/{storeId}/audit", url: "/api/stores/store-1/audit", status: 200, schema: "#/components/schemas/StoreAuditResponse", payload: mock.storeAudit },
  { name: "storeLayoutVersions", method: "GET", path: "/api/stores/{storeId}/layout/versions", url: "/api/stores/store-1/layout/versions", status: 200, schema: { type: "array", items: { $ref: "#/components/schemas/LayoutVersionSummary" } }, payload: mock.layoutVersions },
  { name: "storeEditorContext", method: "GET", path: "/api/stores/{storeId}/layout/editor-context", url: "/api/stores/store-1/layout/editor-context", status: 200, schema: "#/components/schemas/EditorContextResponse", payload: mock.editorContext },
  { name: "legacyLayout", method: "GET", path: "/api/layout/current", url: "/api/layout/current", status: 200, schema: "#/components/schemas/LegacyLayoutDocument", payload: mock.legacyLayout }
];
