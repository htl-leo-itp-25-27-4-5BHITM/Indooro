import type { Category } from "../domain/types";

/** Fictional assortment structure with Indooro-style numeric category bases. */
export const CATEGORIES: Record<string, Category> = {
  "110": { id: "110", name: "Brot & Gebäck", color: "#E8B86D" },
  "310": { id: "310", name: "Obst & Gemüse", color: "#5ED68A" },
  "320": { id: "320", name: "Fleisch & Wurst", color: "#F08A8A" },
  "410": { id: "410", name: "Milchprodukte", color: "#8CC8FF" },
  "420": { id: "420", name: "Käse & Eier", color: "#F3D56B" },
  "510": { id: "510", name: "Tiefkühl", color: "#7FD8F0" },
  "610": { id: "610", name: "Nudeln, Reis & Mehl", color: "#D9A875" },
  "620": { id: "620", name: "Frühstück & Aufstrich", color: "#C7A6F0" },
  "630": { id: "630", name: "Süßes & Snacks", color: "#F59BC4" },
  "640": { id: "640", name: "Öl, Gewürze & Saucen", color: "#E5A24A" },
  "650": { id: "650", name: "Konserven & Suppen", color: "#A9BCC4" },
  "710": { id: "710", name: "Wasser & Säfte", color: "#5BB8E8" },
  "720": { id: "720", name: "Bier & Wein", color: "#B98CE6" },
  "810": { id: "810", name: "Haushalt & Reinigung", color: "#8FD3C2" },
  "820": { id: "820", name: "Körperpflege", color: "#9FB8F5" }
};

export function categoriesFor(ids: string[]): Category[] {
  return ids.map((id) => CATEGORIES[id]).filter((c): c is Category => Boolean(c));
}
