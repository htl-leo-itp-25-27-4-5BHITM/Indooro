import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import { useReducedMotion } from "motion/react";
import { Camera, LayoutGrid, Maximize2 } from "lucide-react";
import { Tag } from "../../components/ui/Tag";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { Scene } from "./Scene";
import { supportsWebGLSync } from "./webgl";
import type { Store3DViewProps } from "./types";

function Fallback({ market }: { market: Store3DViewProps["market"] }) {
  return (
    <div
      data-testid="store-3d"
      data-market-code={market.code}
      data-fallback="true"
      className="grid aspect-[4/5] place-items-center rounded-3xl bg-ink-800 p-8 text-center ring-1 ring-white/10 sm:aspect-[16/10]"
    >
      <div className="max-w-sm">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-white/6 text-mint ring-1 ring-white/10">
          <LayoutGrid className="size-6" aria-hidden />
        </div>
        <p className="text-base font-semibold text-white">Die 3D-Ansicht ist auf diesem Gerät nicht verfügbar.</p>
        <p className="mt-2 text-sm text-ink-200">Ihr Browser stellt keine 3D-Grafik (WebGL) bereit. Wechseln Sie oben auf „Grundriss“ – alle Funktionen der Demo bleiben erhalten.</p>
      </div>
    </div>
  );
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D-Ansicht nicht verfügbar:", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useVisible(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return visible;
}

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-950/70 px-2.5 py-1 text-[11px] font-medium text-ink-100 ring-1 ring-white/10 backdrop-blur">
      <span aria-hidden className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {children}
    </span>
  );
}

export default function Store3DView(props: Store3DViewProps) {
  const { market, route, sim, showBeacons } = props;
  const reduce = Boolean(useReducedMotion());
  const compact = useMediaQuery("(max-width: 639px)");
  const rootRef = useRef<HTMLDivElement>(null);
  const labelRoot = useRef<HTMLDivElement>(null);
  const visible = useVisible(rootRef);
  const [follow, setFollow] = useState(true);
  const [overviewNonce, setOverviewNonce] = useState(0);
  const [touched, setTouched] = useState(false);
  const [webgl] = useState(() => supportsWebGLSync());

  const hasPosition = sim.position != null && (sim.state === "running" || sim.state === "paused" || sim.state === "arrived-at-stop");
  const following = follow && hasPosition;

  if (!webgl) return <Fallback market={market} />;

  return (
    <Boundary fallback={<Fallback market={market} />}>
      <div
        ref={rootRef}
        data-testid="store-3d"
        data-market-code={market.code}
        data-route-length={route?.totalMeters ?? 0}
        data-sim-state={sim.state}
        data-following={following ? "true" : "false"}
        role="group"
        aria-label={`3D-Ansicht ${market.name} (fiktiver Demomarkt, simulierte Position)`}
        className="relative isolate aspect-[4/5] w-full overflow-hidden rounded-3xl bg-ink-950 ring-1 ring-white/10 sm:aspect-[16/10]"
        onPointerDown={() => setTouched(true)}
      >
        <Canvas
          frameloop={visible ? "always" : "never"}
          dpr={[1, compact ? 1.5 : 2]}
          camera={{ fov: 38, near: 0.1, far: 400, position: [0, 40, 40] }}
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => gl.domElement.setAttribute("data-testid", "store-3d-canvas")}
          style={{ position: "absolute", inset: 0 }}
        >
          <Scene {...props} labelRoot={labelRoot} reduce={reduce} compact={compact} following={following} followWanted={follow} overviewNonce={overviewNonce} />
        </Canvas>

        {/* vignette */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(7,17,23,0.75)_100%)]" />

        <div ref={labelRoot} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />

        {/* top-left: honesty badges */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-1.5 sm:left-4 sm:top-4">
          <Tag kind="simulation" onDark>
            Simulation
          </Tag>
          {!compact && (
            <Tag kind="fiktiv" onDark>
              Fiktiver Demomarkt
            </Tag>
          )}
        </div>

        {/* top-right: camera controls */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5 sm:right-4 sm:top-4">
          <button
            type="button"
            data-testid="store3d-overview"
            onClick={() => {
              setFollow(false);
              setOverviewNonce((n) => n + 1);
            }}
            aria-label="Übersicht"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink-950/75 px-3 text-[13px] font-semibold text-white ring-1 ring-white/12 backdrop-blur transition-colors hover:bg-ink-900 sm:px-3.5"
          >
            <Maximize2 className="size-4" aria-hidden />
            <span className="max-sm:hidden">Übersicht</span>
          </button>
          <button
            type="button"
            data-testid="store3d-follow"
            aria-pressed={follow}
            onClick={() => setFollow((f) => !f)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ring-1 backdrop-blur transition-colors ${
              follow ? "bg-mint/90 text-ink-950 ring-mint" : "bg-ink-950/75 text-white ring-white/12 hover:bg-ink-900"
            }`}
          >
            <Camera className="size-4" aria-hidden />
            Kamera folgt
          </button>
        </div>

        {/* bottom: legend + hint */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-end justify-between gap-2 sm:inset-x-4 sm:bottom-4">
          <div className="flex flex-wrap gap-1.5">
            <Chip color="#63E6B4">Route</Chip>
            <Chip color="#E8B86D">Ziel</Chip>
            {showBeacons && <Chip color="#63E6B4">Beacon</Chip>}
            {!compact && <Chip color="#8CC8FF">Regale nach Sortiment</Chip>}
          </div>
          {!touched && !compact && <span className="rounded-full bg-ink-950/60 px-2.5 py-1 text-[11px] text-ink-200 ring-1 ring-white/8 backdrop-blur">Ziehen zum Drehen · Scrollen zum Zoomen · Regal anklicken</span>}
        </div>
      </div>
    </Boundary>
  );
}
