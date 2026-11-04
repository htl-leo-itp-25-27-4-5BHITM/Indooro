import type { Store3DViewProps } from "./types";

/** Stub – replaced by the 3D agent. Default export so it can be React.lazy-loaded. */
export default function Store3DView({ market }: Store3DViewProps) {
  return <div data-testid="store-3d" className="grid aspect-[40/26] place-items-center rounded-3xl bg-ink-800 text-ink-200">3D-Ansicht: {market.name}</div>;
}
