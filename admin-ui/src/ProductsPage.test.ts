import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLayoutCode,
  isProductPageResponse,
  parseLayoutCode,
  parseProductPrice,
  productListPath,
  productPageUrl,
  productPayload,
  productReadiness,
  readProductFilters,
  validateProductDraft,
  type Category,
  type Product,
  type ProductDraft
} from "./ProductsPage";

const categories: Category[] = [{ categoryCode: 310, categoryName: "Obst & Gemüse" }, { categoryCode: 420, categoryName: "Konserven & Saucen" }];
const baseDraft: ProductDraft = {
  id: "42", name: " Tomaten ", price: "1.99", storeId: "", storeCode: "", categoryCode: "310", meter: "1", shelf: "1", position: "1"
};
const product: Product = { id: 42, name: "Tomaten", price: 1.99, layoutCode: "310/1/1/1", storeId: null, storeCode: null };

test("product query uses server-side paging and search with stable page links", () => {
  assert.deepEqual(readProductFilters("?q=Tomaten&page=3&size=40"), { q: "Tomaten", page: 3, size: 40 });
  assert.deepEqual(readProductFilters("?page=-2&size=1000"), { q: "", page: 0, size: 20 });
  assert.equal(productListPath({ q: " Tomaten ", page: 2, size: 20 }), "/api/admin/products?page=2&size=20&q=Tomaten");
  assert.equal(productPageUrl({ q: "Tomaten", page: 2, size: 20 }), "/admin/next/products/?q=Tomaten&page=2");
  assert.equal(productPageUrl({ q: "", page: 0, size: 20 }), "/admin/next/products/");
});

test("accepts the backend PageResponse contract and rejects legacy arrays or invalid metadata", () => {
  assert.equal(isProductPageResponse({ content: [product], page: 2, size: 20, totalElements: 51 }), true);
  assert.equal(isProductPageResponse({ content: [], page: 0, size: 20, totalElements: 0 }), true);
  assert.equal(isProductPageResponse([product]), false);
  assert.equal(isProductPageResponse({ content: [], page: -1, size: 20, totalElements: 0 }), false);
  assert.equal(isProductPageResponse({ content: [], page: 0, size: 0, totalElements: 0 }), false);
});

test("parses documented layout code 310/1/1/1 and rejects unsupported positions", () => {
  assert.deepEqual(parseLayoutCode("310/1/1/1"), { categoryCode: 310, meter: 1, shelf: 1, position: 1 });
  assert.deepEqual(parseLayoutCode("310/5/7/3"), { categoryCode: 310, meter: 5, shelf: 7, position: 3 });
  assert.equal(parseLayoutCode("310/6/1/1"), null);
  assert.equal(parseLayoutCode("31/1/1/1"), null);
  assert.equal(parseLayoutCode("310/a/1/1"), null);
});

test("layout code builder and product payload preserve category and store context", () => {
  assert.equal(buildLayoutCode(baseDraft), "310/1/1/1");
  assert.deepEqual(productPayload({ ...baseDraft, storeId: " store-1 ", storeCode: " LINZ-01 " }), {
    id: 42, name: "Tomaten", price: 1.99, layoutCode: "310/1/1/1", storeId: "store-1", storeCode: "LINZ-01"
  });
});

test("accepts decimal comma for local product price entry", () => {
  assert.equal(parseProductPrice("1,99"), 1.99);
  assert.equal(productPayload({ ...baseDraft, price: "0,50" }).price, 0.5);
});

test("validates positive product id, required values, category existence, and documented location ranges", () => {
  assert.deepEqual(validateProductDraft(baseDraft, categories), {});
  assert.deepEqual(validateProductDraft({ ...baseDraft, id: "0", name: " ", price: "-1", categoryCode: "999", meter: "6", shelf: "8", position: "0" }, categories), {
    id: "Produkt-ID muss eine positive ganze Zahl sein.",
    name: "Name ist erforderlich.",
    price: "Preis muss eine Zahl größer oder gleich 0 sein.",
    categoryCode: "Kategorie wurde nicht gefunden.",
    meter: "Meter muss zwischen 1 und 5 liegen.",
    shelf: "Fach muss zwischen 1 und 7 liegen.",
    position: "Reihe muss zwischen 1 und 3 liegen."
  });
});

test("readiness shows named category and distinguishes global from store-scoped products", () => {
  assert.deepEqual(productReadiness(product, categories), {
    ready: true,
    label: "Global routbar",
    detail: "1. Regalabschnitt · Fach 1 · Position 1",
    categoryName: "Obst & Gemüse"
  });
  assert.equal(productReadiness({ ...product, storeId: "store-1" }, categories).label, "Routbar");
  assert.equal(productReadiness({ ...product, layoutCode: "310/6/1/1" }, categories).ready, false);
  assert.equal(productReadiness({ ...product, layoutCode: "420/1/1/1" }, categories).categoryName, "Konserven & Saucen");
  assert.equal(productReadiness({ ...product, layoutCode: "999/1/1/1" }, categories).label, "Kategorie fehlt");
});
