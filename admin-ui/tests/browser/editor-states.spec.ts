import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

type Json = Record<string, unknown>;

test.use({ viewport: { width: 1280, height: 800 } });

const evidenceDir = fileURLToPath(new URL("../../../docs/admin-rebuild/evidence/editor-states/", import.meta.url));
// Evidence PNGs are regenerated on demand: EDITOR_EVIDENCE_CAPTURE=1 npx playwright test tests/browser/editor-states.spec.ts
const captureEvidence = process.env.EDITOR_EVIDENCE_CAPTURE === "1";
if (captureEvidence) mkdirSync(evidenceDir, { recursive: true });

async function capture(page: Page, name: string) {
  if (!captureEvidence) return;
  await page.screenshot({ path: join(evidenceDir, `${name}.png`) });
}

const store = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz" };
const admin = { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null };

function validLayout(): Json {
  return {
    shopName: "Indooro Linz",
    gridSize: { width: 20, height: 20 },
    elements: [
      { id: 1, type: "entrance", x: 1, y: 1, width: 2, height: 1, label: "Eingang" },
      { id: 2, type: "shelf", x: 4, y: 4, width: 4, height: 2, label: "Obst", category: "310/1" }
    ]
  };
}

function gate() {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
}

interface StoreOptions {
  layoutId?: string | null;
  status?: "DEFAULT" | "DRAFT" | "ACTIVE";
  layout?: Json;
}
interface StoreControl {
  contextStatus: number | null;
  versionsStatus: number | null;
  writeStatus: number | null;
  writeMessage: string | null;
  contextGate: Promise<void> | null;
  attempts: Json[];
  activations: string[];
}

function storeControl(): StoreControl {
  return { contextStatus: null, versionsStatus: null, writeStatus: null, writeMessage: null, contextGate: null, attempts: [], activations: [] };
}

/** Store editor API for store-1. Every failure mode is switched through the control object. */
async function mockStore(page: Page, options: StoreOptions, control: StoreControl) {
  const layoutId = options.layoutId === undefined ? "active-1" : options.layoutId;
  let status: string = options.status ?? "ACTIVE";
  const layout: Json = options.layout ?? validLayout();
  const versionList = () => (status === "DEFAULT" || !layoutId ? [] : [{ layoutId, versionNo: 1, layoutName: "Indooro Linz", status }]);

  await page.route("**/api/stores/store-1/layout/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.replace("/api/stores/store-1/layout", "");

    if (path === "/editor-context") {
      if (control.contextGate) await control.contextGate.promise;
      if (control.contextStatus) return route.fulfill({ status: control.contextStatus, json: { error: "Unavailable" } });
      return route.fulfill({ json: { store, currentLayout: { layoutId, versionNo: layoutId ? 1 : null, status, layout }, assignedBeacons: [] } });
    }
    if (path === "/versions" && method === "GET") {
      if (control.versionsStatus) return route.fulfill({ status: control.versionsStatus, json: { error: "Unavailable" } });
      return route.fulfill({ json: versionList() });
    }
    if (path === "/versions" && method === "POST") {
      const body = request.postDataJSON() as { layoutName: string; layout: Json };
      control.attempts.push(body);
      if (control.writeStatus) return route.fulfill({ status: control.writeStatus, json: control.writeMessage ? { error: control.writeMessage } : { error: "Unavailable" } });
      return route.fulfill({ json: { layoutId: "draft-2", versionNo: 2, status: "DRAFT", layoutName: body.layoutName, layout: body.layout } });
    }
    if (path.endsWith("/activate") && method === "POST") {
      const target = path.replace("/versions/", "").replace("/activate", "");
      control.activations.push(target);
      status = "ACTIVE";
      return route.fulfill({ json: { layoutId: target, versionNo: 1, status: "ACTIVE", layout } });
    }
    if (method === "GET" && path === `/versions/${layoutId}`) return route.fulfill({ json: { layoutId, versionNo: 1, layoutName: "Indooro Linz", status, layout } });
    return route.fulfill({ status: 404, json: { error: "Nicht gefunden" } });
  });
  await page.route("**/api/mobile/stores/store-1/layout/current", (route) => route.fulfill({
    json: { storeId: "store-1", layoutId: status === "ACTIVE" ? layoutId : null, source: status === "ACTIVE" ? "ACTIVE" : "DEFAULT", fallback: status !== "ACTIVE", layout: validLayout() }
  }));
}

interface GlobalControl {
  currentStatus: number | null;
  historyStatus: number | null;
  publishStatus: number | null;
  publishMessage: string | null;
  currentGate: Promise<void> | null;
  layout: Json;
  attempts: Json[];
}

function globalControl(layout: Json = validLayout()): GlobalControl {
  return { currentStatus: null, historyStatus: null, publishStatus: null, publishMessage: null, currentGate: null, layout, attempts: [] };
}

async function mockGlobal(page: Page, control: GlobalControl) {
  await page.route("**/api/layout/current", async (route) => {
    if (route.request().method() === "GET") {
      if (control.currentGate) await control.currentGate.promise;
      if (control.currentStatus) return route.fulfill({ status: control.currentStatus, json: { error: "Unavailable" } });
      return route.fulfill({ json: control.layout });
    }
    const body = route.request().postDataJSON() as Json;
    control.attempts.push(body);
    if (control.publishStatus) return route.fulfill({ status: control.publishStatus, json: control.publishMessage ? { error: control.publishMessage } : { error: "Unavailable" } });
    control.layout = body;
    return route.fulfill({ json: { message: "Layout saved", layoutId: "published-2", savedAt: "2026-10-17T10:00:00Z" } });
  });
  await page.route((url) => url.pathname === "/api/layout/history", (route) => control.historyStatus
    ? route.fulfill({ status: control.historyStatus, json: { error: "Unavailable" } })
    : route.fulfill({ json: [] }));
}

async function mockAdmin(page: Page) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: admin }));
}

test.describe("Filial-Editor Zustände", () => {
  test("Laden: Hinweis wird angezeigt, bis der Editor geantwortet hat", async ({ page }) => {
    await mockAdmin(page);
    const control = storeControl();
    control.contextGate = gate();
    await mockStore(page, {}, control);

    await page.goto("/admin/next/editor/?storeId=store-1");
    await expect(page.getByText("Layout-Editor wird geladen …")).toBeVisible();
    await capture(page, "filial-loading");

    control.contextGate.open();
    await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  });

  test("Leer ohne aktives Layout: Fehler statt Keine-Probleme, Veröffentlichen gesperrt", async ({ page }) => {
    await mockAdmin(page);
    await mockStore(page, { layoutId: null, status: "DEFAULT", layout: { shopName: "Indooro Linz", gridSize: { width: 20, height: 20 }, elements: [] } }, storeControl());

    await page.goto("/admin/next/editor/?storeId=store-1");
    await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
    await expect(page.locator(".editor-route-header")).toContainText("Vorlage");
    await expect(page.getByText("Der Grundriss enthält keine Elemente.")).toBeVisible();
    await expect(page.getByText("Keine Probleme gefunden.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Veröffentlichen", exact: true })).toBeDisabled();
    await capture(page, "filial-empty-default");
  });

  test("Validierungsfehler: fehlender Eingang blockiert Veröffentlichen", async ({ page }) => {
    await mockAdmin(page);
    const layout = validLayout();
    layout.elements = (layout.elements as Json[]).filter((element) => element.type !== "entrance");
    await mockStore(page, { layoutId: "draft-1", status: "DRAFT", layout }, storeControl());

    await page.goto("/admin/next/editor/?storeId=store-1&layoutId=draft-1");
    await expect(page.getByText("Ein Eingang ist für die Navigation erforderlich.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Veröffentlichen", exact: true })).toBeDisabled();
    await capture(page, "filial-validation-no-entrance");
  });

  test("Konflikt (409) beim Entwurf-Speichern: verständliche Meldung, Änderungen bleiben", async ({ page }) => {
    await mockAdmin(page);
    const control = storeControl();
    control.writeStatus = 409;
    control.writeMessage = "Das Layout wurde inzwischen von jemand anderem geändert. Bitte neu laden.";
    await mockStore(page, {}, control);

    await page.goto("/admin/next/editor/?storeId=store-1");
    const name = page.getByRole("textbox", { name: "Filialname" });
    await name.fill("Konflikt Linz");
    await page.getByRole("button", { name: "Entwurf speichern", exact: true }).click();
    await expect(page.locator(".le-message")).toHaveText("Das Layout wurde inzwischen von jemand anderem geändert. Bitte neu laden.");
    await expect(page.locator(".le-save-indicator")).toHaveText("● Ungespeicherte Änderungen");
    await expect(name).toHaveValue("Konflikt Linz");
    await capture(page, "filial-conflict-409");
  });

  test("Ladefehler 503: Serverfehler mit Erneut versuchen, danach lädt der Editor", async ({ page }) => {
    await mockAdmin(page);
    const control = storeControl();
    control.contextStatus = 503;
    await mockStore(page, {}, control);

    await page.goto("/admin/next/editor/?storeId=store-1");
    await expect(page.getByRole("alert")).toContainText("Serverfehler");
    await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    await capture(page, "filial-load-error-503");

    control.contextStatus = null;
    await page.getByRole("button", { name: "Erneut versuchen" }).click();
    await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  });

  test("Versionsliste 503: Hinweis mit erneutem Laden, Editor bleibt nutzbar", async ({ page }) => {
    await mockAdmin(page);
    const control = storeControl();
    control.versionsStatus = 503;
    await mockStore(page, {}, control);

    await page.goto("/admin/next/editor/?storeId=store-1");
    await expect(page.getByRole("alert")).toContainText("Versionsliste nicht verfügbar");
    await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Versionen erneut laden" })).toBeVisible();
    await capture(page, "filial-versions-error-503");

    control.versionsStatus = null;
    await page.getByRole("button", { name: "Versionen erneut laden" }).click();
    await expect(page.getByRole("link", { name: "Öffnen", exact: true })).toBeVisible();
  });

  test("Erfolg: Entwurf gespeichert", async ({ page }) => {
    await mockAdmin(page);
    const control = storeControl();
    await mockStore(page, {}, control);

    await page.goto("/admin/next/editor/?storeId=store-1");
    await page.getByRole("textbox", { name: "Filialname" }).fill("Entwurf Linz");
    await page.getByRole("button", { name: "Entwurf speichern", exact: true }).click();
    await expect(page.locator(".le-message")).toHaveText("Entwurf gespeichert.");
    await expect(page.locator(".le-save-indicator")).toHaveText("✓ Gespeichert");
    await expect(page).toHaveURL(/layoutId=draft-2/);
    expect(control.attempts[0]).toMatchObject({ layoutName: "Entwurf Linz" });
    await capture(page, "filial-draft-saved");
  });

  test("Erfolg: Layout veröffentlicht", async ({ page }) => {
    await mockAdmin(page);
    const control = storeControl();
    await mockStore(page, { layoutId: "draft-1", status: "DRAFT" }, control);

    await page.goto("/admin/next/editor/?storeId=store-1&layoutId=draft-1");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Veröffentlichen", exact: true }).click();
    await expect(page.locator(".le-message")).toHaveText("Layout veröffentlicht.");
    expect(control.activations).toEqual(["draft-1"]);
    await capture(page, "filial-published");
  });

  test("Ungespeicherte Änderungen: Indikator, und Neuladen fragt nach (beforeunload)", async ({ page }) => {
    await mockAdmin(page);
    await mockStore(page, {}, storeControl());

    await page.goto("/admin/next/editor/?storeId=store-1");
    const name = page.getByRole("textbox", { name: "Filialname" });
    await name.click();
    await name.press("End");
    await page.keyboard.type(" (ungespeichert)");
    await expect(page.locator(".le-save-indicator")).toHaveText("● Ungespeicherte Änderungen");
    await capture(page, "filial-unsaved-changes");

    let beforeUnloadDialogs = 0;
    page.on("dialog", (dialog) => {
      if (dialog.type() === "beforeunload") beforeUnloadDialogs += 1;
      void dialog.accept();
    });
    await page.reload();
    expect(beforeUnloadDialogs).toBe(1);

    // Nach dem Neuladen ist nichts mehr ungespeichert: kein Dialog mehr.
    await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
    await page.reload();
    expect(beforeUnloadDialogs).toBe(1);
  });

  test("Ungültige Layout-Daten: Fehlermeldung statt Editor", async ({ page }) => {
    await mockAdmin(page);
    await mockStore(page, { layout: { shopName: "Kaputt", gridSize: { width: 20, height: 20 } } }, storeControl());

    await page.goto("/admin/next/editor/?storeId=store-1");
    await expect(page.getByRole("alert")).toContainText("Layout-Daten sind unvollständig.");
    await expect(page.getByRole("heading", { name: "Editor konnte nicht geladen werden" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    await capture(page, "filial-invalid-layout");
  });

  test("Ungültiger JSON-Import: Meldung, Dokument bleibt unverändert", async ({ page }) => {
    await mockAdmin(page);
    await mockStore(page, {}, storeControl());

    await page.goto("/admin/next/editor/?storeId=store-1");
    const name = page.getByRole("textbox", { name: "Filialname" });
    const importInput = page.getByLabel("Grundrissdatei importieren");

    await importInput.setInputFiles({ name: "kaputt.json", mimeType: "application/json", buffer: Buffer.from("{ kaputt") });
    await expect(page.locator(".le-message")).toContainText("Import fehlgeschlagen");
    await expect(name).toHaveValue("Indooro Linz");
    await expect(page.locator(".le-save-indicator")).toHaveText("✓ Gespeichert");

    await importInput.setInputFiles({ name: "ohne-raster.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ shopName: "X", gridSize: { width: 0, height: 20 }, elements: [] })) });
    await expect(page.locator(".le-message")).toHaveText("Import fehlgeschlagen: Filialname oder Rastergröße sind ungültig.");
    await expect(name).toHaveValue("Indooro Linz");
    await expect(page.locator(".le-save-indicator")).toHaveText("✓ Gespeichert");
    await capture(page, "filial-import-failed");
  });
});

test.describe("Globaler Editor Zustände", () => {
  test("Laden: Hinweis wird angezeigt, bis das globale Layout da ist", async ({ page }) => {
    await mockAdmin(page);
    const control = globalControl();
    control.currentGate = gate();
    await mockGlobal(page, control);

    await page.goto("/admin/next/editor/");
    await expect(page.getByText("Globales Layout wird geladen …")).toBeVisible();
    await capture(page, "global-loading");

    control.currentGate.open();
    await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
  });

  test("Leeres globales Layout: Fehler, Veröffentlichen gesperrt", async ({ page }) => {
    await mockAdmin(page);
    await mockGlobal(page, globalControl({ shopName: "Leer", gridSize: { width: 20, height: 20 }, elements: [] }));

    await page.goto("/admin/next/editor/");
    await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
    await expect(page.getByText("Der Grundriss enthält keine Elemente.")).toBeVisible();
    await expect(page.getByText("Keine Probleme gefunden.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Global veröffentlichen", exact: true })).toHaveAttribute("aria-disabled", "true");
    await capture(page, "global-empty");
  });

  test("Ladefehler 503: Serverfehler mit Erneut versuchen, danach lädt der Editor", async ({ page }) => {
    await mockAdmin(page);
    const control = globalControl();
    control.currentStatus = 503;
    await mockGlobal(page, control);

    await page.goto("/admin/next/editor/");
    await expect(page.getByRole("alert")).toContainText("Serverfehler");
    await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
    await capture(page, "global-load-error-503");

    control.currentStatus = null;
    await page.getByRole("button", { name: "Erneut versuchen" }).click();
    await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
  });

  test("Historie 503: Hinweis mit erneutem Laden, Editor bleibt nutzbar", async ({ page }) => {
    await mockAdmin(page);
    const control = globalControl();
    control.historyStatus = 503;
    await mockGlobal(page, control);

    await page.goto("/admin/next/editor/");
    const history = page.getByRole("region", { name: "Globale Layout-Historie" });
    await expect(history.getByRole("alert")).toContainText("Serverfehler");
    await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
    await capture(page, "global-history-error-503");

    control.historyStatus = null;
    await history.getByRole("button", { name: "Historie erneut laden" }).click();
    await expect(history.getByText("Noch keine gespeicherten Versionen.")).toBeVisible();
  });

  test("Erfolg: Globales Layout veröffentlicht", async ({ page }) => {
    await mockAdmin(page);
    const control = globalControl();
    await mockGlobal(page, control);

    await page.goto("/admin/next/editor/");
    await page.getByRole("textbox", { name: "Filialname" }).fill("Global Neu");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Global veröffentlichen", exact: true }).click();
    await expect(page.locator(".le-message")).toHaveText("Globales Layout veröffentlicht.");
    expect(control.attempts[0]).toMatchObject({ shopName: "Global Neu" });
    await capture(page, "global-published");
  });

  test("Konflikt (409) beim Veröffentlichen: Meldung, Änderungen bleiben", async ({ page }) => {
    await mockAdmin(page);
    const control = globalControl();
    control.publishStatus = 409;
    control.publishMessage = "Das globale Layout wurde inzwischen von jemand anderem geändert.";
    await mockGlobal(page, control);

    await page.goto("/admin/next/editor/");
    const name = page.getByRole("textbox", { name: "Filialname" });
    await name.fill("Konflikt Global");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Global veröffentlichen", exact: true }).click();
    await expect(page.locator(".le-message")).toHaveText("Das globale Layout wurde inzwischen von jemand anderem geändert.");
    await expect(page.locator(".le-save-indicator")).toHaveText("● Ungespeicherte Änderungen");
    await expect(name).toHaveValue("Konflikt Global");
    await capture(page, "global-conflict-409");
  });

  test("Ungespeicherte Änderungen: Indikator, und Neuladen fragt nach (beforeunload)", async ({ page }) => {
    await mockAdmin(page);
    await mockGlobal(page, globalControl());

    await page.goto("/admin/next/editor/");
    const name = page.getByRole("textbox", { name: "Filialname" });
    await name.click();
    await name.press("End");
    await page.keyboard.type(" (ungespeichert)");
    await expect(page.locator(".le-save-indicator")).toHaveText("● Ungespeicherte Änderungen");
    await capture(page, "global-unsaved-changes");

    let beforeUnloadDialogs = 0;
    page.on("dialog", (dialog) => {
      if (dialog.type() === "beforeunload") beforeUnloadDialogs += 1;
      void dialog.accept();
    });
    await page.reload();
    expect(beforeUnloadDialogs).toBe(1);
  });

  test("Ungültige Layout-Daten: Fehlermeldung statt Editor", async ({ page }) => {
    await mockAdmin(page);
    await mockGlobal(page, globalControl({ shopName: "Kaputt", gridSize: { width: 20, height: 20 } }));

    await page.goto("/admin/next/editor/");
    await expect(page.getByRole("alert")).toContainText("Globales Layout enthält kein gültiges Raster und keine Elementliste.");
    await expect(page.getByRole("heading", { name: "Globales Layout nicht verfügbar" })).toBeVisible();
    await capture(page, "global-invalid-layout");
  });

  test("Ungültiger JSON-Import: Meldung, Dokument bleibt unverändert", async ({ page }) => {
    await mockAdmin(page);
    await mockGlobal(page, globalControl());

    await page.goto("/admin/next/editor/");
    const name = page.getByRole("textbox", { name: "Filialname" });
    await page.getByLabel("Grundrissdatei importieren").setInputFiles({ name: "kaputt.json", mimeType: "application/json", buffer: Buffer.from("[1, 2") });
    await expect(page.locator(".le-message")).toContainText("Import fehlgeschlagen");
    await expect(name).toHaveValue("Indooro Linz");
    await expect(page.locator(".le-save-indicator")).toHaveText("✓ Gespeichert");
    await capture(page, "global-import-failed");
  });
});
