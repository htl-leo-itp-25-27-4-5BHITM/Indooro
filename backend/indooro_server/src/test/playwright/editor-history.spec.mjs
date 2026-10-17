import { expect, test } from "@playwright/test";

test("draw, selection, move, undo and redo preserve completed editor states", async ({ page }) => {
  await page.goto("/admin/editor/?storeId=store-1&legacy=1");
  const canvas = page.locator("#canvasContainer");
  const elements = canvas.locator(".element-box");
  await expect(elements).toHaveCount(1);

  await page.getByRole("button", { name: "Draw/Add" }).click();
  const bounds = await canvas.boundingBox();
  const point = (x, y) => ({ x: bounds.x + x * 20, y: bounds.y + y * 20 });
  await page.mouse.move(point(4, 4).x, point(4, 4).y);
  await page.mouse.down();
  await page.mouse.move(point(6, 6).x, point(6, 6).y);
  await page.mouse.up();
  await expect(elements).toHaveCount(2);

  await page.getByRole("button", { name: "Select" }).click();
  await canvas.click({ position: { x: 200, y: 200 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(elements).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(elements).toHaveCount(2);

  await page.locator("#layersList [data-layer-id]").last().click();
  const moved = elements.last();
  const initialLeft = await moved.evaluate((element) => element.style.left);
  await page.keyboard.press("ArrowRight");
  const movedLeft = await moved.evaluate((element) => element.style.left);
  expect(movedLeft).not.toBe(initialLeft);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(moved).toHaveCSS("left", initialLeft);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(moved).toHaveCSS("left", movedLeft);
});

test("property, duplicate and delete edits each restore through undo and redo", async ({ page }) => {
  await page.goto("/admin/editor/?storeId=store-1&legacy=1");
  const elements = page.locator("#canvasContainer .element-box");
  await page.locator("#layersList [data-layer-id]").first().click();
  await page.locator("#propW").fill("4");
  await page.locator("#propW").press("Tab");
  await expect(elements.first()).toHaveCSS("width", "80px");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(elements.first()).toHaveCSS("width", "40px");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(elements.first()).toHaveCSS("width", "80px");

  await page.locator("#layersList [data-layer-id]").first().click();
  await page.locator('#propertiesWrapper button[title="Duplizieren"]').click();
  await expect(elements).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(elements).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(elements).toHaveCount(2);

  await page.locator("#layersList [data-layer-id]").last().click();
  await page.locator('#propertiesWrapper button[title="Löschen"]').click();
  await expect(elements).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(elements).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(elements).toHaveCount(1);
});
