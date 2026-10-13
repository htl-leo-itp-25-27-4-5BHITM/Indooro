/**
 * Legacy entry points stay available while each candidate route is verified.
 * Switch one entry to true only after its parity record is complete. Reverting
 * that one value restores the original static page on the next build.
 */
export const ROUTE_CUTOVER = Object.freeze({
  dashboard: true,
  regions: false,
  stores: false,
  storeDetail: false,
  beacons: false,
  products: false,
  categories: false,
  recipes: false,
  editor: false,
  diagnostics: true
});

const ENTRIES = Object.freeze({
  "/admin/": ["dashboard", "/admin/next/"],
  "/admin/regions/": ["regions", "/admin/next/regions/"],
  "/admin/stores/": ["stores", "/admin/next/stores/"],
  "/admin/stores/detail/": ["storeDetail", "/admin/next/stores/detail/"],
  "/admin/beacons/": ["beacons", "/admin/next/beacons/"],
  "/admin/products/": ["products", "/admin/next/products/"],
  "/admin/categories/": ["categories", "/admin/next/categories/"],
  "/admin/recipes/": ["recipes", "/admin/next/recipes/"],
  "/admin/editor/": ["editor", "/admin/next/editor/"],
  "/admin/server-logs/": ["diagnostics", "/admin/next/server-logs/"]
});

export function cutoverTarget(pathname, search = "", hash = "", flags = ROUTE_CUTOVER) {
  const normalized = pathname.endsWith("/") ? pathname : `${pathname}/`;
  const entry = ENTRIES[normalized];
  return entry && flags[entry[0]] === true ? `${entry[1]}${search}${hash}` : null;
}

if (typeof window !== "undefined") {
  const target = cutoverTarget(window.location.pathname, window.location.search, window.location.hash);
  if (target) window.location.replace(target);
}
