import { ArrowRight } from "lucide-react";

/** Large "Als Nächstes" link card at the end of a section. */
export function NextChapter({ href, title, text, tone = "light" }: { href: string; title: string; text?: string; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <a
      href={href}
      data-testid="next-chapter"
      className={`group mt-14 flex items-center justify-between gap-6 rounded-3xl p-6 transition-[background-color,box-shadow,transform] duration-500 ease-out-expo hover:-translate-y-0.5 sm:mt-20 sm:p-8 ${
        dark
          ? "on-dark bg-white/[0.04] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] hover:bg-white/[0.07] hover:shadow-[inset_0_0_0_1px_rgb(99_230_180/0.45)]"
          : "bg-white text-text shadow-[0_1px_0_rgb(15_31_23/0.04),0_18px_40px_-24px_rgb(15_31_23/0.25)] ring-1 ring-line hover:shadow-[0_24px_50px_-24px_rgb(15_31_23/0.35)] hover:ring-accent/40"
      }`}
    >
      <span className="min-w-0">
        <span className={`block text-[12px] font-semibold uppercase tracking-[0.14em] ${dark ? "text-mint" : "text-accent"}`}>Als Nächstes</span>
        <span className="mt-2 block text-[clamp(1.35rem,3vw,2rem)] font-semibold leading-tight tracking-[-0.025em]">{title}</span>
        {text ? <span className={`mt-2 block max-w-xl text-[15px] leading-relaxed ${dark ? "text-ink-200" : "text-muted"}`}>{text}</span> : null}
      </span>
      <span
        aria-hidden
        className={`grid size-12 shrink-0 place-items-center rounded-full transition-transform duration-500 ease-out-expo group-hover:translate-x-1 sm:size-14 ${dark ? "bg-mint text-ink-950" : "bg-accent text-white"}`}
      >
        <ArrowRight className="size-5" />
      </span>
    </a>
  );
}
