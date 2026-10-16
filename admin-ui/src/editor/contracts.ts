import type { LayoutDocument } from "./model";

export interface MobileCurrentLayout {
  storeId: string;
  layoutId: string | null;
  source: "ACTIVE" | "DEFAULT";
  fallback: boolean;
  layout: LayoutDocument;
}

export function isLegacyLayoutDocument(value: unknown): value is LayoutDocument {
  if (!value || typeof value !== "object") return false;
  const layout = value as Partial<LayoutDocument>;
  return typeof layout.shopName === "string" && !!layout.gridSize
    && Number.isFinite(layout.gridSize.width) && layout.gridSize.width > 0
    && Number.isFinite(layout.gridSize.height) && layout.gridSize.height > 0
    && Array.isArray(layout.elements);
}

export function isMobileCurrentLayout(value: unknown): value is MobileCurrentLayout {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<MobileCurrentLayout>;
  return typeof response.storeId === "string" && (response.layoutId === null || typeof response.layoutId === "string")
    && (response.source === "ACTIVE" || response.source === "DEFAULT") && typeof response.fallback === "boolean"
    && isLegacyLayoutDocument(response.layout);
}
