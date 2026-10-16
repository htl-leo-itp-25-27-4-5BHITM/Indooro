import { expect, test } from "@playwright/test";

test("store editor Back protects an unsaved edit and returns to that store detail", async ({ page }) => {
  const document = {
    shopName: "Back target fixture",
    gridSize: { width: 20, height: 20 },
    elements: [{ id: 1, type: "entrance", x: 1, y: 0, width: 2, height: 1 }],
  };
  let writes = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: {
    subject: "admin-1", username: "admin", role: "admin", scope: null,
  } }));
  await page.route("**/api/stores/store-1/layout/editor-context", (route) => route.fulfill({ json: {
    store: { id: "store-1", storeCode: "BACK-1", name: "Back target fixture" },
    currentLayout: { layoutId: "active-1", versionNo: 1, status: "ACTIVE", layout: document },
    assignedBeacons: [],
  } }));
  await page.route("**/api/stores/store-1/layout/versions", (route) => {
    if (route.request().method() !== "GET") writes += 1;
    return route.fulfill({ json: [] });
  });
  await page.route("**/api/stores/store-1/layout/versions/active-1", (route) => route.fulfill({ json: {
    layoutId: "active-1", versionNo: 1, status: "ACTIVE", layout: document,
  } }));

  await page.goto("/admin/next/editor/?storeId=store-1&layoutId=active-1");
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  await page.getByRole("textbox", { name: "Filialname" }).fill("Unsaved Back target");
  await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/next\/editor\/\?storeId=store-1/);
  await expect(page.getByRole("textbox", { name: "Filialname" })).toHaveValue("Unsaved Back target");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Zurück", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/next\/stores\/detail\/\?storeId=store-1$/);
  expect(writes).toBe(0);
});
