import type { LayoutElement } from "./model";

export interface ShelfMetadata { code: string; section: number | null }

/** Legacy consumers address a shelf by `category` in CODE/SECTION form. */
export function shelfMetadata(element: LayoutElement): ShelfMetadata {
  const category = typeof element.category === "string" ? element.category : "";
  const slash = category.lastIndexOf("/");
  const suffix = slash < 0 ? null : Number(category.slice(slash + 1));
  const code = slash < 0 ? category : category.slice(0, slash);
  const section = typeof element.meter === "number" && Number.isInteger(element.meter) && element.meter > 0
    ? element.meter
    : suffix !== null && Number.isInteger(suffix) && suffix > 0 ? suffix : null;
  return { code, section };
}

export function shelfMetadataChanges(element: LayoutElement, changes: Partial<ShelfMetadata>): Pick<LayoutElement, "category" | "meter"> {
  const previous = shelfMetadata(element);
  const code = (changes.code ?? previous.code).trim();
  const section = changes.section === undefined ? previous.section : changes.section;
  if (!code) return { category: null, meter: section };
  if (section === null || !Number.isInteger(section) || section <= 0) return { category: code, meter: null };
  return { category: `${code}/${section}`, meter: section };
}

const safeHex = /^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i;
export function elementFill(element: LayoutElement, fallback: string): string {
  return typeof element.color === "string" && safeHex.test(element.color) ? element.color : fallback;
}
