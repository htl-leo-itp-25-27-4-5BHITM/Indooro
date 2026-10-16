import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { LayoutDocument } from "../../src/editor/model";

const initialLayout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;

test("global publication is keyboard-confirmed, recoverable, and public only after success", async ({ page }) => {
  let publicLayout = initialLayout;
  let publicationAttempts = 0;
  let writes = 0;
  const anonymousReads: Array<{ cookie?: string; authorization?: string }> = [];

  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/layout/current", async (route) => {
    if (route.request().method() === "GET") {
      if (new URL(route.request().headers().referer ?? "http://localhost").pathname === "/customer/") {
        const headers = route.request().headers();
        anonymousReads.push({ cookie: headers.cookie, authorization: headers.authorization });
      }
      return route.fulfill({ json: publicLayout });
    }

    writes += 1;
    publicationAttempts += 1;
    if (publicationAttempts === 1) return route.fulfill({ status: 503, json: { error: "Injected publication failure" } });
    publicLayout = route.request().postDataJSON() as LayoutDocument;
    return route.fulfill({ json: { message: "Layout saved", layoutId: "published-keyboard", savedAt: "2026-10-16T10:00:00Z" } });
  });
  await page.route("**/api/layout/history?*", (route) => route.fulfill({ json: [] }));

  await page.goto("/admin/next/editor/");
  const name = page.getByRole("textbox", { name: "Filialname" });
  await name.fill("Keyboard-Veröffentlichung");
  const publish = page.getByRole("button", { name: "Global veröffentlichen" });

  await publish.focus();
  page.once("dialog", (dialog) => void dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(publish).toBeFocused();
  expect(writes).toBe(0);
  await expect(name).toHaveValue("Keyboard-Veröffentlichung");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Serverfehler. Bitte später erneut versuchen.");
  await expect(publish).toBeFocused();
  await expect(name).toHaveValue("Keyboard-Veröffentlichung");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();
  expect(writes).toBe(1);
  expect(publicLayout.shopName).toBe(initialLayout.shopName);

  const customer = await page.context().newPage();
  await customer.route("**/api/layout/current", (route) => {
    const headers = route.request().headers();
    anonymousReads.push({ cookie: headers.cookie, authorization: headers.authorization });
    return route.fulfill({ json: publicLayout });
  });
  await customer.goto("/customer/");
  await expect(customer.locator("#shopNameDisplay")).toHaveText(initialLayout.shopName);
  expect(anonymousReads).toHaveLength(1);
  expect(anonymousReads[0]).toEqual({ cookie: undefined, authorization: undefined });

  await publish.focus();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.keyboard.press("Enter");
  await expect(page.locator(".le-message")).toHaveText("Globales Layout veröffentlicht.");
  await expect(publish).toBeFocused();
  await expect(publish).toHaveAttribute("aria-disabled", "true");
  expect(writes).toBe(2);
  expect(publicLayout.shopName).toBe("Keyboard-Veröffentlichung");

  await customer.reload();
  await expect(customer.locator("#shopNameDisplay")).toHaveText("Keyboard-Veröffentlichung");
  expect(anonymousReads).toHaveLength(2);
  expect(anonymousReads.every((headers) => headers.cookie === undefined && headers.authorization === undefined)).toBe(true);
  await customer.close();
});
