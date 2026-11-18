import { expect, test } from "@playwright/test";

test.describe("Pilot-Bereich und Ehrlichkeit", () => {
  test("zeigt fünf Pilotschritte", async ({ page }) => {
    await page.goto("/");
    const steps = page.getByTestId("pilot-steps").locator("> li");
    await expect(steps).toHaveCount(5);
    await expect(steps.first()).toContainText("Erstgespräch");
    await expect(steps.last()).toContainText("Gemeinsame Auswertung");
  });

  test("FAQ-Akkordeon klappt auf und zu", async ({ page }) => {
    await page.goto("/");
    const q0 = page.getByTestId("pilot-faq-q-0");
    const q1 = page.getByTestId("pilot-faq-q-1");
    await q1.scrollIntoViewIfNeeded();
    await expect(q0).toHaveAttribute("aria-expanded", "true");
    await q1.click();
    await expect(q1).toHaveAttribute("aria-expanded", "true");
    await expect(q0).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("region", { name: /personenbezogene Daten/ })).toBeVisible();
    await q1.click();
    await expect(q1).toHaveAttribute("aria-expanded", "false");
  });

  test("Kontaktkarte und Anker #kontakt existieren", async ({ page }) => {
    await page.goto("/#kontakt");
    await expect(page.locator("#kontakt")).toHaveCount(1);
    await expect(page.getByTestId("contact-card")).toBeVisible();
    await expect(page.getByTestId("contact-card")).toBeInViewport({ ratio: 0.3 });
  });

  test("keine unzulässigen Behauptungen im Seitentext", async ({ page }) => {
    await page.goto("/");
    const text = await page.evaluate(() => document.body.innerText);
    expect(text.length).toBeGreaterThan(2000);

    const forbidden: Array<[string, RegExp]> = [
      ["App Store (außer Verneinung)", /(?<!nicht (im|in dem) )app\s?store/i],
      ["Google Play", /google\s?play|play\s?store/i],
      ["cm genau", /\bcm[-\s]?genau|zentimeter[-\s]?genau/i],
      ["Genauigkeit von <Zahl>", /genauigkeit\s+(von|bis)\s+(ca\.?\s*)?\d/i],
      ["garantiert", /garantier/i],
      ["Umsatz in Prozent", /(umsatz\w*[^.\n]{0,40}\d\s?%|\d\s?%[^.\n]{0,40}umsatz)/i],
      ["Zeitersparnis in Prozent", /(zeitersparnis|schneller|weniger zeit)[^.\n]{0,30}\d\s?%/i],
      ["echte Handelsketten", /\b(spar|billa|hofer|lidl|penny|merkur|interspar|aldi|rewe|edeka)\b/i],
      ["Kundenzitate/Testimonials", /testimonial|kundenstimme/i]
    ];
    for (const [label, re] of forbidden) {
      expect(text.match(re), `Verbotene Aussage gefunden: ${label}`).toBeNull();
    }
  });

  test("Honesty-Kennzeichnung: Demo-Märkte sind als fiktiv markiert", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Fiktiver Demomarkt").first()).toBeAttached();
    await expect(page.getByText("keine Messung").first()).toBeAttached();
  });
});
