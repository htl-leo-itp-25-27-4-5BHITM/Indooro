export const ROUTES = [
  { id: "dashboard", label: "Dashboard", path: "/admin/", icon: "grid", roles: ["admin", "region-manager", "store-manager"] },
  { id: "regions", label: "Regionen", path: "/admin/regions/", icon: "map", roles: ["admin", "region-manager"] },
  { id: "stores", label: "Stores", path: "/admin/stores/", icon: "store", roles: ["admin", "region-manager", "store-manager"] },
  { id: "beacons", label: "Beacons", path: "/admin/beacons/", icon: "radio", roles: ["admin", "region-manager", "store-manager"] },
  { id: "products", label: "Produkte", path: "/admin/products/", icon: "box", roles: ["admin"] },
  { id: "categories", label: "Kategorien", path: "/admin/categories/", icon: "tags", roles: ["admin"] },
  { id: "recipes", label: "Rezepte", path: "/admin/recipes/", icon: "book", roles: ["admin"] },
  { id: "editor", label: "Layout Editor", path: "/admin/editor/", icon: "layout", roles: ["admin", "region-manager", "store-manager"] },
  { id: "server-logs", label: "Diagnose", path: "/admin/server-logs/", icon: "terminal", roles: ["admin"] }
];

export const API = {
  me: "/api/admin/me",
  adminLogs: "/api/admin/logs",
  errorLogs: "/api/admin/error-logs",
  regions: "/api/regions",
  stores: "/api/stores",
  beacons: "/api/beacons",
  freeBeacons: "/api/beacons/free",
  products: "/api/admin/products?size=1000",
  productWrite: "/api/admin/products",
  productBulk: "/api/products/bulk",
  categories: "/api/categories?size=1000",
  categoryBulk: "/api/categories/bulk",
  recipes: "/api/admin/recipes",
  recipeTags: "/api/admin/recipe-tags"
};

export function routeFromPath(pathname = "/admin/") {
  if (pathname.includes("/admin/server-logs")) return ROUTES.find((route) => route.id === "server-logs");
  if (pathname.includes("/admin/categories")) return ROUTES.find((route) => route.id === "categories");
  if (pathname.includes("/admin/products")) return ROUTES.find((route) => route.id === "products");
  if (pathname.includes("/admin/recipes")) return ROUTES.find((route) => route.id === "recipes");
  if (pathname.includes("/admin/beacons")) return ROUTES.find((route) => route.id === "beacons");
  if (pathname.includes("/admin/stores")) return ROUTES.find((route) => route.id === "stores");
  if (pathname.includes("/admin/regions")) return ROUTES.find((route) => route.id === "regions");
  if (pathname.includes("/admin/editor")) return ROUTES.find((route) => route.id === "editor");
  return ROUTES[0];
}

export function userRoles(user = {}) {
  const roles = user.roles || user.realmRoles || user.role ? user.roles || user.realmRoles || [user.role] : [];
  return Array.isArray(roles) ? roles.filter(Boolean) : [roles].filter(Boolean);
}

export function canAccessRoute(user, route) {
  const roles = userRoles(user);
  return !route?.roles?.length || route.roles.some((role) => roles.includes(role));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("de-AT", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.content)) return value.content;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.entries)) return value.entries;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

export function includesText(row, query, fields = []) {
  const needle = String(query ?? "").trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(readPath(row, field) ?? "").toLowerCase().includes(needle));
}

export function readPath(row, path) {
  return String(path).split(".").reduce((current, key) => current?.[key], row);
}

export function sortRows(rows, key, direction = "asc") {
  const factor = direction === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = readPath(a, key);
    const right = readPath(b, key);
    if (left === right) return 0;
    if (left == null) return 1;
    if (right == null) return -1;
    return String(left).localeCompare(String(right), "de", { numeric: true, sensitivity: "base" }) * factor;
  });
}

export function paginateRows(rows, page = 1, pageSize = 25) {
  const safePageSize = Math.max(1, Number(pageSize) || 25);
  const totalPages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  return {
    page: safePage,
    pageSize: safePageSize,
    totalPages,
    totalRows: rows.length,
    rows: rows.slice((safePage - 1) * safePageSize, safePage * safePageSize)
  };
}

export function readinessForProduct(product = {}) {
  const problems = [];
  const layoutCode = String(product.layoutCode ?? "").trim();
  if (!layoutCode) problems.push("Layout-Code fehlt");
  else if (!/^\d{1,4}\/\d{1,3}\/\d{1,2}\/\d{1,2}$/.test(layoutCode)) problems.push("Layout-Code ist unklar");
  const assignedToStore = Boolean(product.storeId || product.storeCode);
  const blockingProblems = problems.filter((problem) => problem !== "Store-Kontext fehlt");
  return {
    status: blockingProblems.length ? "warning" : "ready",
    label: blockingProblems.length ? "Layout pruefen" : assignedToStore ? "Routbar" : "Global routbar",
    problems: assignedToStore ? problems : [...problems, "Kein Store-spezifischer Scope"]
  };
}

export function validateStoreForm(values = {}) {
  const errors = {};
  if (!values.regionId) errors.regionId = "Region ist erforderlich.";
  if (!values.storeCode?.trim()) errors.storeCode = "Store-Code ist erforderlich.";
  if (!values.name?.trim()) errors.name = "Name ist erforderlich.";
  if (!values.street?.trim()) errors.street = "Strasse ist erforderlich.";
  if (!values.zipCode?.trim()) errors.zipCode = "PLZ ist erforderlich.";
  if (!values.city?.trim()) errors.city = "Stadt ist erforderlich.";
  if (!values.country?.trim()) errors.country = "Land ist erforderlich.";
  if (values.latitude !== "" && values.latitude != null && Math.abs(Number(values.latitude)) > 90) {
    errors.latitude = "Latitude muss zwischen -90 und 90 liegen.";
  }
  if (values.longitude !== "" && values.longitude != null && Math.abs(Number(values.longitude)) > 180) {
    errors.longitude = "Longitude muss zwischen -180 und 180 liegen.";
  }
  return errors;
}

export function validateBeaconForm(values = {}, existing = []) {
  const errors = {};
  if (!values.beaconCode?.trim()) errors.beaconCode = "Beacon-Code ist erforderlich.";
  if (!values.uuid?.trim()) errors.uuid = "UUID ist erforderlich.";
  if (values.uuid && !/^[0-9a-fA-F-]{8,40}$/.test(values.uuid.trim())) errors.uuid = "UUID-Format wirkt ungueltig.";
  if (values.major !== "" && values.major != null && Number(values.major) < 0) errors.major = "Major darf nicht negativ sein.";
  if (values.minor !== "" && values.minor != null && Number(values.minor) < 0) errors.minor = "Minor darf nicht negativ sein.";
  const identity = `${values.uuid ?? ""}:${values.major ?? ""}:${values.minor ?? ""}`.toLowerCase();
  if (existing.some((beacon) => `${beacon.uuid ?? ""}:${beacon.major ?? ""}:${beacon.minor ?? ""}`.toLowerCase() === identity && beacon.id !== values.id)) {
    errors.identity = "UUID/Major/Minor ist bereits vorhanden.";
  }
  return errors;
}

export function validateProductForm(values = {}) {
  const errors = {};
  if (!Number.isInteger(Number(values.id)) || Number(values.id) < 1) errors.id = "Produkt-ID muss positiv sein.";
  if (!values.name?.trim()) errors.name = "Name ist erforderlich.";
  if (values.price === "" || values.price == null || Number(values.price) < 0) errors.price = "Preis darf nicht negativ sein.";
  if (!values.layoutCode?.trim()) errors.layoutCode = "Layout-Code ist erforderlich.";
  return errors;
}

export function validateRecipeForm(values = {}) {
  const errors = {};
  if (!values.slug?.trim()) errors.slug = "Slug ist erforderlich.";
  if (!values.title?.trim()) errors.title = "Titel ist erforderlich.";
  if (!Number.isInteger(Number(values.servings)) || Number(values.servings) < 1) errors.servings = "Portionen muessen mindestens 1 sein.";
  return errors;
}

export function parseImportText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const value = JSON.parse(trimmed);
      if (!Array.isArray(value)) throw new Error("JSON muss ein Array enthalten.");
      return value;
    } catch (error) {
      throw new Error(`JSON-Array ist ungueltig: ${error.message}`);
    }
  }
  return trimmed.split(/\r?\n/).map((line, index) => ({ line: line.trim(), row: index + 1 }))
    .filter(({ line }) => line)
    .map(({ line, row }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Zeile ${row} ist kein gueltiges JSON: ${error.message}`);
      }
    });
}

export function reviewCatalogImport(kind, items = []) {
  const idField = kind === "category" ? "categoryCode" : "id";
  const seen = new Set();
  const rows = items.map((item, index) => {
    const errors = [];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push("Datensatz muss ein JSON-Objekt sein.");
    } else if (kind === "category") {
      const code = Number(item.categoryCode);
      if (!Number.isInteger(code) || code < 1) errors.push("categoryCode muss eine positive Ganzzahl sein.");
      if (typeof item.categoryName !== "string" || !item.categoryName.trim()) errors.push("categoryName ist erforderlich.");
    } else {
      const id = Number(item.id);
      if (!Number.isInteger(id) || id < 1) errors.push("Produkt-ID muss eine positive Ganzzahl sein.");
      if (typeof item.name !== "string" || !item.name.trim()) errors.push("Produktname ist erforderlich.");
      if (item.price == null || item.price === "" || !Number.isFinite(Number(item.price)) || Number(item.price) < 0) errors.push("Preis muss eine endliche Zahl ab 0 sein.");
      if (typeof item.layoutCode !== "string" || !/^\d+\/\d+\/\d+\/\d+$/.test(item.layoutCode.trim())) errors.push("Layout-Code muss dem Format Kategorie/Meter/Fach/Reihe entsprechen.");
    }

    const key = item && typeof item === "object" ? item[idField] : null;
    if (key != null && String(key).trim()) {
      const normalizedKey = String(key).trim();
      if (seen.has(normalizedKey)) errors.push(`Doppelte ${idField}: ${normalizedKey}.`);
      seen.add(normalizedKey);
    }
    return { row: index + 1, item, errors };
  });
  return {
    rows,
    total: rows.length,
    valid: rows.filter((row) => row.errors.length === 0).length,
    invalid: rows.filter((row) => row.errors.length > 0).length
  };
}

export function beaconState(beacon = {}) {
  if (beacon.status === "ARCHIVED") return { tone: "muted", label: "Archiviert" };
  if (!beacon.uuid || beacon.major == null || beacon.minor == null) return { tone: "danger", label: "Identitaet unvollstaendig" };
  if (beacon.currentStore) return { tone: "info", label: `Zugewiesen an ${beacon.currentStore.storeCode || beacon.currentStore.name}` };
  return { tone: "success", label: "Frei" };
}

export function recipeReadiness(recipe = {}) {
  const total = recipe.totalIngredientCount ?? recipe.ingredients?.length ?? 0;
  const mapped = recipe.mappedIngredientCount ?? 0;
  const warnings = [];
  if (!total) warnings.push("Keine Zutaten");
  if (mapped < total) warnings.push(`${total - mapped} Mapping offen`);
  if (recipe.stepCount === 0 || (Array.isArray(recipe.steps) && recipe.steps.length === 0)) warnings.push("Keine Schritte");
  return {
    status: warnings.length ? "warning" : "ready",
    label: warnings.length ? "Nicht publikationsbereit" : "Publikationsbereit",
    warnings
  };
}

export function recipeMappingProductReadiness(product = {}) {
  const layoutCode = String(product.layoutCode ?? "").trim();
  return {
    routable: Boolean(layoutCode),
    label: layoutCode ? "Routbar" : "Nicht routbar",
    tone: layoutCode ? "success" : "warning"
  };
}

export function recipeMappingProductMeta(product = {}) {
  const price = product.price == null ? "-" : `${Number(product.price).toFixed(2)} EUR`;
  const layout = product.layoutCode || "kein Layout-Code";
  const store = product.storeCode || product.storeId || "global";
  return `#${product.id ?? "-"} · ${price} · ${layout} · ${store}`;
}

export function buildRecipeProductMappingPayload(product = {}, options = {}) {
  if (!product.id) {
    return null;
  }
  return {
    productId: Number(product.id),
    storeId: product.storeId || options.storeId || null,
    storeCode: product.storeCode || options.storeCode || null,
    mappingType: options.mappingType || "MANUAL",
    confidence: options.confidence ?? 1,
    manuallyConfirmed: options.manuallyConfirmed ?? true
  };
}

export function buildProductPayload(values = {}) {
  return {
    id: Number(values.id),
    name: String(values.name ?? "").trim(),
    price: nullableNumber(values.price),
    layoutCode: String(values.layoutCode ?? "").trim(),
    storeId: values.storeId?.trim() || null,
    storeCode: values.storeCode?.trim() || null
  };
}

export function nullableNumber(value) {
  return value === "" || value == null ? null : Number(value);
}

export function isActiveLayoutVersion(layout = {}) {
  return layout.status === "ACTIVE";
}

export function buildStorePayload(values = {}) {
  return {
    regionId: values.regionId,
    storeCode: values.storeCode?.trim(),
    name: values.name?.trim(),
    street: values.street?.trim(),
    zipCode: values.zipCode?.trim(),
    city: values.city?.trim(),
    country: values.country?.trim(),
    latitude: values.latitude === "" || values.latitude == null ? null : Number(values.latitude),
    longitude: values.longitude === "" || values.longitude == null ? null : Number(values.longitude),
    notes: values.notes?.trim() || null
  };
}

export function summarizeScope(user = {}) {
  const roles = userRoles(user).join(", ") || "unbekannt";
  const scope = [
    user.regionName || user.regionCode || user.scope?.regionName,
    user.storeName || user.storeCode || user.scope?.storeName
  ].filter(Boolean).join(" / ");
  return scope ? `${roles} · ${scope}` : roles;
}
