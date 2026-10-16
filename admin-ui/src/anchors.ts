import type { LayoutDocument } from "./editor/model";
import { ANCHOR_ID_PATTERN } from "./editor/validation";

/** A4 page with two columns and three rows of codes. */
export const ANCHORS_PER_PAGE = 6;

export interface PrintableAnchor {
  anchorId: string;
  label: string;
  url: string;
}

/** The customer web view resolves the store and the anchor from these two query items. */
export function anchorUrl(host: string, storeCode: string, anchorId: string): string {
  return `https://${host}/customer/?store=${encodeURIComponent(storeCode)}&a=${encodeURIComponent(anchorId)}`;
}

export function chunk<T>(items: readonly T[], size: number = ANCHORS_PER_PAGE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("Die Seitengröße muss eine positive ganze Zahl sein.");
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

/** Anchors of the active layout in document order. Invalid and repeated ids are never printed. */
export function printableAnchors(document: LayoutDocument, host: string, storeCode: string): PrintableAnchor[] {
  const seen = new Set<string>();
  const anchors: PrintableAnchor[] = [];
  for (const element of document.elements) {
    const anchorId = element.anchorId;
    if (element.type !== "anchor" || typeof anchorId !== "string" || !ANCHOR_ID_PATTERN.test(anchorId) || seen.has(anchorId)) continue;
    seen.add(anchorId);
    anchors.push({ anchorId, label: element.label?.trim() || anchorId, url: anchorUrl(host, storeCode, anchorId) });
  }
  return anchors;
}
