import { ArrowUpRight } from "lucide-react";
import { Container, Divider, Logo } from "../components/ui";

const TEAM = ["Erik Bergmair", "Michael Stelzmüller", "Fabian Joos", "Niilo Rieser", "David Berghahn"];
const REPO = "https://github.com/htl-leo-itp-25-27-4-5BHITM/Indooro";
const APP = "https://it220209.cloud.htl-leonding.ac.at/";

export function SiteFooter() {
  return (
    <footer id="footer" className="on-dark relative overflow-hidden bg-ink-950 pb-10 pt-16 text-ink-200 sm:pt-20">
      <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(99_230_180/0.08),transparent)]" />
      <Container className="relative">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Logo size={32} />
            <p className="text-pretty mt-5 max-w-sm text-[15px] leading-relaxed text-ink-200">Indooro führt Kundinnen und Kunden im Supermarkt direkt zum Produkt – per Suche, Einkaufsliste und Route.</p>
          </div>

          <div className="grid gap-10 sm:grid-cols-2 lg:col-span-7">
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-300">Team</h2>
              <ul className="mt-4 space-y-2 text-[15px] text-ink-100">
                {TEAM.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-4 text-[13px] leading-relaxed text-ink-300">HTL Leonding · Abteilung Informationstechnologie</p>
            </div>
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-300">Links</h2>
              <ul className="mt-4 space-y-2 text-[15px]">
                {[
                  ["Öffentliche App", APP],
                  ["Quellcode auf GitHub", REPO]
                ].map(([label, href]) => (
                  <li key={href}>
                    <a href={href} target="_blank" rel="noreferrer noopener" className="group inline-flex min-h-8 items-center gap-1.5 text-ink-100 underline decoration-white/20 underline-offset-4 transition-colors hover:text-mint hover:decoration-mint/60">
                      {label}
                      <ArrowUpRight className="size-3.5 text-ink-300 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-mint" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <Divider onDark className="mt-14" />
        <div className="mt-6 flex flex-col gap-3 text-[13px] leading-relaxed text-ink-300 sm:flex-row sm:items-start sm:justify-between">
          <p className="max-w-2xl">Alle Märkte, Produkte und Positionen in dieser Demonstration sind fiktiv. Die Positionsbestimmung ist simuliert.</p>
          <p className="shrink-0">© 2026 Indooro · HTL Leonding</p>
        </div>
      </Container>
    </footer>
  );
}
