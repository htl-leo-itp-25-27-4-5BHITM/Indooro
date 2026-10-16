import { expect, test } from "@playwright/test";

test("admin diagnostics renders audit and error entries without interpreting message HTML", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } }));
  await page.route("**/api/admin/logs?*", (route) => route.fulfill({ json: { limit: 50, entries: [{ id: "a1", entityType: "STORE", action: "UPDATE", summary: "Filiale geändert", actorLabel: "Erik", createdAt: "2026-10-11T10:00:00Z" }] } }));
  await page.route("**/api/admin/error-logs?*", (route) => route.fulfill({ json: { limit: 50, entries: [
    { id: "e1", statusCode: 500, method: "GET", path: "/api/stores", message: "<img src=x onerror=alert(1)>", stackTrace: "Trace line", createdAt: "2026-10-11T10:00:00Z" },
    { id: "e2", statusCode: 400, method: "POST", path: "/api/products", message: "Validation failed", errorType: "InputError", stackTrace: null, createdAt: "2026-10-11T10:01:00Z" }
  ] } }));
  await page.goto("/admin/next/server-logs/");
  await expect(page.getByRole("region", { name: "Änderungsverlauf" })).toContainText("Filiale geändert");
  await expect(page.getByRole("region", { name: "Serverfehler" })).toContainText("<img src=x onerror=alert(1)>");
  await expect(page.getByRole("region", { name: "Serverfehler" }).locator("img")).toHaveCount(0);
  await page.getByText("Stacktrace", { exact: true }).click();
  await expect(page.getByText("Trace line")).toBeVisible();
  const noTrace = page.getByRole("region", { name: "Serverfehler" }).getByRole("row").filter({ hasText: "Validation failed" });
  await noTrace.getByText("Details").focus();
  await page.keyboard.press("Enter");
  await expect(noTrace.locator("pre")).toContainText('"errorType": "InputError"');
});

test("region manager direct diagnostics link sends no log requests", async ({ page }) => {
  let logRequests = 0;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "region-1", username: "manager", role: "region-manager", scope: { regionId: "region-1" } } }));
  await page.route("**/api/admin/*logs?*", (route) => { logRequests += 1; return route.fulfill({ json: { entries: [] } }); });
  await page.goto("/admin/next/server-logs/");
  await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
  expect(logRequests).toBe(0);
});

test("empty diagnostics show both empty states and refresh with the keyboard", async ({ page }) => {
  let auditCalls = 0;
  let errorCalls = 0;
  let unexpectedApiCalls = 0;
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/api/admin/me")) return route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } });
    if (url.endsWith("/api/admin/logs?limit=50")) { auditCalls += 1; return route.fulfill({ json: { limit: 50, entries: [] } }); }
    if (url.endsWith("/api/admin/error-logs?limit=50")) { errorCalls += 1; return route.fulfill({ json: { limit: 50, entries: [] } }); }
    unexpectedApiCalls += 1;
    return route.fulfill({ status: 500, json: { error: "Unexpected API request" } });
  });
  await page.goto("/admin/next/server-logs/");
  await expect(page.getByRole("region", { name: "Änderungsverlauf" })).toContainText("Keine Änderungen protokolliert.");
  await expect(page.getByRole("region", { name: "Serverfehler" })).toContainText("Keine Serverfehler protokolliert.");
  const refresh = page.getByRole("button", { name: "Aktualisieren" });
  for (let step = 0; step < 20 && !(await refresh.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press("Tab");
  await expect(refresh).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Änderungsverlauf" })).toContainText("0 Einträge");
  expect(auditCalls).toBe(2);
  expect(errorCalls).toBe(2);
  expect(unexpectedApiCalls).toBe(0);
});

test("diagnostics load error can retry both endpoints successfully", async ({ page }) => {
  let auditCalls = 0;
  let errorCalls = 0;
  let unexpectedApiCalls = 0;
  await page.route("**/api/**", (route) => {
    const url = route.request().url();
    if (url.endsWith("/api/admin/me")) return route.fulfill({ json: { subject: "admin-1", username: "admin", role: "admin", scope: null } });
    if (url.endsWith("/api/admin/logs?limit=50")) {
      auditCalls += 1;
      return auditCalls === 1 ? route.fulfill({ status: 503, json: { error: "Audit nicht verfügbar" } }) : route.fulfill({ json: { limit: 50, entries: [{ id: "a2", entityType: "PRODUCT", action: "CREATE", summary: "Produkt erstellt", actorLabel: "Admin", createdAt: "2026-10-11T10:00:00Z" }] } });
    }
    if (url.endsWith("/api/admin/error-logs?limit=50")) { errorCalls += 1; return route.fulfill({ json: { limit: 50, entries: [] } }); }
    unexpectedApiCalls += 1;
    return route.fulfill({ status: 500, json: { error: "Unexpected API request" } });
  });
  await page.goto("/admin/next/server-logs/");
  await expect(page.getByRole("alert")).toContainText("Diagnose nicht verfügbar");
  await page.getByRole("button", { name: "Erneut versuchen" }).click();
  await expect(page.getByRole("region", { name: "Änderungsverlauf" })).toContainText("Produkt erstellt");
  await expect(page.getByRole("region", { name: "Serverfehler" })).toContainText("Keine Serverfehler protokolliert.");
  expect(auditCalls).toBe(2);
  expect(errorCalls).toBe(2);
  expect(unexpectedApiCalls).toBe(0);
});
