import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LayoutDocument } from "../../src/editor/model";

const layout = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;

async function mockEditor(page: Page, saved: LayoutDocument[] = []) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/stores/store-1/layout/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/editor-context")) return route.fulfill({ json: {
      store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" },
      currentLayout: { layoutId: "current-1", versionNo: 1, status: "DRAFT", layout },
      assignedBeacons: [],
    } });
    if (url.pathname.endsWith("/versions") && route.request().method() === "GET") return route.fulfill({ json: [] });
    if (url.pathname.endsWith("/versions") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { layout: LayoutDocument };
      saved.push(payload.layout);
      return route.fulfill({ json: { layoutId: "draft-1", versionNo: 2, status: "DRAFT", layout: payload.layout } });
    }
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
}

test("keyboard activation of a validation issue selects its element and inspector", async ({ page }) => {
  await mockEditor(page);
  const imported = structuredClone(layout);
  imported.elements[1].id = "legacy-shelf";
  await page.goto("/admin/next/editor/?storeId=store-1");
  await page.locator(".le-file-input").setInputFiles({ name: "legacy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });

  const shelf = page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" });
  await expect(shelf).toHaveAttribute("aria-current", "false");
  const issue = page.locator(".le-validation li").getByRole("button", { name: /numerische Element-ID/ });
  await issue.focus();
  await page.keyboard.press("Enter");

  await expect(issue).toBeFocused();
  await expect(shelf).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("Elementtyp: Regal")).toBeVisible();
});

test("a keyboard focused locked layer stays selected and cannot move or duplicate", async ({ page }) => {
  await mockEditor(page);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const shelf = page.locator(".le-layers button").filter({ hasText: "Obst & Gemüse" });
  await shelf.focus();
  await page.keyboard.press("Space");
  const locked = page.getByRole("checkbox", { name: "Gesperrt" });
  await locked.focus();
  await page.keyboard.press("Space");
  await expect(locked).toBeChecked();

  const x = page.getByLabel("X", { exact: true });
  const initialX = await x.inputValue();
  const canvas = page.getByRole("group", { name: "Interaktiver Grundriss" });
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ControlOrMeta+D");

  await expect(x).toHaveValue(initialX);
  await expect(shelf).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".le-layers button")).toHaveCount(layout.elements.length);
  await expect(page.getByRole("button", { name: "Duplizieren" })).toBeDisabled();
});

test("keyboard Back keeps a dirty editor on cancel and leaves it on accept", async ({ page }) => {
  await mockEditor(page);
  await page.route("**/api/stores/store-1", (route) => route.fulfill({ json: {
    id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale", city: "Linz", status: "ACTIVE",
    region: { id: "region-1", code: "AT-O", name: "Oberösterreich" },
  } }));
  await page.goto("/admin/next/editor/?storeId=store-1");
  await page.getByLabel("Filialname").fill("Ungespeichert");
  const back = page.getByRole("button", { name: "Zurück", exact: true });
  await back.focus();

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Enter");
  await expect(back).toBeFocused();
  await expect(page).toHaveURL(/\/admin\/next\/editor\/\?storeId=store-1$/);
  await expect(page.getByLabel("Filialname")).toHaveValue("Ungespeichert");

  page.once("dialog", (dialog) => dialog.accept());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/admin\/next\/stores\/detail\/\?storeId=store-1$/);
});
