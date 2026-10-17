import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { computeCoverage, coverageRule, type CoverageInput } from "../../src/editor/coverage";
import { formatCoverageSummary } from "../../src/editor/coverageView";
import type { LayoutDocument } from "../../src/editor/model";
import { parsePlanCsv, planToElements } from "../../src/editor/planImport";

const fixture = JSON.parse(readFileSync(new URL("../../src/editor/fixtures/store-layout.json", import.meta.url), "utf8")) as LayoutDocument;
const uuid = "123e4567-e89b-12d3-a456-426614174000";
const assignedBeacons = [
  { beaconCode: "IN-001", beaconId: "beacon-db-1", identityKey: `${uuid}:1:2`, uuid, major: 1, minor: 2 },
  { beaconCode: "IN-002", beaconId: "beacon-db-2", identityKey: `${uuid}:1:3`, uuid, major: 1, minor: 3 },
];
// Positions inside the fixture grid (40 x 60), away from the existing beacon at (6, 6).
const planCsv = [
  "minor,x_m,y_m,mount,notes",
  "1,10.00,10.00,wall,\"Eingang, links\"",
  "2,14.50,12.00,shelf-top,Obst",
  "3,30.00,40.00,checkout-top,Kasse",
  "",
].join("\r\n");
const planned = planToElements(fixture, parsePlanCsv(planCsv).beacons).elements;
const withPlan: LayoutDocument = { ...fixture, elements: [...fixture.elements, ...planned] };

/** Summary text computed with the same shared modules as the editor. */
function summaryText(layout: LayoutDocument) {
  const result = computeCoverage(layout as CoverageInput, coverageRule.radiusMeters, coverageRule.minBeaconsPerCell);
  return formatCoverageSummary(result.summary, coverageRule.minBeaconsPerCell);
}
const percentOf = (text: string) => Number((/([\d.,]+) % der Fläche/.exec(text)?.[1] ?? "NaN").replace(",", "."));

async function openEditor(page: Page) {
  const saved: LayoutDocument[] = [];
  await page.route("**/api/admin/me", (route) => route.fulfill({ json: { subject: "admin-1", username: "admin", email: null, role: "admin", scope: null } }));
  await page.route("**/api/categories?*", (route) => route.fulfill({ json: [{ categoryCode: 310, categoryName: "Obst & Gemüse" }] }));
  await page.route("**/api/stores/store-1/layout/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/editor-context")) {
      return route.fulfill({ json: { store: { id: "store-1", storeCode: "LINZ-1", name: "Indooro Testfiliale" }, currentLayout: { layoutId: "current-1", versionNo: 1, status: "DRAFT", layout: fixture }, assignedBeacons } });
    }
    if (path.endsWith("/versions") && route.request().method() === "GET") {
      return route.fulfill({ json: [{ layoutId: "current-1", versionNo: 1, status: "DRAFT", layoutName: fixture.shopName }] });
    }
    if (path.endsWith("/versions") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as { activate: boolean; layout: LayoutDocument };
      expect(payload.activate).toBe(false);
      saved.push(payload.layout);
      return route.fulfill({ json: { layoutId: `draft-${saved.length}`, versionNo: saved.length + 1, status: "DRAFT", layoutName: payload.layout.shopName, layout: payload.layout } });
    }
    return route.fulfill({ status: 404, json: { message: "Unexpected editor route" } });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/next/editor/?storeId=store-1");
  await expect(page.getByRole("heading", { name: "Layout Editor" })).toBeVisible();
  return saved;
}

const toggle = (page: Page) => page.getByRole("checkbox", { name: "Beacon-Abdeckung anzeigen" });
const summary = (page: Page) => page.locator(".le-coverage-summary");
const indicator = (page: Page) => page.locator(".le-save-indicator");
const layers = (page: Page) => page.locator(".le-layers li");
const fileInput = (page: Page) => page.getByLabel("Beacon-Plan (beacons-plan.csv) importieren");
const planErrors = (page: Page) => page.locator(".le-plan-errors");
const upload = (page: Page, text: string) => fileInput(page).setInputFiles({ name: "beacons-plan.csv", mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });

test("the button opens the file picker, a confirmed plan adds placeholder beacons as one undo step", async ({ page }) => {
  await openEditor(page);
  await toggle(page).check();
  await expect(summary(page)).toContainText(summaryText(fixture));
  const before = percentOf(await summary(page).textContent() ?? "");
  await expect(layers(page)).toHaveCount(fixture.elements.length);

  const dialogs: string[] = [];
  page.once("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.accept();
  });
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Vorschlag übernehmen (CSV)" }).click(),
  ]);
  await chooser.setFiles({ name: "beacons-plan.csv", mimeType: "text/csv", buffer: Buffer.from(planCsv, "utf8") });

  await expect(layers(page)).toHaveCount(fixture.elements.length + 3);
  expect(dialogs).toEqual(["3 Beacons aus dem Vorschlag hinzufügen? Platzhalter-Identitäten: sie müssen später echten Beacons zugeordnet werden. Rückgängig ist möglich."]);
  await expect(page.getByRole("status").filter({ hasText: "3 Beacons übernommen. Bitte Zuordnung zu echten Beacons prüfen und speichern." })).toBeVisible();
  await expect(summary(page)).toContainText(summaryText(withPlan));
  expect(percentOf(await summary(page).textContent() ?? "")).toBeGreaterThan(before);
  await expect(indicator(page)).toHaveText("● Ungespeicherte Änderungen");

  // One Ctrl+Z removes all three imported beacons.
  await page.getByRole("group", { name: "Interaktiver Grundriss" }).focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(layers(page)).toHaveCount(fixture.elements.length);
  await expect(summary(page)).toContainText(summaryText(fixture));
  await expect(indicator(page)).toHaveText("✓ Gespeichert");
});

test("the planned beacons are saved as a draft, and publishing stays blocked until they are assigned", async ({ page }) => {
  const saved = await openEditor(page);
  page.once("dialog", (dialog) => void dialog.accept());
  await upload(page, planCsv);
  await expect(layers(page)).toHaveCount(fixture.elements.length + 3);

  await page.getByRole("button", { name: "Entwurf speichern" }).click();
  await expect(page.getByText("Entwurf gespeichert.")).toBeVisible();
  expect(saved).toHaveLength(1);
  const savedBeacons = saved[0].elements.filter((element) => element.beaconId?.startsWith("Indooro"));
  expect(savedBeacons.map((element) => element.beaconId)).toEqual(["Indooro1", "Indooro2", "Indooro3"]);

  await expect(page.getByRole("button", { name: "Veröffentlichen", exact: true })).toBeDisabled();
  await expect(page.locator(".le-validation")).toContainText("gehört nicht zu dieser Filiale");
});

test("an invalid CSV shows the German errors, asks nothing and imports nothing", async ({ page }) => {
  await openEditor(page);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await upload(page, "minor,x_m,y_m,mount,notes\n1,10,10,wall,\n2,-1,4,wall,\n");
  await expect(planErrors(page)).toContainText("Import nicht übernommen");
  await expect(planErrors(page)).toContainText("Zeile 3: x_m darf nicht negativ sein.");
  expect(dialogs).toEqual([]);
  await expect(layers(page)).toHaveCount(fixture.elements.length);
  await expect(indicator(page)).toHaveText("✓ Gespeichert");
});

test("cancelling the confirmation imports nothing", async ({ page }) => {
  await openEditor(page);
  const dialogs: string[] = [];
  page.once("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await upload(page, planCsv);
  await expect.poll(() => dialogs.length).toBe(1);
  await expect(layers(page)).toHaveCount(fixture.elements.length);
  await expect(indicator(page)).toHaveText("✓ Gespeichert");
  await expect(planErrors(page)).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "übernommen" })).toHaveCount(0);
});
