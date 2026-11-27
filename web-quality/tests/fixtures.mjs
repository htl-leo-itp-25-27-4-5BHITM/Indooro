import { test as base, expect } from '@playwright/test';

export const stores = [
  { id: 11, storeCode: 'WIEN', name: 'Indooro Markt Wien', city: 'Wien', address: 'Marktstraße 12' },
  { id: 12, storeCode: 'LINZ', name: 'Indooro Markt Linz', city: 'Linz', address: 'Hauptplatz 8' },
];
export const layout = {
  storeId: 11,
  layout: {
    shopName: stores[0].name,
    gridSize: { width: 24, height: 16 },
    elements: [
      { id: 'entry', type: 'entrance', x: 1, y: 13, width: 4, height: 1 },
      { id: 'wall', type: 'wall', x: 0, y: 0, width: 24, height: 1 },
      { id: 'baking', type: 'shelf', label: 'Backzutaten', category: 'BACK/1', x: 6, y: 3, width: 8, height: 2 },
      { id: 'bread', type: 'shelf', label: 'Brot', category: 'BROT/2', x: 6, y: 8, width: 8, height: 2 },
      { id: 'anchor', type: 'anchor', anchorId: 'A1', x: 2, y: 11, width: 1, height: 1 },
    ],
  },
};
export const products = [
  { id: 101, name: 'Bio Backpulver', price: 1.29, layoutCode: 'BACK/1/2/3' },
  { id: 102, name: 'Bauernbrot', price: 3.49, layoutCode: 'BROT/2/1/2' },
  { id: 103, name: 'Backmischung Dinkel', price: 2.79, layoutCode: 'OTHER/9/1/1' },
];

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/mobile/stores') return route.fulfill({ json: stores });
      if (url.pathname === '/api/mobile/stores/11/layout/current') return route.fulfill({ json: layout });
      if (url.pathname === '/api/products/search' && url.searchParams.get('storeCode') === 'WIEN') {
        return route.fulfill({ json: url.searchParams.get('q') === 'xyz' ? [] : products });
      }
      throw new Error(`Unmocked API request: ${route.request().method()} ${url}`);
    });
    await use(page);
  },
});
export { expect };
