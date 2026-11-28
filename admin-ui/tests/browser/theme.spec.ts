import { mockVisualApi } from "./visual/fixtures";
import { expect, test } from "@playwright/test";

const path = "/admin/next/";
test.use({ colorScheme: "dark" });

test("theme follows the OS, persists manual choices, and restores System", async ({ page }) => {
  await mockVisualApi(page);
  await page.goto(path);
  const control = page.getByRole("combobox", { name: "Darstellung", exact: true });
  await expect(control).toHaveValue("system");
  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(await scheme()).toBe("dark");
  await control.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await scheme()).toBe("light");
  await page.reload();
  await expect(control).toHaveValue("light");
  await control.selectOption("dark");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await scheme()).toBe("dark");
  await control.selectOption("system");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await scheme()).toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  expect(await scheme()).toBe("light");
});

test("blocked storage preserves a working selector", async ({ page }) => {
  await mockVisualApi(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Blocked storage"); } });
  });
  await page.goto(path);
  await page.getByRole("combobox", { name: "Darstellung", exact: true }).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("invalid stored preferences fall back to System and the header selector is visible without hover or focus", async ({ page }) => {
  await mockVisualApi(page);
  await page.addInitScript(() => localStorage.setItem("indooro-theme", "invalid"));
  await page.goto(path);
  const control = page.getByRole("combobox", { name: "Darstellung", exact: true });
  await expect(control).toHaveValue("system");
  await expect(control).toBeVisible();
  await expect(page.locator(".theme-control")).toHaveCSS("opacity", "1");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
});

for (const width of [390, 768, 1440]) {
  test(`theme selector stays inside the header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mockVisualApi(page);
    await page.goto(path);
    const control = page.getByRole("combobox", { name: "Darstellung", exact: true });
    await expect(control).toBeVisible();
    const header = await page.locator(".masthead").boundingBox();
    const box = await control.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(header!.y + header!.height);
  });
}
