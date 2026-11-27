import { Component, type ReactNode } from "react";

export function LoadingState({ children }: { children: ReactNode }) {
  return <div role="status" className="grid aspect-[4/5] sm:aspect-[16/10] place-items-center rounded-3xl bg-ink-800 text-sm text-ink-200"><span className="flex items-center gap-3"><span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />{children}</span></div>;
}

export function EmptyState({ children, action, className = "", testId }: { children: ReactNode; action: ReactNode; className?: string; testId?: string }) {
  return <div data-testid={testId} className={className}>{children}{action}</div>;
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="grid aspect-[4/5] sm:aspect-[16/10] content-center justify-items-center gap-4 rounded-3xl bg-ink-800 p-8 text-center text-sm text-ink-200"><h3 className="font-semibold text-white">Die 3D-Ansicht konnte nicht geladen werden</h3><p>Die Verbindung wurde unterbrochen oder die Ansicht ist vorübergehend nicht verfügbar. Bitte versuche es erneut.</p><button type="button" className="rounded-full bg-mint px-4 py-2 font-semibold text-ink-950" onClick={onRetry}>Erneut versuchen</button></div>;
}

/** A failed lazy import otherwise unmounts the entire showcase. */
export class ViewBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ErrorState onRetry={this.props.onRetry} /> : this.props.children; }
}
