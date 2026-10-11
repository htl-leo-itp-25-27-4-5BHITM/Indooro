import { expect, test } from "@playwright/test";

test("admin diagnostics renders audit and error entries without interpreting message HTML", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/admin/logs?*", (route) => route.fulfill({ json: { limit: 50, entries: [{ id: "a1", entityType: "STORE", action: "UPDATE", summary: "Filiale geändert", actorLabel: "Erik", createdAt: "2026-10-11T10:00:00Z" }] } }));
  await page.route("**/api/admin/error-logs?*", (route) => route.fulfill({ json: { limit: 50, entries: [{ id: "e1", statusCode: 500, method: "GET", path: "/api/stores", message: "<img src=x onerror=alert(1)>", stackTrace: "Trace line", createdAt: "2026-10-11T10:00:00Z" }] } }));
  await page.goto("/admin/next/server-logs/");
  await expect(page.getByRole("region", { name: "Änderungsverlauf" })).toContainText("Filiale geändert");
  await expect(page.getByRole("region", { name: "Serverfehler" })).toContainText("<img src=x onerror=alert(1)>");
  await expect(page.getByRole("region", { name: "Serverfehler" }).locator("img")).toHaveCount(0);
  await page.getByText("Stacktrace").click();
  await expect(page.getByText("Trace line")).toBeVisible();
});

test("region manager direct diagnostics link sends no log requests", async ({ page }) => {
  let logRequests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1" } } }));
  await page.route("**/api/admin/*logs?*", (route) => { logRequests += 1; return route.fulfill({ json: { entries: [] } }); });
  await page.goto("/admin/next/server-logs/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(logRequests).toBe(0);
});
