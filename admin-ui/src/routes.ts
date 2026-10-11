export type StaffRole = "admin" | "region-manager" | "store-manager";

export interface CurrentUser {
  subject: string;
  username: string;
  email: string | null;
  role: string;
  scope: { regionId: string | null; regionName: string | null; storeId: string | null; storeName: string | null } | null;
}

export interface StaffRoute { label: string; path: string; roles: readonly StaffRole[] }

export const staffRoutes: readonly StaffRoute[] = [
  { label: "Dashboard", path: "/admin/", roles: ["admin", "region-manager", "store-manager"] },
  { label: "Regionen", path: "/admin/regions/", roles: ["admin", "region-manager"] },
  { label: "Stores", path: "/admin/stores/", roles: ["admin", "region-manager", "store-manager"] },
  { label: "Beacons", path: "/admin/beacons/", roles: ["admin", "region-manager", "store-manager"] },
  { label: "Produkte", path: "/admin/products/", roles: ["admin"] },
  { label: "Kategorien", path: "/admin/categories/", roles: ["admin"] },
  { label: "Rezepte", path: "/admin/recipes/", roles: ["admin"] },
  { label: "Layout Editor", path: "/admin/editor/", roles: ["admin", "region-manager", "store-manager"] },
  { label: "Diagnose", path: "/admin/server-logs/", roles: ["admin"] }
];

export function visibleRoutes(role: string): StaffRoute[] {
  return staffRoutes.filter((route) => route.roles.some((allowed) => allowed === role));
}

export function candidateAccess(pathname: string, role: string, requestedStoreId?: string | null, scopeStoreId?: string | null): "allowed" | "forbidden" | "missing" {
  if (pathname === "/admin/next/" || pathname === "/admin/next") {
    return visibleRoutes(role).length ? "allowed" : "forbidden";
  }
  if (pathname === "/admin/next/stores/detail/" || pathname === "/admin/next/stores/detail") {
    if (role === "store-manager" && (!requestedStoreId || requestedStoreId !== scopeStoreId)) return "forbidden";
    return ["admin", "region-manager", "store-manager"].includes(role) ? "allowed" : "forbidden";
  }
  if (pathname === "/admin/next/stores/" || pathname === "/admin/next/stores") {
    return ["admin", "region-manager", "store-manager"].includes(role) ? "allowed" : "forbidden";
  }
  if (pathname === "/admin/next/editor/" || pathname === "/admin/next/editor") {
    if (role === "store-manager" && (!requestedStoreId || requestedStoreId !== scopeStoreId)) return "forbidden";
    return ["admin", "region-manager", "store-manager"].includes(role) ? "allowed" : "forbidden";
  }
  return "missing";
}
