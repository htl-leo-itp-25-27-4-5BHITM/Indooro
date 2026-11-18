import type { Category, ElementType, LayoutElement } from "../domain/types";

type Access = NonNullable<LayoutElement["access"]>;
type ShelfType = Extract<ElementType, "shelf" | "fresh" | "cooler">;

/** Small helper that assembles a StoreLayout element list with running ids. */
export function createBuilder(categories: Category[]) {
  let nextId = 1;
  const elements: LayoutElement[] = [];
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name;

  const add = (type: ElementType, x: number, y: number, width: number, height: number, extra: Partial<LayoutElement> = {}) => {
    elements.push({ id: nextId++, type, x, y, width, height, ...extra });
  };

  return {
    elements,
    wall: (x: number, y: number, width: number, height: number) => add("wall", x, y, width, height),
    entrance: (x: number, y: number, width: number, height: number) => add("entrance", x, y, width, height, { label: "Eingang" }),
    exit: (x: number, y: number, width: number, height: number) => add("exit", x, y, width, height, { label: "Ausgang" }),
    checkout: (x: number, y: number, n: number) => add("checkout", x, y, 2, 1, { label: `Kasse ${n}` }),
    beacon: (x: number, y: number, code: string) => add("beacon", x, y, 1, 1, { beaconCode: code }),
    shelf: (type: ShelfType, category: string, meter: number, x: number, y: number, width: number, height: number, access: Access) =>
      add(type, x, y, width, height, { category, meter, access, label: nameOf(category) })
  };
}
