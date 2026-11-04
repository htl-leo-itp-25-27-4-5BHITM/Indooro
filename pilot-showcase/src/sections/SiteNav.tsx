import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button, Container, Logo } from "../components/ui";
import { useActiveSection } from "../lib";

const LINKS = [
  { id: "demo", label: "Demo" },
  { id: "so-funktionierts", label: "So funktioniert’s" },
  { id: "betreiber", label: "Für Betreiber" },
  { id: "projektstand", label: "Projektstand" },
  { id: "pilot", label: "Pilot" }
] as const;

const SECTION_IDS = ["top", "problem", ...LINKS.map((l) => l.id)];

/** Sticky navigation: transparent over the hero, frosted glass after scroll. Mobile gets a full-screen sheet. */
export function SiteNav() {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const active = useActiveSection(SECTION_IDS);
  const sheetRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Body scroll lock, Esc to close, lightweight focus trap while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = sheetRef.current?.querySelector<HTMLElement>("a,button");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab" && sheetRef.current) {
        const items = [buttonRef.current, ...Array.from(sheetRef.current.querySelectorAll<HTMLElement>("a,button"))].filter(Boolean) as HTMLElement[];
        const idx = items.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && idx <= 0) {
          e.preventDefault();
          items[items.length - 1].focus();
        } else if (!e.shiftKey && idx === items.length - 1) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 1024) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  const solid = scrolled || open;

  return (
    <header
      className={`on-dark fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-500 ease-out-expo ${
        solid ? "bg-ink-950/75 shadow-[inset_0_-1px_0_rgb(255_255_255/0.08)] backdrop-blur-xl backdrop-saturate-150" : "bg-transparent shadow-[inset_0_-1px_0_transparent]"
      }`}
    >
      <Container className="relative z-[60] flex h-16 items-center justify-between gap-4">
        <a href="#top" aria-label="Indooro – zum Seitenanfang" className="rounded-lg" onClick={() => open && close(false)}>
          <Logo size={28} />
        </a>

        <nav aria-label="Hauptnavigation" className="hidden items-center lg:flex">
          <LayoutGroup id="nav-pill">
            <ul className="flex items-center gap-1">
              {LINKS.map((l) => {
                const isActive = active === l.id;
                return (
                  <li key={l.id}>
                    <a
                      href={`#${l.id}`}
                      data-testid={`nav-link-${l.id}`}
                      aria-current={isActive ? "true" : undefined}
                      className={`relative block rounded-full px-3.5 py-2 text-[13.5px] font-medium tracking-[-0.005em] transition-colors duration-300 ${isActive ? "text-white" : "text-ink-200 hover:text-white"}`}
                    >
                      {isActive ? (
                        <motion.span
                          layoutId="nav-active-pill"
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-white/10 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
                          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                        />
                      ) : null}
                      <span className="relative">{l.label}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </LayoutGroup>
        </nav>

        <div className="flex items-center gap-2">
          <Button href="#pilot" size="md" variant="primary" data-testid="nav-cta" className="hidden !min-h-10 sm:inline-flex" icon={<ArrowRight className="size-4" />}>
            Pilotpartner werden
          </Button>
          <button
            ref={buttonRef}
            type="button"
            data-testid="nav-menu-button"
            aria-label={open ? "Menü schließen" : "Menü öffnen"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-full text-white transition-colors hover:bg-white/10 lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </Container>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-menu"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-[55] flex flex-col overflow-y-auto bg-ink-950/95 px-5 pb-8 pt-24 backdrop-blur-2xl scrollbar-dark lg:hidden"
          >
            <div aria-hidden className="pointer-events-none absolute -right-32 -top-24 size-[28rem] rounded-full bg-mint/10 blur-3xl" />
            <ul className="relative flex flex-col">
              {LINKS.map((l, i) => (
                <motion.li
                  key={l.id}
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.05 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                >
                  <a
                    href={`#${l.id}`}
                    data-testid={`nav-sheet-link-${l.id}`}
                    onClick={() => close(false)}
                    className={`flex min-h-14 items-center justify-between border-b border-white/8 py-3 text-[1.65rem] font-semibold tracking-[-0.03em] ${active === l.id ? "text-mint" : "text-white"}`}
                  >
                    {l.label}
                    <ArrowRight className="size-5 text-ink-300" aria-hidden />
                  </a>
                </motion.li>
              ))}
            </ul>
            <div className="relative mt-auto pt-10">
              <Button href="#pilot" size="lg" variant="primary" className="w-full" onClick={() => close(false)} data-testid="nav-sheet-cta">
                Pilotpartner werden
              </Button>
              <p className="mt-4 text-center text-xs text-ink-300">Pilotprojekt der HTL Leonding · Linz</p>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
