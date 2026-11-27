import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.mjs';

const scenarios = {
  landing: async (page) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Wohin soll es gehen?' })).toBeVisible();
  },
  stores: async (page) => {
    await page.goto('/customer/');
    await expect(page.getByRole('button', { name: /Indooro Markt Wien/ })).toBeVisible();
  },
  finder: openFinder,
  results: search,
  'shopping-list': async (page) => {
    await search(page);
    const results = page.locator('#search-results-panel');
    await results.getByRole('button', { name: 'Zur Liste', exact: true }).first().click();
    await results.getByRole('button', { name: 'Zur Liste', exact: true }).first().click();
    await expect(page.locator('#list-items > li')).toHaveCount(2);
    await page.locator('#list-items').getByRole('button', { name: 'Erledigt', exact: true }).first().click();
    await expect(page.getByTestId('route')).toBeAttached();
    await page.getByRole('button', { name: 'Suche löschen' }).click();
    await expect(page.locator('#search-results-panel > li')).toHaveCount(0);
  },
  'empty-search': async (page) => {
    await openFinder(page);
    await page.getByRole('searchbox').fill('xyz');
    await expect(page.getByRole('status').filter({ hasText: 'Nichts gefunden' })).toBeVisible();
  },
  'connection-error': async (page) => {
    await page.route('**/api/mobile/stores', (route) => route.abort('failed'));
    await page.goto('/customer/');
    await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
  },
};

async function openFinder(page) {
  await page.goto('/customer/?store=WIEN');
  await expect(page.getByRole('heading', { name: 'Indooro Markt Wien' })).toBeVisible();
  await expect(page.getByTestId('map')).toBeVisible();
}

async function search(page) {
  await openFinder(page);
  await page.getByRole('searchbox').fill('back');
  await expect(page.locator('#search-results-panel > li')).toHaveCount(3);
  await expect(page.locator('#search-status')).toHaveText('3 Produkte gefunden.');
}

for (const [name, prepare] of Object.entries(scenarios)) {
  test(`${name} @visual`, async ({ page }) => {
    await prepare(page);
    await page.evaluate(() => document.fonts.ready);
    // Interactions may scroll to lower controls; all snapshots start at the top.
    await page.mouse.move(0, 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });

  test(`${name} @a11y`, async ({ page }, testInfo) => {
    await prepare(page);
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      await testInfo.attach(`axe-results-${colorScheme}`, {
        body: JSON.stringify(results, null, 2), contentType: 'application/json',
      });
      expect(results.violations.filter(({ impact }) => ['serious', 'critical'].includes(impact)),
        `${name}: ${colorScheme} theme`).toEqual([]);
    }
  });
}


test('zoomed map supports keyboard panning and reset @a11y', async ({ page }) => {
  await openFinder(page);
  await page.getByRole('button', { name: 'Vergrößern' }).click();
  const viewport = page.getByRole('region', { name: 'Ladenplan verschieben' });
  await viewport.focus();
  const stage = page.locator('#mapCanvas');
  const before = await stage.getAttribute('style');
  await page.keyboard.press('ArrowRight');
  await expect(stage).not.toHaveAttribute('style', before);
  await page.keyboard.press('Home');
  await expect(page.locator('#zoom-label')).toHaveText('100 %');
  await expect(stage).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
});
