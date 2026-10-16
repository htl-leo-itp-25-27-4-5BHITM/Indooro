import type { LayoutDocument, LayoutElement } from "./model";

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

/** Choosing a catalog category gives a shelf its first free routable section. */
export function chooseShelfCategory(document: LayoutDocument, element: LayoutElement, code: string): Pick<LayoutElement, "category" | "meter"> {
  const used = new Set(document.elements.filter((other) => other !== element && other.id !== element.id && other.type === "shelf")
    .filter((other) => shelfMetadata(other).code === code)
    .map((other) => shelfMetadata(other).section)
    .filter((section): section is number => section !== null));
  const current = shelfMetadata(element).section;
  let section = current && !used.has(current) ? current : 1;
  while (used.has(section)) section++;
  return shelfMetadataChanges(element, { code, section });
}

/** Repair incomplete or duplicate shelf addresses while preserving unique published sections. */
export function assignShelfSections(document: LayoutDocument): LayoutDocument {
  const groups = new Map<string, Array<{ element: LayoutElement; index: number }>>();
  document.elements.forEach((element, index) => {
    if (element.type !== "shelf") return;
    const code = shelfMetadata(element).code.trim();
    if (!/^\d{1,4}$/.test(code)) return;
    const group = groups.get(code) ?? [];
    group.push({ element, index });
    groups.set(code, group);
  });
  const replacements = new Map<number, LayoutElement>();
  for (const [code, group] of groups) {
    const ordered = group.sort((a, b) => a.element.y - b.element.y || a.element.x - b.element.x || a.index - b.index);
    const used = new Set<number>();
    const pending: typeof ordered = [];
    for (const entry of ordered) {
      const section = shelfMetadata(entry.element).section;
      if (section === null || used.has(section)) pending.push(entry);
      else {
        used.add(section);
        replacements.set(entry.index, { ...entry.element, category: `${code}/${section}`, meter: section });
      }
    }
    let next = 1;
    for (const entry of pending) {
      while (used.has(next)) next++;
      used.add(next);
      replacements.set(entry.index, { ...entry.element, category: `${code}/${next}`, meter: next });
    }
  }
  return { ...document, elements: document.elements.map((element, index) => replacements.get(index) ?? element) };
}

/** A new QR anchor gets the next free `A<n>` id so that printed codes stay unique by default. */
export function nextAnchorId(document: LayoutDocument): string {
  const used = new Set(document.elements.filter((element) => element.type === "anchor").map((element) => String(element.anchorId ?? "")));
  let number = 1;
  while (used.has(`A${number}`)) number++;
  return `A${number}`;
}

const safeHex = /^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i;
export function elementFill(element: LayoutElement, fallback: string): string {
  return typeof element.color === "string" && safeHex.test(element.color) ? element.color : fallback;
}
