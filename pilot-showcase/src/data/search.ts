import type { Market, Product } from "../domain/types";

export interface SearchResult {
  product: Product;
  score: number;
}

/** Lowercase, strip diacritics, ß → ss and fold ae/oe/ue to a/o/u so "Äpfel", "Aepfel" and "Apfel" meet. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9% ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Optimal-string-alignment distance (Levenshtein + adjacent transposition). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array<number>(m).fill(0)]);
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

interface IndexedProduct {
  product: Product;
  name: string[];
  nameFull: string;
  brand: string[];
  category: string[];
  keywords: string[];
  keywordsFull: string[];
}

const words = (s: string) => normalize(s).split(" ").filter(Boolean);
const cache = new WeakMap<Market, IndexedProduct[]>();

function indexOf(market: Market): IndexedProduct[] {
  const hit = cache.get(market);
  if (hit) return hit;
  const categoryNames = new Map(market.categories.map((c) => [c.id, c.name]));
  const built = market.products.map((product) => ({
    product,
    name: words(product.name),
    nameFull: normalize(product.name),
    brand: words(product.brand ?? ""),
    category: words(categoryNames.get(product.categoryId) ?? ""),
    keywords: (product.keywords ?? []).flatMap(words),
    keywordsFull: (product.keywords ?? []).map(normalize)
  }));
  cache.set(market, built);
  return built;
}

const TYPO_MIN_LENGTH = 4;

function typoMatch(token: string, candidates: string[]): boolean {
  if (token.length < TYPO_MIN_LENGTH) return false;
  return candidates.some((w) => {
    if (Math.abs(w.length - token.length) <= 1 && editDistance(token, w) <= 1) return true;
    // as-you-type: compare to the same-length prefix of longer words
    return w.length > token.length && editDistance(token, w.slice(0, token.length)) <= 1;
  });
}

/** Score of one query token against one product; 0 = no match. */
function scoreToken(token: string, p: IndexedProduct): number {
  let best = 0;
  const upd = (v: number) => {
    if (v > best) best = v;
  };
  for (const w of p.name) {
    if (w === token) upd(100);
    else if (w.startsWith(token)) upd(85);
    else if (token.length >= 3 && w.includes(token)) upd(55);
  }
  for (const w of p.keywords) {
    if (w === token) upd(80);
    else if (w.startsWith(token)) upd(65);
    else if (token.length >= 3 && w.includes(token)) upd(40);
  }
  for (const w of p.brand) {
    if (w === token) upd(45);
    else if (w.startsWith(token)) upd(38);
  }
  for (const w of p.category) {
    if (w === token) upd(35);
    else if (w.startsWith(token)) upd(30);
    else if (token.length >= 3 && w.includes(token)) upd(20);
  }
  if (best === 0 && typoMatch(token, p.name)) upd(30);
  if (best === 0 && typoMatch(token, p.keywords)) upd(24);
  if (best === 0 && typoMatch(token, [...p.brand, ...p.category])) upd(15);
  return best;
}

/**
 * Market-scoped product search: tokens are AND-combined; each token may match name, brand, category
 * name or keywords by exact word, prefix, substring or (≥ 4 chars) one typo. Returns [] for empty queries.
 */
export function searchProducts(market: Market, query: string, limit = 12): SearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ");
  const results: SearchResult[] = [];
  for (const p of indexOf(market)) {
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = scoreToken(t, p);
      if (!s) {
        ok = false;
        break;
      }
      total += s;
    }
    if (!ok) continue;
    if (p.nameFull.startsWith(q)) total += 25;
    else if (p.keywordsFull.some((k) => k.startsWith(q))) total += 10;
    results.push({ product: p.product, score: total });
  }
  results.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "de"));
  return results.slice(0, limit);
}

export const SEARCH_SUGGESTIONS = ["Paradeiser", "Hafermilch", "Topfen", "Semmeln", "Faschiertes", "Kaffee"];
