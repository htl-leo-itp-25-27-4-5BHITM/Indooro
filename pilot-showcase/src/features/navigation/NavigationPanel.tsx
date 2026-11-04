import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, Flag, Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { Tag } from "../../components/ui/Tag";
import type { PlannedRoute } from "../../domain/types";
import type { NavigationSimulation } from "./useNavigationSimulation";

export interface NavigationPanelProps {
  route: PlannedRoute | null;
  sim: NavigationSimulation;
  /** Lookup for display data of a stop id (product name, emoji, shelf text). */
  describeStop: (stopId: string) => { title: string; subtitle: string; emoji: string } | undefined;
}

const btnBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-mint/70 disabled:cursor-not-allowed disabled:opacity-40";
const btnPrimary = `${btnBase} bg-mint text-ink-950 hover:bg-mint-soft`;
const btnGhost = `${btnBase} bg-white/6 text-ink-100 ring-1 ring-inset ring-white/12 hover:bg-white/10`;

function formatMeters(m: number): string {
  return `${Math.round(m)} m`;
}

/**
 * Turn-by-turn style card for the simulated walk. All positions shown here are simulated;
 * no BLE measurement is involved.
 */
export function NavigationPanel({ route, sim, describeStop }: NavigationPanelProps) {
  const reduce = useReducedMotion();
  const stops = route?.order ?? [];
  const n = stops.length;
  const unreachable = route?.unreachable ?? [];

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-ink-200">Navigation</h3>
      <Tag kind="simulation" onDark>
        Simulierte Position
      </Tag>
    </div>
  );

  const shell = (children: ReactNode) => (
    <section
      aria-label="Navigation (Simulation)"
      data-testid="navigation-panel"
      className="rounded-3xl bg-ink-900 p-5 text-white shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_24px_60px_-24px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/8 sm:p-6"
    >
      {header}
      {children}
    </section>
  );

  if (!route || n === 0) {
    return shell(
      <div className="mt-5 rounded-2xl bg-white/4 p-5 ring-1 ring-inset ring-white/8" data-testid="nav-empty">
        <p className="text-base font-semibold tracking-tight">Noch keine Route</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-200">
          Fügen Sie Produkte zur Einkaufsliste hinzu – die Route wird automatisch berechnet.
        </p>
        <Note />
        {unreachable.length > 0 && <Unreachable items={unreachable.map((s) => describeStop(s.id)?.title ?? s.label)} />}
      </div>
    );
  }

  const running = sim.state === "running" || sim.state === "arrived-at-stop";
  const finished = sim.state === "finished";
  const active = sim.activeStopIndex >= 0 ? stops[sim.activeStopIndex] : undefined;
  const lastReached = sim.reachedCount > 0 ? stops[sim.reachedCount - 1] : undefined;
  const focus = sim.state === "arrived-at-stop" && lastReached ? lastReached : active;
  const info = focus ? describeStop(focus.id) : undefined;
  const k = finished ? n : Math.min(n, sim.state === "arrived-at-stop" ? sim.reachedCount : sim.activeStopIndex + 1 || n);

  const caption = finished
    ? "Route abgeschlossen"
    : sim.state === "arrived-at-stop"
      ? "Angekommen"
      : sim.state === "idle"
        ? "Erstes Ziel"
        : sim.state === "paused"
          ? "Pausiert – nächstes Ziel"
          : "Nächstes Ziel";

  return shell(
    <>
      <div className="mt-5 flex items-start gap-4" aria-live="polite">
        <div
          className={`grid size-14 shrink-0 place-items-center rounded-2xl text-3xl ring-1 ring-inset ${
            sim.state === "arrived-at-stop" ? "bg-mint/15 ring-mint/40" : "bg-amber/12 ring-amber/30"
          }`}
          aria-hidden
        >
          {finished ? <Flag className="size-6 text-mint" /> : (info?.emoji ?? "•")}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-mint">{caption}</p>
          <p className="mt-0.5 truncate text-xl font-semibold tracking-tight sm:text-2xl" data-testid="nav-target-title">
            {finished ? "Alle Ziele erreicht" : (info?.title ?? focus?.label)}
          </p>
          <p className="mt-0.5 text-sm text-ink-200">{finished ? "Das Ende der Simulation ist erreicht." : info?.subtitle}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/4 px-4 py-3 ring-1 ring-inset ring-white/8">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-300">Noch zu gehen</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight" data-testid="nav-distance">
            {formatMeters(sim.remainingMeters)}
          </p>
        </div>
        <div className="rounded-2xl bg-white/4 px-4 py-3 ring-1 ring-inset ring-white/8">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-300">Ziel</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight" data-testid="nav-stop-count">
            {k} <span className="text-base font-medium text-ink-300">von {n}</span>
          </p>
        </div>
      </div>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/8"
        role="progressbar"
        aria-label="Fortschritt der Route"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(sim.progress * 100)}
      >
        <motion.div
          className="h-full rounded-full bg-mint"
          animate={{ width: `${sim.progress * 100}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.12, ease: "linear" }}
        />
      </div>

      <ol className="mt-5 space-y-1" aria-label="Ziele in optimierter Reihenfolge">
        {stops.map((stop, i) => {
          const d = describeStop(stop.id);
          const reached = sim.reachedStopIds.has(stop.id);
          const isActive = i === sim.activeStopIndex;
          return (
            <li
              key={stop.id}
              data-testid={`nav-stop-${i + 1}`}
              data-state={reached ? "reached" : isActive ? "active" : "open"}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm ${isActive ? "bg-white/6 ring-1 ring-inset ring-amber/30" : ""}`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold tabular-nums ${
                  reached ? "bg-mint text-ink-950" : isActive ? "bg-amber text-ink-950" : "bg-white/10 text-ink-100"
                }`}
              >
                {reached ? <Check className="size-3.5" strokeWidth={3} aria-label="erreicht" /> : i + 1}
              </span>
              <span aria-hidden className="text-base">
                {d?.emoji}
              </span>
              <span className={`min-w-0 flex-1 truncate ${reached ? "text-ink-300 line-through decoration-white/20" : "text-ink-100"}`}>
                {d?.title ?? stop.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 flex flex-wrap gap-2">
        {sim.state === "paused" ? (
          <button type="button" className={btnPrimary} onClick={sim.resume} data-testid="nav-resume">
            <Play className="size-4" aria-hidden /> Fortsetzen
          </button>
        ) : running ? (
          <button type="button" className={btnPrimary} onClick={sim.pause} data-testid="nav-pause">
            <Pause className="size-4" aria-hidden /> Pause
          </button>
        ) : (
          <button type="button" className={btnPrimary} onClick={sim.start} data-testid="nav-start">
            <Play className="size-4" aria-hidden /> {finished ? "Erneut starten" : "Start"}
          </button>
        )}
        <button type="button" className={btnGhost} onClick={sim.nextStop} disabled={finished} data-testid="nav-next">
          <SkipForward className="size-4" aria-hidden /> Nächstes Ziel
        </button>
        <button type="button" className={btnGhost} onClick={sim.reset} disabled={sim.state === "idle"} data-testid="nav-reset">
          <RotateCcw className="size-4" aria-hidden /> Zurücksetzen
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-ink-200" id="nav-speed-label">
          Geschwindigkeit
        </span>
        <div role="group" aria-labelledby="nav-speed-label" className="inline-flex rounded-xl bg-white/6 p-1 ring-1 ring-inset ring-white/10">
          {sim.speedOptions.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={sim.speed === v}
              onClick={() => sim.setSpeed(v)}
              data-testid={`nav-speed-${v}`}
              className={`min-h-9 min-w-11 rounded-lg px-3 text-sm font-semibold tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-mint/70 ${
                sim.speed === v ? "bg-white/14 text-white" : "text-ink-200 hover:text-white"
              }`}
            >
              {v}×
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="nav-scrubber" className="block text-xs font-medium text-ink-200">
          Position verschieben (Simulation)
        </label>
        <input
          id="nav-scrubber"
          data-testid="nav-scrubber"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(sim.progress * 1000)}
          onChange={(e) => sim.seek(Number(e.currentTarget.value) / 1000)}
          className="mt-2 h-11 w-full cursor-pointer accent-[#63E6B4]"
          aria-valuetext={`${Math.round(sim.progress * 100)} Prozent der Route`}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-white/4 px-4 py-3 text-xs leading-relaxed text-ink-200 ring-1 ring-inset ring-white/8">
        <p className="font-semibold text-ink-100">
          Optimierte Reihenfolge · {formatMeters(route.totalMeters)} Gesamtstrecke
        </p>
        <p className="mt-0.5">A* + 2-opt, wie in der Indooro-iOS-App.</p>
      </div>

      {unreachable.length > 0 && <Unreachable items={unreachable.map((s) => describeStop(s.id)?.title ?? s.label)} />}
      <Note />
    </>
  );
}

function Note() {
  return (
    <p className="mt-4 text-xs leading-relaxed text-ink-300" data-testid="nav-note">
      Im Pilotbetrieb wird die Position über Bluetooth-Beacons bestimmt. Die Genauigkeit wird erst im Test gemessen.
    </p>
  );
}

function Unreachable({ items }: { items: string[] }) {
  return (
    <div className="mt-4 rounded-2xl bg-warn/10 px-4 py-3 text-xs leading-relaxed text-warn ring-1 ring-inset ring-warn/30" data-testid="nav-unreachable">
      <p className="font-semibold">Nicht erreichbar im Layout</p>
      <p className="mt-0.5 text-ink-100">{items.join(", ")}</p>
    </div>
  );
}
