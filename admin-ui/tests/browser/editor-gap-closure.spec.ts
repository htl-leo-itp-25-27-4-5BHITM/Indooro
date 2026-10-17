import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LayoutDocument } from "../../src/editor/model";

const fixture = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;
const admin = { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null };

const canvas = (page: Page) => page.getByRole("group", { name: "Interaktiver Grundriss" });
const library = (page: Page, label: string) => page.locator(".le-library").getByRole("button", { name: label, exact: true });
const layerItems = (page: Page) => page.locator(".le-layers > li:not(.le-empty)");

/** Places one element of the given palette type with a single click at a relative canvas position. */
async function placeAt(page: Page, label: string, fx: number, fy: number) {
  await library(page, label).click();
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("Canvas ist nicht sichtbar");
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function newLayout(page: Page) {
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Neues Layout", exact: true }).click();
}

interface EditorOptions {
  saved?: LayoutDocument[];
}

async function mockStoreEditor(page: Page, { saved = [] }: EditorOptions = {}) {
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: admin }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }] }));
  await page.route("**/api/stores/store-1/layout/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) {
      return route.fulfill({ json: {
        store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" },
        currentLayout: { layoutId: "current-1", versionNo: 1, status: "DRAFT", layout: structuredClone(fixture) },
        assignedBeacons: [],
      } });
    }
    if (path.endsWith("/versions") && route.request().method() === "GET") {
      return route.fulfill({ json: [{ layoutId: "current-1", versionNo: 1, status: "DRAFT", layoutName: "Indooro Testfiliale" }] });
    }
    if (path.endsWith("/versions") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { activate: boolean; layout: LayoutDocument };
      saved.push(payload.layout);
      return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "DRAFT", layoutName: "Indooro Testfiliale", layout: payload.layout } });
    }
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
}

async function openStoreEditor(page: Page, options: EditorOptions = {}) {
  await mockStoreEditor(page, options);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  await expect(canvas(page)).toBeVisible();
}

test("Ebenen-Überschrift zeigt die Elementanzahl und folgt Anlegen, Löschen und Undo", async ({ page }) => {
  await openStoreEditor(page);
  await newLayout(page);
  const heading = page.getByRole("heading", { name: /^Ebenen/ });
  await expect(heading).toHaveText("Ebenen 0");

  await placeAt(page, "Regal", 0.2, 0.3);
  await expect(heading).toHaveText("Ebenen 1");
  await placeAt(page, "Theke", 0.6, 0.6);
  await expect(heading).toHaveText("Ebenen 2");

  await canvas(page).focus();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.keyboard.press("Delete");
  await expect(heading).toHaveText("Ebenen 1");

  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect(heading).toHaveText("Ebenen 2");
});

test("Globaler Editor: Beacons erhalten Indooro-IDs, sind änderbar und doppelte IDs werden geprüft", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: admin }));
  await page.route("**/api/layout/current", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: fixture });
    posted = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ json: { message: "Layout saved successfully", layoutId: "published-2", savedAt: "2026-10-11T12:00:00Z" } });
  });
  await page.route("**/api/layout/history?*", (route) => route.fulfill({ json: [] }));
  await page.goto("/admin/next/editor/");
  await expect(page.getByRole("heading", { name: "Globales Layout", exact: true })).toBeVisible();

  await newLayout(page);
  await placeAt(page, "Eingang", 0.2, 0.2);
  await placeAt(page, "Beacon", 0.5, 0.5);
  const beaconId = page.getByLabel("Beacon-ID", { exact: true });
  await expect(beaconId).toHaveValue("Indooro1");
  await placeAt(page, "Beacon", 0.7, 0.7);
  await expect(beaconId).toHaveValue("Indooro2");

  await beaconId.fill("Indooro1");
  await expect(page.locator(".le-validation")).toContainText("verwendet Indooro1 mehrfach");
  await beaconId.fill("Kasse-07");
  await expect(page.locator(".le-validation")).not.toContainText("mehrfach");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Global veröffentlichen", exact: true }).click();
  await expect(page.getByText("Globales Layout veröffentlicht.")).toBeVisible();
  expect(posted).not.toBeNull();
  const beacons = (posted!.elements as LayoutDocument["elements"]).filter((element) => element.type === "beacon").map((element) => element.beaconId);
  expect(beacons).toEqual(["Indooro1", "Kasse-07"]);
});

test("POI-Kategorie landet im Entwurf", async ({ page }) => {
  const saved: LayoutDocument[] = [];
  await openStoreEditor(page, { saved });
  await newLayout(page);
  await placeAt(page, "POI", 0.5, 0.5);
  await page.getByLabel("Kategorie", { exact: true }).fill("Obst");
  await page.getByRole("button", { name: "Entwurf speichern", exact: true }).click();
  await expect.poll(() => saved.length).toBe(1);
  const poi = saved[0].elements.find((element) => element.type === "poi");
  expect(poi?.category).toBe("Obst");
});

test("Kritische Elemente fragen beim Löschen per Entf und Inspector, POI ohne Layoutdaten nicht", async ({ page }) => {
  await openStoreEditor(page);
  const dialogs: string[] = [];
  let answer: "accept" | "dismiss" = "accept";
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void (answer === "accept" ? dialog.accept() : dialog.dismiss());
  });
  answer = "accept";
  await page.getByRole("button", { name: "Neues Layout", exact: true }).click();
  answer = "dismiss";

  const critical: Array<[string, number, number]> = [["Theke", 0.15, 0.2], ["Kühlregal", 0.45, 0.2], ["Tiefkühlregal", 0.7, 0.2]];
  for (const [label, x, y] of critical) {
    // Entf: Abbrechen behält das Element, Bestätigen entfernt es.
    await placeAt(page, label, x, y);
    await expect(layerItems(page)).toHaveCount(1);
    let before = dialogs.length;
    await canvas(page).focus();
    await page.keyboard.press("Delete");
    await expect.poll(() => dialogs.length).toBe(before + 1);
    await expect(layerItems(page)).toHaveCount(1);

    answer = "accept";
    before = dialogs.length;
    await page.keyboard.press("Delete");
    await expect.poll(() => dialogs.length).toBe(before + 1);
    await expect(layerItems(page)).toHaveCount(0);
    answer = "dismiss";

    // Inspector „Löschen“: Abbrechen behält, Bestätigen entfernt.
    await placeAt(page, label, x, y + 0.3);
    await expect(layerItems(page)).toHaveCount(1);
    before = dialogs.length;
    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect.poll(() => dialogs.length).toBe(before + 1);
    await expect(layerItems(page)).toHaveCount(1);

    answer = "accept";
    before = dialogs.length;
    await page.getByRole("button", { name: "Löschen", exact: true }).click();
    await expect.poll(() => dialogs.length).toBe(before + 1);
    await expect(layerItems(page)).toHaveCount(0);
    answer = "dismiss";
  }

  // POI ohne Layoutdaten: kein Dialog.
  const beforePoi = dialogs.length;
  await placeAt(page, "POI", 0.5, 0.6);
  await expect(layerItems(page)).toHaveCount(1);
  await canvas(page).focus();
  await page.keyboard.press("Delete");
  await expect(layerItems(page)).toHaveCount(0);
  expect(dialogs.length).toBe(beforePoi);
});

test("Canvas-Klick gibt dem Editor den Fokus: Entf wirkt nach Palettenklick ohne explizites Fokussieren", async ({ page }) => {
  await openStoreEditor(page);
  await newLayout(page);
  const heading = page.getByRole("heading", { name: /^Ebenen/ });
  await placeAt(page, "Regal", 0.4, 0.4);
  await expect(heading).toHaveText("Ebenen 1");

  // Das Erzeugen-Werkzeug bleibt nach einer Platzierung aktiv; zum Auswählen wird das Werkzeug „Auswählen“ gewählt.
  await page.locator(".le-left .le-tool-row").getByRole("button", { name: /^Auswählen/ }).click();
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("Canvas ist nicht sichtbar");
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await expect(page.getByRole("button", { name: "90° drehen", exact: true })).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.keyboard.press("Delete");
  await expect(heading).toHaveText("Ebenen 0");
});
