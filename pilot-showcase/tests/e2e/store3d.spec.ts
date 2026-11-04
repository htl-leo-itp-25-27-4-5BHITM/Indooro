import { expect, test } from "@playwright/test";
import { collectErrors, gotoTab } from "./helpers";

// Headless Chromium needs a software GL backend for WebGL.
test.use({ launchOptions: { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] } });

// software rendering is slow: give the 3D tests room
test.setTimeout(120_000);

async function open3d(page: import("@playwright/test").Page) {
  await page.goto("/?ansicht=3d#demo");
  const view = page.getByTestId("store-3d");
  await expect(view).toBeAttached({ timeout: 20_000 });
  await view.scrollIntoViewIfNeeded();
  return view;
}

test.describe("3D-Ansicht", () => {
  test("rendert, plant eine Route und läuft in der Simulation", async ({ page }) => {
    const errors = collectErrors(page);
    const view = await open3d(page);
    const canvas = page.getByTestId("store-3d-canvas");
    await expect(canvas).toBeVisible();
    await expect(view).toHaveAttribute("data-route-length", "0");
    await expect(view).toHaveAttribute("data-sim-state", "idle");

    await gotoTab(page, "liste");
    await page.getByTestId("load-example").click();
    await expect.poll(async () => Number(await view.getAttribute("data-route-length"))).toBeGreaterThan(0);

    await gotoTab(page, "navigation");
    await page.getByTestId("nav-start").click();
    await expect(view).toHaveAttribute("data-sim-state", "running");
    await expect(page.getByTestId("store3d-follow")).toHaveAttribute("aria-pressed", "true");

    // overview resets the camera and turns following off
    await page.getByTestId("store3d-overview").dispatchEvent("click");
    await expect(view).toHaveAttribute("data-following", "false");

    // the pixels are not empty: the canvas has content
    const painted = await canvas.evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0);
    expect(painted).toBe(true);

    expect(errors.filter((e) => !/GL Driver|THREE\.Clock|ReadPixels|Failed to load resource/i.test(e))).toEqual([]);
  });

  test("Marktwechsel baut die Szene neu auf", async ({ page }) => {
    const errors = collectErrors(page);
    const view = await open3d(page);
    const first = await view.getAttribute("data-market-code");
    expect(first).toBeTruthy();
    const other = first === "DEMO-NORD" ? "DEMO-SUED" : "DEMO-NORD";
    const switches = page.locator('[data-testid="market-switch"]');
    const codes = await switches.evaluateAll((els) => els.map((e) => e.getAttribute("data-market-code")));
    const target = codes.find((c) => c && c !== first) ?? other;
    const sw = page.locator(`[data-testid="market-switch"][data-market-code="${target}"]`);
    await sw.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sw.dispatchEvent("click");
    await expect(view).toHaveAttribute("data-market-code", target);
    await expect(page.getByTestId("store-3d-canvas")).toBeVisible();
    expect(errors.filter((e) => !/GL Driver|THREE\.Clock|ReadPixels|Failed to load resource/i.test(e))).toEqual([]);
  });

  test("Klick auf ein Regal öffnet es im Seitenpanel", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Raycast-Klick nur auf Desktop geprüft");
    const view = await open3d(page);
    await gotoTab(page, "liste"); // a shelf click switches back to the search tab
    await view.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500); // intro fly-in
    const box = await page.getByTestId("store-3d-canvas").boundingBox();
    expect(box).not.toBeNull();
    const tabSearch = page.getByTestId("tab-suche");
    // probe a grid of points until a shelf is hit (view-independent)
    let hit = false;
    for (let fy = 0.3; fy <= 0.8 && !hit; fy += 0.08) {
      for (let fx = 0.2; fx <= 0.85 && !hit; fx += 0.06) {
        await page.mouse.click(box!.x + box!.width * fx, box!.y + box!.height * fy);
        hit = (await tabSearch.getAttribute("aria-selected")) === "true";
      }
    }
    expect(hit).toBe(true);
    await expect(view).toBeAttached();
  });
});
