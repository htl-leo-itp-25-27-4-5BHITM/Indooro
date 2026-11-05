import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Beacon, DataOrigin, FloorPlan, PositionEstimate, ReferencePoint, RssiSample } from "../core/types";
import { formatDistance } from "../core/units";
import { FloorPlanMap } from "./FloorPlanMap";
import { formatAbsTime, formatRelTime } from "./format";
import { normalize } from "./heatmap";
import { useMap } from "./MapContext";
import { ReferenceLayer } from "./overlays";
import { SPEEDS, advance, durationMsOf, epochIndexAt, latestInWindow, stepEpoch } from "./replayClock";

export interface ReplayProps {
  plan: FloorPlan;
  beacons: Beacon[];
  estimates: PositionEstimate[];
  references: ReferencePoint[];
  samples: RssiSample[];
  algorithmOptions?: { id: string; label: string }[];
  algorithmId?: string;
  onAlgorithmChange?: (id: string) => void;
  /** origin of the run – shows the SYNTHETISCH badge for synthetic data */
  origin?: DataOrigin;
  /** how many seconds of history are drawn as fading trail (default 8) */
  trailSec?: number;
  /** window for "beacon currently heard" (default 2 s) */
  rssiWindowSec?: number;
  mapHeight?: number;
  className?: string;
}

const RSSI_MIN = -100;
const RSSI_MAX = -40;
const TEAL = "#167768";
const INK = "#102a3b";

interface FrameData {
  idx: number;
  tNow: number;
  estimate: PositionEstimate | undefined;
  trailEst: { x: number; y: number; age: number }[];
  trailTruth: { x: number; y: number; age: number }[];
  heard: Map<string, number>;
}

function ReplayOverlay({ frame, beacons, trailSec }: { frame: FrameData; beacons: Beacon[]; trailSec: number }) {
  const { layers, pxPerUnit } = useMap();
  const px = (n: number) => n / pxPerUnit;
  const e = frame.estimate;

  const trail = (pts: FrameData["trailEst"], color: string, dash?: string) =>
    pts.slice(1).map((p, i) => {
      const a = pts[i];
      const op = Math.max(0.08, 1 - (a.age + p.age) / 2 / trailSec) * 0.85;
      return (
        <line
          key={i}
          x1={a.x}
          y1={a.y}
          x2={p.x}
          y2={p.y}
          stroke={color}
          strokeWidth={2}
          strokeOpacity={op}
          strokeDasharray={dash}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    });

  return (
    <g data-testid="replay-overlay" pointerEvents="none">
      {layers.trajectories && (
        <g>
          {trail(frame.trailTruth, INK, "4 3")}
          {trail(frame.trailEst, TEAL)}
        </g>
      )}
      {layers.beacons &&
        beacons.map((b) => {
          const rssi = frame.heard.get(b.id);
          if (rssi === undefined) return null;
          const label = String(Math.round(rssi));
          return (
            <g key={b.id} transform={`translate(${b.position.x} ${b.position.y}) scale(${1 / pxPerUnit})`}>
              <circle r={11} fill="#7edcc6" fillOpacity={0.35} stroke="#27b9ab" strokeWidth={1.25} />
              <g transform="translate(9 9)">
                <rect x={0} y={0} width={label.length * 6.4 + 12} height={15} rx={3} fill="#102a3b" />
                <text x={6} y={11} fontSize={10} fill="#ffffff" className="tabular">
                  {label} dBm
                </text>
              </g>
            </g>
          );
        })}
      {e?.truth && e.position && (
        <line
          x1={e.truth.x}
          y1={e.truth.y}
          x2={e.position.x}
          y2={e.position.y}
          stroke="#b42318"
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {e?.truth && (
        <circle
          cx={e.truth.x}
          cy={e.truth.y}
          r={px(8)}
          fill="#ffffff"
          fillOpacity={0.5}
          stroke={INK}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          data-testid="replay-truth"
        >
          <title>Ground Truth</title>
        </circle>
      )}
      {e?.position && (
        <circle
          cx={e.position.x}
          cy={e.position.y}
          r={px(6)}
          fill={TEAL}
          stroke="#ffffff"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          data-testid="replay-estimate"
        >
          <title>Schätzung</title>
        </circle>
      )}
    </g>
  );
}

export function Replay({
  plan,
  beacons,
  estimates,
  references,
  samples,
  algorithmOptions,
  algorithmId,
  onAlgorithmChange,
  origin,
  trailSec = 8,
  rssiWindowSec = 2,
  mapHeight = 460,
  className = "",
}: ReplayProps) {
  const times = useMemo(() => estimates.map((e) => e.t), [estimates]);
  const durationMs = useMemo(() => durationMsOf(times), [times]);
  const [posMs, setPosMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const posRef = useRef(0);
  posRef.current = posMs;

  const bySeries = useMemo(() => {
    const m = new Map<string, RssiSample[]>();
    for (const s of samples) {
      const arr = m.get(s.beaconId);
      if (arr) arr.push(s);
      else m.set(s.beaconId, [s]);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.t - b.t);
    return m;
  }, [samples]);

  useEffect(() => {
    setPosMs(0);
    setPlaying(false);
  }, [estimates]);

  /* rAF playback loop */
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const r = advance(posRef.current, now - last, speed, durationMs);
      last = now;
      posRef.current = r.posMs;
      setPosMs(r.posMs);
      if (r.ended) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, durationMs]);

  const idx = epochIndexAt(times, posMs);
  const frame: FrameData = useMemo(() => {
    const estimate = estimates[idx];
    const tNow = estimate ? estimate.t : 0;
    const trailEst: FrameData["trailEst"] = [];
    const trailTruth: FrameData["trailTruth"] = [];
    for (let i = idx; i >= 0 && tNow - estimates[i].t <= trailSec; i--) {
      const e = estimates[i];
      const age = tNow - e.t;
      if (e.position) trailEst.unshift({ ...e.position, age });
      else if (trailEst.length) break; // gap at a failed epoch
      if (e.truth) trailTruth.unshift({ ...e.truth, age });
    }
    const heard = new Map<string, number>();
    if (estimate) {
      for (const [id, series] of bySeries) {
        const s = latestInWindow(series, tNow, rssiWindowSec);
        if (s) heard.set(id, s.rssi);
      }
    }
    return { idx, tNow, estimate, trailEst, trailTruth, heard };
  }, [estimates, idx, bySeries, trailSec, rssiWindowSec]);

  const step = useCallback(
    (delta: number) => {
      setPlaying(false);
      const s = stepEpoch(times, epochIndexAt(times, posRef.current), delta);
      posRef.current = s.posMs;
      setPosMs(s.posMs);
    },
    [times],
  );

  const togglePlay = useCallback(() => {
    if (times.length < 2) return;
    if (!playing && posRef.current >= durationMs) {
      posRef.current = 0;
      setPosMs(0);
    }
    setPlaying((p) => !p);
  }, [playing, durationMs, times.length]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const inMap = !!target.closest('[role="application"]');
    if (e.key === " " && tag !== "BUTTON") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft" && !inMap) {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight" && !inMap) {
      e.preventDefault();
      step(1);
    }
  };

  const est = frame.estimate;
  const abs = est ? formatAbsTime(est.t) : null;
  const relT = est && times.length ? est.t - times[0] : 0;
  const empty = estimates.length === 0;
  const synthetic = origin === "synthetic" || plan.origin === "synthetic";
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-line bg-white px-2 text-sm text-brand hover:bg-page disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal";

  return (
    <div
      className={`flex flex-col gap-3 ${className}`}
      onKeyDown={onKeyDown}
      tabIndex={-1}
      data-testid="replay"
      aria-label="Replay"
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {algorithmOptions && algorithmOptions.length > 0 && (
          <label className="flex min-w-0 max-w-full items-center gap-2 text-muted">
            Verfahren
            <select
              className="min-w-0 max-w-full truncate rounded-md border border-line bg-white px-2 py-1 text-sm text-brand"
              value={algorithmId ?? algorithmOptions[0].id}
              onChange={(e) => onAlgorithmChange?.(e.target.value)}
              aria-label="Verfahren wählen"
            >
              {algorithmOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {synthetic && (
          <span className="rounded bg-synthetic px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
            SYNTHETISCH
          </span>
        )}
        {est && !est.position && (
          <span
            className="rounded border border-danger/40 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger"
            role="status"
            data-testid="replay-failed"
          >
            keine Schätzung: {est.failureReason ?? "unbekannter Grund"}
          </span>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <FloorPlanMap
            plan={plan}
            beacons={beacons}
            height={mapHeight}
            availableLayers={["grid", "elements", "labels", "beacons", "references", "trajectories"]}
            overlays={
              <>
                <ReferenceLayer references={references} />
                <ReplayOverlay frame={frame} beacons={beacons} trailSec={trailSec} />
              </>
            }
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white p-2">
            <button type="button" className={btn} aria-label="Eine Epoche zurück" onClick={() => step(-1)} disabled={empty || idx <= 0}>
              ‹
            </button>
            <button
              type="button"
              className={`${btn} w-20 font-medium`}
              aria-label={playing ? "Pause" : "Abspielen"}
              aria-pressed={playing}
              onClick={togglePlay}
              disabled={times.length < 2}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              type="button"
              className={btn}
              aria-label="Eine Epoche vor"
              onClick={() => step(1)}
              disabled={empty || idx >= estimates.length - 1}
            >
              ›
            </button>
            <input
              type="range"
              aria-label="Zeitleiste"
              className="mx-1 min-w-[120px] flex-1 accent-[#167768]"
              min={0}
              max={Math.max(1, Math.round(durationMs))}
              step={10}
              value={Math.round(posMs)}
              disabled={times.length < 2}
              onChange={(e) => {
                setPlaying(false);
                const v = Number(e.target.value);
                posRef.current = v;
                setPosMs(v);
              }}
            />
            <select
              aria-label="Geschwindigkeit"
              className="rounded-md border border-line bg-white px-1.5 py-1 text-sm text-brand"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            <div className="tabular ml-auto text-right text-xs leading-tight text-muted" aria-live="off">
              <div className="text-sm font-medium text-brand" data-testid="replay-time">
                {formatRelTime(relT)}
              </div>
              {abs && <div>{abs}</div>}
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted">Leertaste: Play/Pause · ←/→: eine Epoche (außerhalb der Karte)</p>
        </div>

        <aside className="flex flex-col gap-3 rounded-xl border border-line bg-white p-3 text-sm" aria-label="Replay-Details">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Epoche</div>
            <div className="tabular font-medium text-brand" data-testid="replay-epoch">
              {empty ? "–" : `${idx + 1} / ${estimates.length}`}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Aktueller Fehler</div>
            <div className="tabular text-lg font-semibold text-brand" data-testid="replay-error">
              {est && est.errorUnits !== null ? formatDistance(est.errorUnits, plan.scale) : "–"}
            </div>
            {!plan.scale.confirmed && <div className="text-[11px] text-[#7a5410]">LE – Maßstab nicht bestätigt</div>}
            {est && !est.truth && <div className="text-[11px] text-muted">keine Referenz in dieser Epoche</div>}
          </div>
          <div>
            <div className="mb-1 text-xs uppercase tracking-wide text-muted">Beacons (letzte {rssiWindowSec} s)</div>
            <ul className="flex flex-col gap-1.5">
              {beacons.map((b) => {
                const v = frame.heard.get(b.id);
                const used = est?.inputs.some((i) => i.beaconId === b.id);
                return (
                  <li key={b.id} className="text-xs" data-testid={`replay-beacon-${b.id}`}>
                    <div className="flex items-baseline justify-between">
                      <span className={`tabular font-medium ${b.enabled ? "text-brand" : "text-muted line-through"}`}>
                        {b.id}
                        {used && <span className="ml-1 font-normal text-accent">· genutzt</span>}
                      </span>
                      <span className="tabular text-muted">{v === undefined ? "nicht gehört" : `${v.toFixed(0)} dBm`}</span>
                    </div>
                    <div className="mt-0.5 h-1.5 w-full rounded-full bg-page" role="presentation">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: v === undefined ? 0 : `${normalize(v, RSSI_MIN, RSSI_MAX) * 100}%`,
                          background: used ? TEAL : "#7f95a4",
                        }}
                      />
                    </div>
                  </li>
                );
              })}
              {beacons.length === 0 && <li className="text-xs text-muted">keine Beacons</li>}
            </ul>
          </div>
          <div className="mt-auto flex flex-col gap-1 border-t border-line pt-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" aria-hidden="true">
                <circle cx="7" cy="7" r="5" fill="none" stroke={INK} strokeWidth="2" />
              </svg>
              Ground Truth
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" aria-hidden="true">
                <circle cx="7" cy="7" r="5" fill={TEAL} />
              </svg>
              Schätzung
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="14" aria-hidden="true">
                <line x1="1" y1="7" x2="13" y2="7" stroke="#b42318" strokeWidth="2" />
              </svg>
              Fehler (Truth → Schätzung)
            </span>
            <span>Schweif: letzte {trailSec} s</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
