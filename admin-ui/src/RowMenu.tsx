import { useId, useRef, type ReactNode } from "react";

/**
 * Overflow menu of a table row. A native popover renders in the top layer, so the table scroll
 * container cannot clip it; Escape and outside clicks close it and Escape returns the focus.
 */
export function RowMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => menu.current?.hidePopover();

  function place() {
    const button = trigger.current?.getBoundingClientRect();
    const panel = menu.current;
    if (!button || !panel) return;
    const below = button.bottom + 4;
    panel.style.top = `${below + panel.offsetHeight > window.innerHeight ? Math.max(4, button.top - panel.offsetHeight - 4) : below}px`;
    panel.style.left = `${Math.max(4, button.right - panel.offsetWidth)}px`;
    window.addEventListener("scroll", close, { once: true, capture: true });
    window.addEventListener("resize", close, { once: true });
  }

  return <>
    <button ref={trigger} type="button" className="row-menu-toggle" popoverTarget={id} aria-label={label} title="Weitere Aktionen"><span aria-hidden="true">⋯</span></button>
    <div ref={menu} id={id} popover="auto" className="row-menu" role="group" aria-label={label} onToggle={(event) => { if (event.newState === "open") place(); }}>
      {children(close)}
    </div>
  </>;
}
