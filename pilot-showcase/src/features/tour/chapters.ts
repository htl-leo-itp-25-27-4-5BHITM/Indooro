/** Page chapters in reading order (anchor ids of the sections). */
export const PAGE_CHAPTERS = [
  { id: "top", label: "Start" },
  { id: "problem", label: "Problem" },
  { id: "demo", label: "Demo" },
  { id: "so-funktionierts", label: "So funktioniert’s" },
  { id: "betreiber", label: "Für Betreiber" },
  { id: "projektstand", label: "Projektstand" },
  { id: "pilot", label: "Pilot" }
] as const;

export const CHAPTER_IDS: string[] = PAGE_CHAPTERS.map((c) => c.id);

/** Fraction (0..1) of the document that has been scrolled. */
export function scrollFraction(scrollY: number, docHeight: number, viewport: number): number {
  const max = docHeight - viewport;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, scrollY / max));
}
