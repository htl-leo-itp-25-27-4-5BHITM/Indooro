import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { SAMPLES, collectErrors, createCampaign, expectNoErrors, goTo, loadDemo } from "./helpers";

test.describe("Import-Assistent", () => {
  test("CSV (Langformat): Zuordnung, Vorschau, Prüfung, Übernahme, Laufliste", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "data");
    const before = await page.getByTestId("run-card").count();

    await page.getByTestId("import-wizard").getByTestId("file-input").setInputFiles(join(SAMPLES, "synthetic-example-long-format.csv"));
    await expect(page.getByTestId("detected-format")).toContainText(/CSV/i);
    // Vorschau + automatische Zuordnung über Synonyme
    const preview = page.getByTestId("import-preview");
    await expect(preview).toContainText("LAB-B08");
    await expect(preview).toContainText("Signal");
    await expect(page.getByTestId("map-rssi")).toHaveValue("Signal");
    await expect(page.getByTestId("map-beaconId")).toHaveValue("Beacon");
    await expect(page.getByTestId("map-t")).toHaveValue("Zeit");
    await expect(page.getByTestId("import-accept")).toHaveCount(0); // vor der Prüfung nicht verfügbar

    await page.getByTestId("import-name").fill("E2E Import CSV");
    await page.getByTestId("import-origin").selectOption("synthetic");
    await page.getByTestId("import-check").click();

    const result = page.getByTestId("import-result");
    await expect(result).toBeVisible();
    await expect(page.getByText("Import kann übernommen werden")).toBeVisible();
    await expect(page.getByTestId("import-counts")).toContainText(/\d+ Messwerte/);
    await expect(page.getByTestId("import-counts")).toContainText(/Referenzpunkte/);
    await expect(page.getByTestId("import-transformations")).toContainText(/Dezimalkomma|Komma/i);
    const accept = page.getByTestId("import-accept");
    await expect(accept).toBeEnabled();
    await accept.click();

    await expect(page.getByText("Messreihe übernommen")).toBeVisible();
    await expect(page.getByTestId("run-card")).toHaveCount(before + 1);
    const card = page.getByTestId("run-card").filter({ hasText: "E2E Import CSV" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("SYNTHETISCH");
    await card.getByTestId("run-toggle").click();
    await expect(card.getByTestId("run-details")).toContainText("Datenqualität");
    expectNoErrors(errors);
  });

  test("Indooro-Aufnahme (.jsonl) in Kampagne mit importiertem Layout", async ({ page }) => {
    const errors = collectErrors(page);
    await createCampaign(page, "E2E Testraum", join(SAMPLES, "layout-synthetic-testraum.json"));
    await expect(page.getByTestId("synthetic-banner")).toBeVisible(); // Layoutname enthält SYNTHETISCH
    await goTo(page, "data");
    await page.getByTestId("import-wizard").getByTestId("file-input").setInputFiles(join(SAMPLES, "synthetic-indooro-recording.jsonl"));
    await expect(page.getByTestId("detected-format")).toContainText(/Indooro|Aufnahme|JSONL/i);
    await expect(page.getByText(/keine Zuordnung nötig/)).toBeVisible();
    await page.getByTestId("import-name").fill("E2E Aufnahme");
    await page.getByTestId("import-origin").selectOption("synthetic");
    await page.getByTestId("import-check").click();
    await expect(page.getByText("Import kann übernommen werden")).toBeVisible();
    await expect(page.getByTestId("import-counts")).toContainText(/\d+ Messwerte/);
    // keine unbekannten Beacons: das Layout passt zur Aufnahme
    await expect(page.getByText("Unbekannte Beacon-IDs")).toHaveCount(0);
    await page.getByTestId("import-accept").click();

    const card = page.getByTestId("run-card").filter({ hasText: "E2E Aufnahme" });
    await expect(card).toBeVisible();
    // als synthetisch gekennzeichnet; Auswertbarkeit wird ausgewiesen (Badge)
    await expect(card).toContainText("SYNTHETISCH");
    await expect(card).toContainText(/auswertbar|nicht auswertbar/);
    await card.getByTestId("run-toggle").click();
    await expect(card.getByTestId("run-details")).toContainText("Indooro1");
    expectNoErrors(errors);
  });

  test("Negativ: CSV ohne rssi-Spalte blockiert die Übernahme", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "data");
    const csv = "Zeit;Beacon;Gerät\n0,1;LAB-B01;x\n0,2;LAB-B02;x\n";
    await page.getByTestId("import-wizard").getByTestId("file-input").setInputFiles({ name: "kaputt-ohne-rssi.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByTestId("import-preview")).toBeVisible();
    await expect(page.getByTestId("map-rssi")).toHaveValue("");
    await expect(page.getByRole("alert").filter({ hasText: "Pflichtfelder fehlen" })).toBeVisible();
    await expect(page.getByTestId("import-check")).toBeDisabled();
    await expect(page.getByTestId("import-accept")).toHaveCount(0);
    expectNoErrors(errors);
  });

  test("Negativ: ungültige Werte zeigen Fehler, 'übernehmen' bleibt gesperrt", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "data");
    const before = await page.getByTestId("run-card").count();
    const csv = "time,beacon,rssi\nabc,LAB-B01,xyz\nfoo,LAB-B02,bar\n,LAB-B03,\n";
    await page.getByTestId("import-wizard").getByTestId("file-input").setInputFiles({ name: "kaputt-werte.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await page.getByTestId("import-check").click();
    await expect(page.getByTestId("import-result")).toBeVisible();
    await expect(page.getByText("Import enthält blockierende Fehler")).toBeVisible();
    await expect(page.getByTestId("import-counts")).toContainText("0 Messwerte");
    await expect(page.getByTestId("import-accept")).toBeDisabled();
    await expect(page.getByTestId("run-card")).toHaveCount(before);
    expectNoErrors(errors);
  });

  test("Negativ: nicht unterstützte Dateiendung wird abgewiesen", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "data");
    await page.getByTestId("import-wizard").getByTestId("file-input").setInputFiles({ name: "notizen.txt", mimeType: "text/plain", buffer: Buffer.from("hallo") });
    await expect(page.getByTestId("import-check")).toHaveCount(0);
    await expect(page.getByTestId("import-wizard")).toContainText("notizen.txt");
    expectNoErrors(errors);
  });
});
