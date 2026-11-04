import { useActiveSection } from "../../lib";
import { CHAPTER_IDS, PAGE_CHAPTERS } from "./chapters";
import { useTour } from "./store";

/** Fixed vertical chapter navigation on wide screens (xl+). */
export function ChapterRail() {
  const active = useActiveSection(CHAPTER_IDS);
  const { active: touring, presentation } = useTour();
  if (touring || presentation) return null;
  return (
    <nav aria-label="Kapitel" data-testid="chapter-rail" className="fixed right-5 top-1/2 z-[40] hidden -translate-y-1/2 xl:block">
      <ol className="flex flex-col gap-1 rounded-full bg-ink-950/70 p-1.5 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.5),0_0_0_1px_rgb(255_255_255/0.1)] backdrop-blur-md">
        {PAGE_CHAPTERS.map((c) => {
          const on = active === c.id;
          return (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                data-testid={`rail-${c.id}`}
                aria-current={on ? "true" : undefined}
                aria-label={c.label}
                className="group relative grid size-7 place-items-center rounded-full"
              >
                <span
                  aria-hidden
                  className={`block rounded-full transition-all duration-500 ease-out-expo ${on ? "size-2.5 bg-mint shadow-[0_0_12px_rgb(99_230_180/0.8)]" : "size-1.5 bg-white/35 group-hover:bg-white/70"}`}
                />
                <span
                  className={`pointer-events-none absolute right-full mr-3 whitespace-nowrap rounded-full bg-ink-950/90 px-3 py-1 text-[12px] font-medium text-white shadow-[0_0_0_1px_rgb(255_255_255/0.1)] transition-opacity duration-300 ${
                    on ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  }`}
                >
                  {c.label}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
