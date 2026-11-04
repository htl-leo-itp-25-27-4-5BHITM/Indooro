import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { collectErrors, gotoTab, openDemo } from "./helpers";

const TOTAL = 17;

async function waitStep(page: Page, id: string) {
  await expect(page.getByTestId("tour-card")).toHaveAttribute("data-step", id);
}

async function startFromNav(page: Page) {
  await page.goto("/?ansicht=2d");
  await expect(page.getByTestId("store-demo")).toBeAttached();
  await page.getByTestId("nav-tour").click();
  await expect(page.getByTestId("tour-overlay")).toBeVisible();
  await expect(page.getByTestId("tour-card")).toBeVisible();
}

test.describe("Geführte Tour", () => {
  test.setTimeout(90_000);
  test("startet über den Nav-Button und führt durch alle Schritte", async ({ page }) => {
    const errors = collectErrors(page);
    await startFromNav(page);
    await expect(page.getByTestId("tour-step")).toContainText(`Schritt 1 von ${TOTAL}`);
    await expect(page.getByTestId("tour-prev")).toBeDisabled();

    // Willkommen, Problem, Demo-Markt, Suche, Treffer
    for (const id of ["willkommen", "problem", "demo-markt", "demo-suche"]) {
      await waitStep(page, id);
      await page.getByTestId("tour-next").click();
    }
    await waitStep(page, "demo-treffer");
    await expect(page.getByTestId("search-input")).toHaveValue("Paradeiser");
    await expect(page.getByTestId("search-result").first()).toBeVisible();
    await page.getByTestId("tour-next").click();

    // Liste: Tomaten werden hinzugefügt
    await waitStep(page, "demo-liste");
    await expect(page.getByTestId("tab-badge")).toHaveText("1", { timeout: 6000 });
    await page.getByTestId("tour-next").click();

    // Beispielliste
    await waitStep(page, "demo-beispiel");
    await expect(page.getByTestId("tab-badge")).toHaveText("7", { timeout: 6000 });
    await page.getByTestId("tour-next").click();

    // Route
    await waitStep(page, "demo-route");
    await expect(page.getByTestId("route-path").first()).toBeAttached({ timeout: 6000 });
    await page.getByTestId("tour-next").click();

    // Simulierte Navigation läuft
    await waitStep(page, "demo-simulation");
    await expect(page.getByTestId("nav-pause")).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId("position-marker")).toBeAttached();
    await page.getByTestId("tour-next").click();

    // Marktbezogene Suche
    await waitStep(page, "demo-markt-suche");
    await expect(page.getByTestId("search-empty")).toBeVisible({ timeout: 6000 });
    await expect(page.getByTestId("search-input")).toHaveValue("Hafermilch");
    await page.getByTestId("tour-next").click();

    // So funktioniert's, Betreiber
    await waitStep(page, "so-funktionierts");
    await page.getByTestId("tour-next").click();
    await waitStep(page, "betreiber-intro");
    await page.getByTestId("tour-next").click();
    await waitStep(page, "betreiber-demo");
    await expect(page.getByTestId("operator-autoplay")).toHaveAttribute("aria-pressed", "true", { timeout: 4000 });
    await page.getByTestId("tour-next").click();

    for (const id of ["projektstand", "pilot-ablauf", "pilot-kontakt"]) {
      await waitStep(page, id);
      await page.getByTestId("tour-next").click();
    }
    await waitStep(page, "ende");
    await expect(page.getByTestId("tour-step")).toContainText(`Schritt ${TOTAL} von ${TOTAL}`);
    await expect(page.getByTestId("tour-cta")).toHaveText(/Erstgespräch vereinbaren/);

    await page.getByTestId("tour-cta").click();
    await expect(page.getByTestId("tour-overlay")).toHaveCount(0);
    await expect(page.locator("#kontakt")).toBeInViewport({ timeout: 6000 });
    // Operator-Autoplay wurde beendet, Navigation pausiert
    await expect(page.getByTestId("operator-autoplay")).toHaveAttribute("aria-pressed", "false");
    expect(errors).toEqual([]);
  });

  test("Zurück funktioniert und stellt den Demo-Zustand wieder her", async ({ page }) => {
    await startFromNav(page);
    await page.getByTestId("tour-step").waitFor();
    for (let i = 0; i < 7; i++) await page.getByTestId("tour-next").click();
    await waitStep(page, "demo-route");
    await page.getByTestId("tour-prev").click();
    await waitStep(page, "demo-beispiel");
    await page.getByTestId("tour-prev").click();
    await waitStep(page, "demo-liste");
    await expect(page.getByTestId("tab-badge")).toHaveText("1", { timeout: 6000 });
  });

  test("Esc beendet die Tour und pausiert die Simulation", async ({ page }) => {
    await startFromNav(page);
    for (let i = 0; i < 8; i++) await page.getByTestId("tour-next").click();
    await waitStep(page, "demo-simulation");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("tour-overlay")).toHaveCount(0);
  });

  test("Pfeiltasten wechseln die Schritte", async ({ page }) => {
    await startFromNav(page);
    await page.keyboard.press("ArrowRight");
    await waitStep(page, "problem");
    await page.keyboard.press("ArrowLeft");
    await waitStep(page, "willkommen");
  });

  test("Tour beenden über den Schließen-Button", async ({ page }) => {
    await startFromNav(page);
    await page.getByTestId("tour-close").click();
    await expect(page.getByTestId("tour-overlay")).toHaveCount(0);
  });

  test("?tour=1 startet automatisch", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?tour=1&ansicht=2d");
    await expect(page.getByTestId("tour-card")).toBeVisible({ timeout: 6000 });
    await waitStep(page, "willkommen");
    expect(errors).toEqual([]);
  });

  test("Launcher erscheint nach dem Hero und startet die Tour", async ({ page }) => {
    await page.goto("/?ansicht=2d");
    await expect(page.getByTestId("tour-launcher")).toHaveCount(0);
    await page.locator("#problem").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.5, behavior: "instant" }));
    await page.getByTestId("tour-launcher").click();
    await expect(page.getByTestId("tour-card")).toBeVisible();
    await expect(page.getByTestId("tour-launcher")).toHaveCount(0);
  });

  test("Präsentationsmodus blendet die Navigation aus", async ({ page }) => {
    await startFromNav(page);
    await page.getByTestId("tour-presentation").click();
    await expect(page.getByTestId("nav-tour")).toBeHidden();
    await page.getByTestId("tour-presentation").click();
    await expect(page.getByTestId("nav-tour")).toBeVisible();
  });

  test("Demo-Hinweise zeigen den Fortschritt", async ({ page }) => {
    await openDemo(page);
    await expect(page.getByTestId("demo-hint-2")).toHaveAttribute("data-done", "false");
    await gotoTab(page, "liste");
    await page.getByTestId("load-example").first().click();
    await expect(page.getByTestId("demo-hint-2")).toHaveAttribute("data-done", "true");
  });

  test("Als-Nächstes-Karten verlinken auf das nächste Kapitel", async ({ page }) => {
    await page.goto("/?ansicht=2d");
    const links = await page.getByTestId("next-chapter").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    expect(links).toEqual(["#demo", "#so-funktionierts", "#projektstand", "#pilot"]);
  });

  test("Kapitelleiste (Desktop) springt zum Kapitel", async ({ page }, info) => {
    test.skip(info.project.name === "mobile", "Kapitelleiste nur ab xl");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?ansicht=2d");
    await page.getByTestId("rail-betreiber").click();
    await expect(page.locator("#betreiber")).toBeInViewport();
  });
});
