import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "dark" | "ghost" | "ghost-dark";
export type ButtonSize = "md" | "lg";

const BASE =
  "group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold tracking-[-0.01em] transition-[transform,background-color,box-shadow,color] duration-300 ease-out-expo active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  /** mint on ink: for dark surfaces */
  primary:
    "bg-mint text-ink-950 shadow-[0_0_0_1px_rgb(99_230_180/0.5),0_8px_28px_-6px_rgb(99_230_180/0.45)] hover:bg-mint-soft hover:shadow-[0_0_0_1px_rgb(184_245_220/0.7),0_12px_36px_-6px_rgb(99_230_180/0.6)]",
  /** dark on paper: for light surfaces */
  dark: "bg-ink-900 text-paper shadow-[0_8px_24px_-8px_rgb(5_12_16/0.5)] hover:bg-ink-700",
  /** ghost on light surfaces */
  ghost: "bg-transparent text-text shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-black/[0.04] hover:shadow-[inset_0_0_0_1px_rgb(15_31_23/0.25)]",
  /** ghost on dark surfaces */
  "ghost-dark": "bg-white/[0.04] text-ink-100 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.14)] hover:bg-white/[0.09] hover:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.28)]"
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 text-[14px]",
  lg: "min-h-12 px-7 text-[15px] sm:min-h-14 sm:text-[16px]"
};

type Common = { variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode; icon?: ReactNode; "data-testid"?: string };
type AsAnchor = Common & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "href">;
type AsButton = Common & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/** Renders an <a> when `href` is given, otherwise a <button type="button">. */
export function Button(props: AsAnchor | AsButton) {
  const { variant = "primary", size = "md", className = "", children, icon, ...rest } = props;
  const cls = `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
  const content = (
    <>
      {children}
      {icon ? (
        <span aria-hidden className="transition-transform duration-300 ease-out-expo group-hover/btn:translate-x-0.5">
          {icon}
        </span>
      ) : null}
    </>
  );
  if (rest.href !== undefined) {
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {content}
    </button>
  );
}
