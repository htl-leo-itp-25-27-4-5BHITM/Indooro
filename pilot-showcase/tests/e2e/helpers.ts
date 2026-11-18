import { expect } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

export const isMobile = (info: TestInfo) => info.project.name === "mobile";

/** Opens the page and waits until the interactive demo is mounted. */
export async function openDemo(page: Page, query = "") {
  // The 2D floor plan carries the precise test ids; the 3D view has its own spec.
  const q = query.startsWith("?") ? `${query}&ansicht=2d` : `?ansicht=2d${query}`;
  await page.goto(`/${q}`);
  await expect(page.getByTestId("store-demo")).toBeAttached();
  await page.locator("#demo").scrollIntoViewIfNeeded();
}

export type DemoTab = "suche" | "liste" | "navigation";

/** Switches the demo panel tab (tabs exist on desktop and mobile). */
export async function gotoTab(page: Page, tab: DemoTab) {
  const t = page.getByTestId(`tab-${tab}`);
  await t.scrollIntoViewIfNeeded();
  await t.click();
  await expect(t).toHaveAttribute("aria-selected", "true");
}

export async function search(page: Page, query: string) {
  await gotoTab(page, "suche");
  const input = page.getByTestId("search-input");
  await input.fill(query);
  return page.getByTestId("search-result");
}

/** Searches for `query` and adds the first result to the list. */
export async function addFirst(page: Page, query: string) {
  const results = await search(page, query);
  await expect(results.first()).toBeVisible();
  const btn = results.first().getByTestId("add-button");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-pressed", "true");
}

export async function selectMarket(page: Page, code: string) {
  const sw = page.locator(`[data-testid="market-switch"][data-market-code="${code}"]`);
  await sw.scrollIntoViewIfNeeded();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
}

export async function routeLength(page: Page): Promise<number> {
  const el = page.getByTestId("route-path").first();
  await expect(el).toBeAttached();
  return Number(await el.getAttribute("data-length"));
}

export async function markerPos(marker: Locator): Promise<{ x: number; y: number }> {
  return { x: Number(await marker.getAttribute("data-x")), y: Number(await marker.getAttribute("data-y")) };
}

/** Collects console errors and uncaught page errors. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}
