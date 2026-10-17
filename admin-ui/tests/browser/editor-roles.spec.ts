import { expect, test, type Page } from "@playwright/test";

type Role = "admin" | "region-manager" | "store-manager";
type Json = Record<string, unknown>;
interface Profile { role: Role; label: string; me: Json }
interface Document { shopName: string; gridSize: { width: number; height: number }; elements: Json[] }
interface Version { layoutId: string; versionNo: number; layoutName: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; layout: Document }
interface Call { method: string; path: string; body: unknown }
interface StoreState { current: Version; versions: Version[]; calls: Call[]; writeStatus: number | null }

const profiles: Profile[] = [
  { role: "admin", label: "Admin", me: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } },
  {
    role: "region-manager",
    label: "Region-Manager",
    me: { subject: "region-1", username: "region-manager", email: null, role: "region-manager", scope: { regionId: "region-1", regionName: "Oberösterreich", storeId: null, storeName: null } }
  },
  {
    role: "store-manager",
    label: "Store-Manager",
    me: { subject: "manager-1", username: "store-manager", email: null, role: "store-manager", scope: { regionId: null, regionName: null, storeId: "store-1", storeName: "Indooro Linz" } }
  }
];

const store1 = { id: "store-1", storeCode: "LINZ-01", name: "Indooro Linz" };
const store2 = { id: "store-2", storeCode: "WIEN-01", name: "Indooro Wien" };

function baseDocument(shopName = "Indooro Linz"): Document {
  return {
    shopName,
    gridSize: { width: 20, height: 20 },
    elements: [
      { id: 1, type: "entrance", x: 1, y: 1, width: 2, height: 1, label: "Eingang" },
      { id: 2, type: "shelf", x: 4, y: 4, width: 4, height: 2, label: "Obst", category: "310/1" }
    ]
  };
}

function version(overrides: Pick<Version, "layoutId" | "status"> & Partial<Version>): Version {
  return { versionNo: 1, layoutName: "Indooro Linz", layout: baseDocument(), ...overrides };
}

function storeState(current: Version, versions: Version[] = [current]): StoreState {
  return { current, versions, calls: [], writeStatus: null };
}

async function mockSession(page: Page, profile: Profile) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: profile.me }));
}

/** One dispatcher per store: reads the path, records every call, and mutates the in-memory store state. */
async function mockStoreLayout(page: Page, storeId: string, store: Json, state: StoreState) {
  const base = `/api/stores/${storeId}/layout`;
  await page.route(`**${base}/**`, (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname.slice(base.length);
    state.calls.push({ method, path, body: method === "POST" ? request.postDataJSON() : undefined });

    if (path === "/editor-context") return route.fulfill({ json: { store, currentLayout: state.current, assignedBeacons: [] } });
    if (path === "/versions" && method === "GET") {
      return route.fulfill({ json: state.versions.map((item) => ({ layoutId: item.layoutId, versionNo: item.versionNo, layoutName: item.layoutName, status: item.status })) });
    }
    if (path === "/versions" && method === "POST") {
      if (state.writeStatus) return route.fulfill({ status: state.writeStatus, json: { error: "Schreibzugriff abgelehnt" } });
      const body = request.postDataJSON() as { layoutName: string; layout: Document };
      const draft: Version = {
        layoutId: `draft-${state.versions.length + 1}`,
        versionNo: state.versions.length + 1,
        layoutName: body.layoutName,
        status: "DRAFT",
        layout: body.layout
      };
      state.versions.unshift(draft);
      return route.fulfill({ json: draft });
    }
    const match = /^\/versions\/([^/]+)(\/activate)?$/.exec(path);
    if (match) {
      const target = state.versions.find((item) => item.layoutId === match[1]);
      if (!target) return route.fulfill({ status: 404, json: { error: "Nicht gefunden" } });
      if (!match[2] && method === "GET") return route.fulfill({ json: target });
      if (match[2] && method === "POST") {
        for (const item of state.versions) if (item.status === "ACTIVE") item.status = "ARCHIVED";
        target.status = "ACTIVE";
        state.current = target;
        return route.fulfill({ json: target });
      }
    }
    return route.fulfill({ status: 404, json: { error: "Nicht gefunden" } });
  });
  await page.route(`**/api/mobile/stores/${storeId}/layout/current`, (route) => {
    const active = state.versions.find((item) => item.status === "ACTIVE");
    return route.fulfill({
      json: { storeId, layoutId: active?.layoutId ?? null, source: active ? "ACTIVE" : "DEFAULT", fallback: !active, layout: active?.layout ?? baseDocument() }
    });
  });
}

for (const profile of profiles) {
  test.describe(`Layout-Editor · Rolle ${profile.label}`, () => {
    test("a) eigener Store: Entwurf speichern (activate:false), dann veröffentlichen", async ({ page }) => {
      const state = storeState(version({ layoutId: "active-1", status: "ACTIVE" }));
      await mockSession(page, profile);
      await mockStoreLayout(page, "store-1", store1, state);

      await page.goto("/admin/next/editor/?storeId=store-1");
      await expect(page.getByRole("region", { name: "Layout-Editor" })).toBeVisible();
      await page.getByRole("textbox", { name: "Filialname" }).fill(`Linz ${profile.label}`);
      await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();

      await page.getByRole("button", { name: "Entwurf speichern", exact: true }).click();
      await expect(page.locator(".le-message")).toHaveText("Entwurf gespeichert.");
      const saved = state.calls.find((call) => call.method === "POST" && call.path === "/versions");
      expect(saved?.body).toMatchObject({ activate: false, layoutName: `Linz ${profile.label}` });
      expect((saved?.body as { layout: Document }).layout.elements).toHaveLength(2);

      page.once("dialog", (dialog) => void dialog.accept());
      await expect(page.getByRole("button", { name: "Veröffentlichen", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "Veröffentlichen", exact: true }).click();
      await expect(page.locator(".le-message")).toHaveText("Layout veröffentlicht.");
      expect(state.calls.some((call) => call.method === "POST" && call.path === "/versions/draft-2/activate")).toBe(true);
      expect(state.current.status).toBe("ACTIVE");
      expect(state.current.layoutId).toBe("draft-2");
    });

    test("b) fremder Store: Zugriff verweigert, je nach Rolle client- oder serverseitig", async ({ page }) => {
      await mockSession(page, profile);

      if (profile.role === "admin") {
        // Admins have no store scope restriction: a foreign store opens normally.
        const state = storeState(version({ layoutId: "active-w", status: "ACTIVE", layout: baseDocument("Indooro Wien") }));
        await mockStoreLayout(page, "store-2", store2, state);
        await page.goto("/admin/next/editor/?storeId=store-2");
        await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
        expect(state.calls.some((call) => call.path === "/editor-context")).toBe(true);
        return;
      }

      if (profile.role === "store-manager") {
        // The candidate router checks the store scope before any editor request is made.
        let contextRequests = 0;
        await page.route("**/api/stores/store-2/layout/**", (route) => {
          contextRequests += 1;
          return route.fulfill({ status: 403, json: { error: "Forbidden" } });
        });
        await page.goto("/admin/next/editor/?storeId=store-2");
        await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
        await expect(page.getByRole("heading", { name: "Layout Editor" })).toHaveCount(0);
        expect(contextRequests).toBe(0);
        return;
      }

      // Region-Manager: the client only sees the role, not the region of a store. The API answers 403.
      const contextPaths: string[] = [];
      await page.route("**/api/stores/store-2/layout/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/editor-context")) contextPaths.push(path);
        return route.fulfill({ status: 403, json: { error: "Forbidden" } });
      });
      await page.goto("/admin/next/editor/?storeId=store-2");
      await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
      await expect(page.getByRole("alert")).toContainText("Für diese Aktion fehlen die Berechtigungen.");
      await expect(page.getByRole("button", { name: "Erneut versuchen" })).toHaveCount(0);
      expect(contextPaths).toEqual(["/api/stores/store-2/layout/editor-context"]);
    });

    test("c) globaler Modus ohne storeId: Admin sieht den Editor, andere Rollen nur Zugriff verweigert", async ({ page }) => {
      let layoutRequests = 0;
      await mockSession(page, profile);
      await page.route((url) => url.pathname.startsWith("/api/layout"), (route) => {
        layoutRequests += 1;
        if (new URL(route.request().url()).pathname === "/api/layout/history") return route.fulfill({ json: [] });
        return route.fulfill({ json: baseDocument() });
      });

      await page.goto("/admin/next/editor/");
      if (profile.role === "admin") {
        await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Global veröffentlichen", exact: true })).toBeVisible();
        expect(layoutRequests).toBeGreaterThan(0);
        return;
      }
      await expect(page.getByRole("alert")).toContainText("Zugriff verweigert");
      await expect(page.getByRole("button", { name: "Global veröffentlichen", exact: true })).toHaveCount(0);
      expect(layoutRequests).toBe(0);
    });

    test("d) verweigerte Speicherung (403) lässt Änderungen stehen und verliert nichts", async ({ page }) => {
      const state = storeState(version({ layoutId: "draft-1", status: "DRAFT" }));
      state.writeStatus = 403;
      await mockSession(page, profile);
      await mockStoreLayout(page, "store-1", store1, state);

      await page.goto("/admin/next/editor/?storeId=store-1");
      const name = page.getByRole("textbox", { name: "Filialname" });
      await name.fill("Verweigert");
      await page.getByRole("button", { name: "Entwurf speichern", exact: true }).click();

      await expect(page.locator(".le-message")).toHaveText("Für diese Aktion fehlen die Berechtigungen.");
      await expect(page.getByText("Ungespeicherte Änderungen")).toBeVisible();
      await expect(name).toHaveValue("Verweigert");
      await expect(page.getByRole("button", { name: "Veröffentlichen", exact: true })).toBeDisabled();
      expect(state.versions).toHaveLength(1);

      state.writeStatus = null;
      await page.getByRole("button", { name: "Entwurf speichern", exact: true }).click();
      await expect(page.locator(".le-message")).toHaveText("Entwurf gespeichert.");
      const saves = state.calls.filter((call) => call.method === "POST" && call.path === "/versions");
      expect(saves).toHaveLength(2);
      expect((saves[1].body as { layoutName: string }).layoutName).toBe("Verweigert");
      await expect(page.getByRole("button", { name: "Veröffentlichen", exact: true })).toBeEnabled();
    });

    test("e) historische Version: Aktivieren ohne Neuspeichern des geladenen Layouts", async ({ page }) => {
      const current = version({ layoutId: "active-2", versionNo: 2, layoutName: "Aktuelle Karte", status: "ACTIVE", layout: baseDocument("Aktuelle Karte") });
      const archived = version({ layoutId: "archived-1", versionNo: 1, layoutName: "Frühere Karte", status: "ARCHIVED", layout: baseDocument("Frühere Karte") });
      const state = storeState(current, [current, archived]);
      await mockSession(page, profile);
      await mockStoreLayout(page, "store-1", store1, state);

      await page.goto("/admin/next/editor/?storeId=store-1&layoutId=archived-1");
      await expect(page.getByRole("textbox", { name: "Filialname" })).toHaveValue("Frühere Karte");
      const restore = page.getByRole("button", { name: "Version wieder aktivieren", exact: true });
      await expect(restore).toBeEnabled();

      page.once("dialog", (dialog) => {
        expect(dialog.message()).toContain("ältere Version");
        return void dialog.accept();
      });
      await restore.click();
      await expect(page.locator(".le-message")).toHaveText("Layout veröffentlicht.");
      await expect(page.getByRole("button", { name: "Version wieder aktivieren", exact: true })).toHaveCount(0);

      expect(state.calls.some((call) => call.method === "POST" && call.path === "/versions/archived-1/activate")).toBe(true);
      expect(state.calls.filter((call) => call.method === "POST" && call.path === "/versions")).toHaveLength(0);
      expect(archived.layout.shopName).toBe("Frühere Karte");
      expect(archived.status).toBe("ACTIVE");
    });

    test("f) Tastatur: Entwurf speichern ist per Tab erreichbar, Enter speichert, Fokus bleibt im Editor", async ({ page }) => {
      const state = storeState(version({ layoutId: "active-1", status: "ACTIVE" }));
      await mockSession(page, profile);
      await mockStoreLayout(page, "store-1", store1, state);

      await page.goto("/admin/next/editor/?storeId=store-1");
      await expect(page.getByRole("region", { name: "Layout-Editor" })).toBeVisible();
      await page.getByRole("textbox", { name: "Filialname" }).fill(`Tastatur ${profile.label}`);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const save = page.getByRole("button", { name: "Entwurf speichern", exact: true });
      let reached = false;
      for (let step = 0; step < 60 && !reached; step += 1) {
        await page.keyboard.press("Tab");
        reached = await save.evaluate((node) => node === document.activeElement);
      }
      expect(reached).toBe(true);

      await page.keyboard.press("Enter");
      await expect(page.locator(".le-message")).toHaveText("Entwurf gespeichert.");
      expect(state.calls.filter((call) => call.method === "POST" && call.path === "/versions")).toHaveLength(1);

      const focus = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          tag: active?.tagName ?? null,
          insideEditor: !!active?.closest(".le"),
          visible: active instanceof HTMLElement ? active.getClientRects().length > 0 : false
        };
      });
      expect(focus.tag).not.toBe("BODY");
      expect(focus.insideEditor).toBe(true);
      expect(focus.visible).toBe(true);
    });
  });
}
