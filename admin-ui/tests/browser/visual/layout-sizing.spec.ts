import { expect, test } from "@playwright/test";
import { mockVisualApi } from "./fixtures";

test("canvas geometry does not depend on the measured viewBox aspect ratio", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await mockVisualApi(page);
  await page.goto("/admin/next/editor/?storeId=store-1");
  const canvas = page.getByRole("group", { name: "Interaktiver Grundriss" });
  await expect(canvas).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const sizes = await canvas.evaluate(async (node) => {
    const settle = async () => {
      for (let frame = 0; frame < 10; frame++) await new Promise(requestAnimationFrame);
    };
    await settle();
    const before = node.getBoundingClientRect().height;
    // A viewBox describes drawing coordinates, and must never size the flex item.
    // A tall intrinsic ratio exposed the ResizeObserver -> viewBox -> layout loop.
    node.setAttribute("viewBox", "0 0 528 10000");
    await settle();
    return { before, after: node.getBoundingClientRect().height };
  });
  expect(sizes.after).toBeCloseTo(sizes.before, 1);
});
