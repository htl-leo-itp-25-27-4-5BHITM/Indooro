import { expect, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const SAMPLES = join(here, "..", "samples");

/** Sammelt console.error und pageerror; am Testende mit expectNoErrors prüfen. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    // Artefakt der Playwright-Instrumentierung: sie injiziert Skripte in jeden Frame; die sandboxed
    // Berichtsvorschau (ohne allow-scripts, absichtlich) quittiert das mit dieser Meldung. Mit einem
    // nackten <iframe sandbox srcdoc> ohne App reproduzierbar, also kein App-Fehler.
    if (/Blocked script execution in 'about:srcdoc'/.test(m.text())) return;
    errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

export function expectNoErrors(errors: string[]) {
  expect(errors, errors.join("\n")).toEqual([]);
}

export async function gotoPage(page: Page, campaignId: string, p: string) {
  await page.goto(`/#/c/${encodeURIComponent(campaignId)}/${p}`);
}

export function campaignIdFromUrl(page: Page): string {
  const m = /#\/c\/([^/]+)/.exec(page.url());
  if (!m) throw new Error(`Keine Kampagne in URL ${page.url()}`);
  return decodeURIComponent(m[1]);
}

export async function goTo(page: Page, p: string) {
  await gotoPage(page, campaignIdFromUrl(page), p);
}

export async function loadDemo(page: Page) {
  await page.goto("/");
  await page.getByTestId("load-demo").click();
  await expect(page).toHaveURL(/#\/c\/[^/]+\/overview/);
  await expect(page.getByTestId("status-callouts")).toBeVisible();
}

export async function createCampaign(page: Page, name: string, layoutFile?: string) {
  await page.goto("/");
  await page.getByTestId("new-campaign").click();
  await page.getByTestId("campaign-name").fill(name);
  if (layoutFile) {
    await page.getByTestId("campaign-plan-source").selectOption("layout");
    await page.getByRole("dialog").getByTestId("file-input").setInputFiles(layoutFile);
    await expect(page.getByText(/Layout gelesen/)).toBeVisible();
  }
  await page.getByTestId("campaign-save").click();
  await expect(page).toHaveURL(/#\/c\/[^/]+\/overview/);
}

export async function generateSynthetic(page: Page, role: "evaluation" | "calibration" = "evaluation") {
  await goTo(page, "data");
  await page.getByTestId("synth-role").selectOption(role);
  await page.getByTestId("synth-generate").click();
  await expect(page.getByText("Synthetische Messreihe angelegt")).toBeVisible();
}

export async function noHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { sw: el.scrollWidth, cw: el.clientWidth };
  });
  expect(r.sw, `scrollWidth ${r.sw} > clientWidth ${r.cw}`).toBeLessThanOrEqual(r.cw + 1);
}
