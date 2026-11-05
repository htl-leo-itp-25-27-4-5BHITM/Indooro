import { expect, test, type Page } from "@playwright/test";
import { collectErrors, createCampaign, expectNoErrors, generateSynthetic, goTo, loadDemo } from "./helpers";

/** Hilfsfunktion: Zahl aus einem Text (deutsches/englisches Format) lesen. */
function num(text: string): number {
  const m = /-?\d+(?:[.,]\d+)?/.exec(text.replace(/\s/g, ""));
  return m ? Number(m[0].replace(",", ".")) : NaN;
}

async function selectRunByName(page: Page, selectId: string, part: string) {
  const opt = page.locator(`#${selectId} option`, { hasText: part }).first();
  await page.locator(`#${selectId}`).selectOption({ value: (await opt.getAttribute("value"))! });
}

async function computePositioning(page: Page, algorithm?: string) {
  await goTo(page, "positioning");
  if (algorithm) await page.locator("#pos-algorithm").selectOption(algorithm);
  await page.getByTestId("compute").click();
  await expect(page.getByTestId("result-view")).toBeVisible();
}

test.describe("Workflow: Kampagne bis Bericht", () => {
  test("1 Neue Messkampagne mit fiktivem Demo-Markt anlegen", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Messkampagnen" })).toBeVisible();
    await page.getByTestId("new-campaign").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // ohne Name: Speichern gesperrt
    await expect(page.getByTestId("campaign-save")).toBeDisabled();
    await page.getByTestId("campaign-name").fill("E2E Pilotmarkt");
    await expect(page.getByText("Der Demo-Markt ist fiktiv")).toBeVisible();
    await page.getByTestId("campaign-save").click();
    await expect(page).toHaveURL(/#\/c\/[^/]+\/overview/);
    await expect(page.getByRole("heading", { name: "E2E Pilotmarkt" })).toBeVisible();
    await expect(page.getByTestId("synthetic-banner")).toContainText("SYNTHETISCH");
    await page.goto("/");
    await expect(page.getByTestId("campaign-list")).toContainText("E2E Pilotmarkt");
    expectNoErrors(errors);
  });

  test("2 Synthetische Daten erzeugen und Demo-Kampagne laden", async ({ page }) => {
    const errors = collectErrors(page);
    await createCampaign(page, "E2E Synthese");
    await goTo(page, "data");
    await expect(page.getByText("Noch keine Messreihen").first()).toBeVisible();
    await generateSynthetic(page, "evaluation");
    await generateSynthetic(page, "calibration");
    await expect(page.getByTestId("run-card")).toHaveCount(2);
    await expect(page.getByTestId("run-list")).toContainText("Evaluation");
    await expect(page.getByTestId("run-list")).toContainText("Kalibrierung");
    await expect(page.getByTestId("run-list").getByText("SYNTHETISCH").first()).toBeVisible();

    // Demo-Kampagne separat
    await loadDemo(page);
    await goTo(page, "data");
    await expect(page.getByTestId("run-card")).toHaveCount(6);
    expectNoErrors(errors);
  });

  test("4+5+6 RSSI: Beacon wählen, Statistik, Filterwirkung (EMA)", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "signals");
    const select = page.getByTestId("signals-beacon-select");
    const options = await select.locator("option").evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.value));
    const beacon = options.find((v) => v !== "__all__" && v !== "") ?? options[1];
    await select.selectOption(beacon);

    const stats = page.getByTestId("signals-stats");
    await expect(stats).toBeVisible();
    const tiles = stats.getByTestId("stat-value");
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < count; i++) {
      const t = (await tiles.nth(i).innerText()).trim();
      expect(t, `Kachel ${i}`).not.toBe("");
      expect(t).not.toBe("NaN");
    }
    expect(num(await tiles.nth(0).innerText())).toBeGreaterThan(10); // n

    const effect = page.getByTestId("signals-filter-effect");
    await expect(effect).toContainText("Standardabweichung gefiltert");
    // Voreinstellung der Seite ist EMA; zuerst "kein Filter" wählen, dann wieder EMA
    await page.getByTestId("sig-filter-kind").selectOption("none");
    await expect(page.getByText("Kein Filter aktiv")).toBeVisible();
    const before = await effect.innerText();
    await page.getByTestId("sig-filter-kind").selectOption("ema");
    await expect(page.getByTestId("sig-alpha")).toBeVisible();
    await page.getByLabel("α").fill("0.2");
    await expect(page.getByText("Kennzahlen für den gewählten Beacon")).toBeVisible();
    const after = await effect.innerText();
    expect(after).not.toBe(before);
    // geglättetes Signal hat kleinere Streuung als roh
    const rows = await effect.locator("tr").allInnerTexts();
    const raw = num(rows.find((r) => r.startsWith("Standardabweichung roh"))!.split("\t").pop()!);
    const filt = num(rows.find((r) => r.includes("gefiltert") && r.includes("Standardabweichung"))!.split("\t").pop()!);
    expect(filt).toBeLessThan(raw);
    await expect(page.getByTestId("signals-original-note")).toContainText("unverändert");
    expectNoErrors(errors);
  });

  test("7+8 Positionierung: Algorithmus wählen, Fehlerstatistik, LE-Einheit, Warnung", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await computePositioning(page, "weighted-centroid");

    const grid = page.getByTestId("metrics-grid");
    await expect(grid).toBeVisible();
    const values = grid.getByTestId("stat-value");
    const n = await values.count();
    expect(n).toBeGreaterThanOrEqual(13);
    for (let i = 0; i < n; i++) {
      const t = (await values.nth(i).innerText()).trim();
      expect(t, `Metrik ${i}`).toMatch(/^-?\d+(?:[.,]\d+)?$/);
    }
    // Einheit LE (Maßstab unbestätigt)
    await expect(grid).toContainText("LE");
    await expect(grid).not.toContainText(/\bm\b\s*$/m);
    // Fehlschläge sichtbar
    await expect(grid.getByText("Fehlschläge", { exact: false }).first()).toBeVisible();
    await expect(grid).toContainText("Ausfallrate");
    // Synthetik-Warnung
    await expect(page.getByTestId("result-view")).toContainText(/synthetisch/i);
    await expect(page.getByTestId("config-hash")).not.toBeEmpty();
    await expect(page.getByTestId("dynamic-grid")).toBeVisible();

    // Algorithmuswechsel macht Ergebnis veraltet
    await page.locator("#pos-algorithm").selectOption("strongest-beacon");
    await expect(page.getByText("Einstellungen geändert")).toBeVisible();
    expectNoErrors(errors);
  });

  test("9 Heatmaps: Punkte und IDW mit Ehrlichkeitshinweis", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "heatmaps");
    await expect(page.getByTestId("heatmaps-page")).toBeVisible();
    await expect(page.getByTestId("heatmap-mode")).toHaveValue("points");
    await expect(page.getByTestId("heatmap-mode-text")).toContainText("Nichts wird interpoliert");
    await expect(page.getByTestId("layer-heatmap")).toHaveAttribute("data-mode", "points");
    await expect(page.getByTestId("heatmap-summary")).toContainText("Messposition");
    await expect(page.getByTestId("heatmap-legend")).toBeVisible();

    await page.getByTestId("heatmap-mode").selectOption("idw");
    await expect(page.getByTestId("heatmap-mode-text")).toContainText("INTERPOLIERT");
    await expect(page.getByTestId("layer-heatmap")).toHaveAttribute("data-mode", "idw");
    await expect(page.getByTestId("heatmap-legend")).toContainText(/interpoliert/i);

    await page.getByTestId("heatmap-mode").selectOption("binned");
    await expect(page.getByTestId("heatmap-mode-text")).toContainText("Rasterzellen");
    expectNoErrors(errors);
  });

  test("10 Replay: Play, Pause, Schritt vor – Zeitanzeige ändert sich", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "replay");
    await expect(page.getByTestId("replay")).toBeVisible();
    const time = page.getByTestId("replay-time");
    const epoch = page.getByTestId("replay-epoch");
    const t0 = await time.innerText();
    const e0 = await epoch.innerText();
    await page.getByRole("button", { name: "Abspielen" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(time).not.toHaveText(t0, { timeout: 15_000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Abspielen" })).toBeVisible();
    const tPaused = await time.innerText();
    await page.waitForTimeout(600);
    await expect(time).toHaveText(tPaused); // steht still
    const ePaused = await epoch.innerText();
    await page.getByRole("button", { name: "Eine Epoche vor" }).click();
    await expect(epoch).not.toHaveText(ePaused);
    expect(await epoch.innerText()).not.toBe(e0);
    await expect(time).not.toHaveText(tPaused);
    await expect(page.getByTestId("replay-error")).toBeVisible();
    expectNoErrors(errors);
  });

  test("11 Algorithmusvergleich: Tabellen mit allen Konfigurationen", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "compare");
    const configs = page.getByTestId("compare-config-list").locator("li");
    const initial = await configs.count();
    expect(initial).toBeGreaterThanOrEqual(2);
    await page.getByTestId("compare-add").click();
    await expect(configs).toHaveCount(initial + 1);
    await page.getByTestId("compare-run").click();
    await expect(page.getByTestId("compare-results")).toBeVisible();
    const total = initial + 1;
    await expect(page.getByTestId("compare-metrics-table").locator("tbody tr")).toHaveCount(total);
    await expect(page.getByTestId("compare-common-table").locator("tbody tr")).toHaveCount(total);
    await expect(page.getByText(/Gemeinsame Epochenmenge \(n = \d+\)/)).toBeVisible();
    await expect(page.getByTestId("compare-metrics-table")).toContainText("Fehlschläge");
    await expect(page.getByTestId("compare-map")).toBeVisible();
    // Speichern aller Ergebnisse
    await page.getByTestId("compare-save-all").click();
    await expect(page.getByTestId("compare-saved")).toContainText(`${total} Ergebnisse gespeichert`);
    expectNoErrors(errors);
  });

  test("12 Bericht: Ergebnis speichern, Vorschau, HTML- und JSON-Export", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "report");
    await expect(page.getByText("Noch keine gespeicherten Ergebnisse")).toBeVisible();

    await computePositioning(page, "weighted-centroid");
    const hash = (await page.getByTestId("config-hash").innerText()).trim();
    await page.getByTestId("result-label").fill("E2E Gewichteter Schwerpunkt");
    await page.getByTestId("save-result").click();
    await expect(page.getByTestId("saved-msg")).toContainText("E2E Gewichteter Schwerpunkt");

    await goTo(page, "report");
    const checks = page.getByTestId("result-check");
    await expect(checks).toHaveCount(1);
    if (!(await checks.first().isChecked())) await checks.first().check();
    await page.getByTestId("interpretation").fill("E2E-Interpretation des Teams.");

    const preview = page.getByTestId("report-preview");
    await expect(preview.locator("iframe")).toBeVisible();
    // srcdoc direkt lesen: Playwright-Zugriffe in den sandboxed iframe lösen sonst selbst console.error aus
    const srcdoc = (await preview.locator("iframe").getAttribute("srcdoc")) ?? "";
    expect(srcdoc).toContain("SYNTHETISCH");
    expect(srcdoc).toContain(hash);
    expect(srcdoc).toContain("E2E-Interpretation des Teams.");
    expect(srcdoc).toMatch(/Median/);
    expect(srcdoc).toMatch(/\d+[.,]\d{2}/);
    expect(srcdoc).not.toContain("<script");

    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "HTML herunterladen" }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.html$/);

    const [dlJson] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-results-json").click()]);
    expect(dlJson.suggestedFilename()).toMatch(/^ergebnisse-.*\.json$/);
    const [dlCsv] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-results-csv").click()]);
    expect(dlCsv.suggestedFilename()).toMatch(/\.csv$/);
    expectNoErrors(errors);
  });

  test("Kalibrierung: Fit mit Maximaldistanz, Kampagnenmodell übernehmen", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "calibration");
    await expect(page.getByTestId("calibration-current-source")).toContainText(/Standard|nicht kalibriert|default/i);
    const runs = page.getByTestId("calibration-run-list").locator("input[type=checkbox]");
    expect(await runs.count()).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < (await runs.count()); i++) await runs.nth(i).check();
    await page.getByLabel("Maximale Kalibrierdistanz").fill("12");
    await page.getByTestId("calibration-run").click();
    await expect(page.getByTestId("calibration-result")).toBeVisible();
    await expect(page.getByTestId("calibration-result")).toContainText("Exponent n");
    await expect(page.getByTestId("calibration-warning").first()).toBeVisible(); // Maßstab nicht bestätigt
    await page.getByTestId("calibration-apply-campaign").click();
    await expect(page.getByTestId("calibration-status")).toContainText("Kampagnenmodell gesetzt");
    await expect(page.getByTestId("calibration-current-source")).toContainText(/kalibriert|gefittet/i);
    await goTo(page, "overview");
    await expect(page.getByTestId("status-callouts")).toContainText("Pfadverlustmodell: kalibriert");
    expectNoErrors(errors);
  });

  test("Datenleck-Schutz: Kalibrierungslauf wird nicht ausgewertet", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    // Positionierung bietet Kalibrierungsläufe nicht an
    await goTo(page, "positioning");
    const posOptions = await page.locator("#pos-run option").allInnerTexts();
    expect(posOptions.length).toBeGreaterThan(0);
    expect(posOptions.some((o) => o.includes("Kalibrierung"))).toBe(false);
    // Vergleich ebenso
    await goTo(page, "compare");
    expect((await page.locator("#compare-run option").allInnerTexts()).some((o) => o.includes("Kalibrierung"))).toBe(false);
    // Replay: wählbar, aber Fehler statt stiller Berechnung
    await goTo(page, "replay");
    await selectRunByName(page, "replay-run", "Kalibrierung A");
    await expect(page.getByTestId("replay-page-error")).toBeVisible();
    await expect(page.getByTestId("replay")).toHaveCount(0);
    expectNoErrors(errors);
  });

  test("Maßstab bestätigen verlangt eine Prüfnotiz", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "plan");
    // Beacon in der Karte wählen ist Teil des Plans; Maßstab-Karte:
    const card = page.getByTestId("scale-card");
    await expect(card).toContainText("Maßstab nicht bestätigt");
    await card.getByRole("switch").or(card.getByRole("checkbox")).first().click();
    await page.getByTestId("scale-save").click();
    await expect(page.getByTestId("scale-error")).toBeVisible();
    await page.getByTestId("scale-note").fill("Regal 4: 10,0 m gemessen = 10 LE (E2E)");
    await page.getByTestId("scale-save").click();
    await expect(page.getByTestId("scale-error")).toHaveCount(0);
    await expect(card).not.toContainText("Solange er nicht bestätigt ist");
    // danach Meter statt LE
    await computePositioning(page, "weighted-centroid");
    await expect(page.getByTestId("metrics-grid")).not.toContainText("LE");
    await goTo(page, "overview");
    await expect(page.getByTestId("status-callouts")).not.toContainText("Maßstab nicht bestätigt");
    expectNoErrors(errors);
  });

  test("Plan: Beacon in der Karte auswählen", async ({ page }) => {
    const errors = collectErrors(page);
    await loadDemo(page);
    await goTo(page, "plan");
    await expect(page.getByTestId("floorplan-svg")).toBeVisible();
    await expect(page.getByTestId("layer-beacons")).toBeVisible();
    await page.locator("[data-beacon-id]").first().dispatchEvent("click");
    await expect(page.getByTestId("selected-beacon")).toContainText("Ausgewählt");
    expectNoErrors(errors);
  });
});
