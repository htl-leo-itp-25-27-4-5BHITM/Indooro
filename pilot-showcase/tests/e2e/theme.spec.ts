import { expect, test } from "@playwright/test";

const path = "/?ansicht=2d";

async function openThemeControl(page: import("@playwright/test").Page) {
  if ((page.viewportSize()?.width ?? 0) < 1024) await page.getByTestId("nav-menu-button").click();
  return page.getByRole("combobox", { name: "Darstellung", exact: true });
}
test.use({ colorScheme: "dark" });

test("theme follows the OS, persists manual choices, and restores System", async ({ page }) => {

  await page.goto(path);
  const control = await openThemeControl(page);
  await expect(control).toHaveValue("system");
  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  expect(await scheme()).toBe("dark");
  await control.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await scheme()).toBe("light");
  await page.reload();
  await openThemeControl(page);
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

  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("Blocked storage"); } });
  });
  await page.goto(path);
  await (await openThemeControl(page)).selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("invalid stored preferences fall back to System and the header selector is visible without hover or focus", async ({ page }) => {

  await page.addInitScript(() => localStorage.setItem("indooro-theme", "invalid"));
  await page.goto(path);
  const control = await openThemeControl(page);
  await expect(control).toHaveValue("system");
  await expect(control).toBeVisible();
  await expect(page.locator(".theme-control:visible")).toHaveCSS("opacity", "1");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
});

test("390px mobile menu exposes the theme selector in its keyboard loop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  const control = await openThemeControl(page);
  await expect(control).toBeVisible();
  await expect(page.locator(".theme-control:visible")).toHaveText(/Darstellung/);
  const box = await control.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.getByTestId("nav-sheet-link-pilot").focus();
  await page.keyboard.press("Tab");
  await expect(control).toBeFocused();
  await control.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("nav-menu-button")).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(control).toHaveValue("light");
});
