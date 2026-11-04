import { useMemo } from "react";
import type { MapScale, PositionEstimate, ReferencePoint } from "../core/types";
import { formatDistance, distanceUnit, toDisplayDistance } from "../core/units";
import { formatAbsTime, formatRelTime, groupHolds, splitSegments } from "./format";
import { colorRamp, normalize, rampGradientCss, valueRange } from "./heatmap";
import { formatPosition } from "./layers";
import { useMap } from "./MapContext";

const POLY_TRUTH = "#102a3b";
const POLY_ESTIMATE = "#167768";

function errorMaxOf(estimates: PositionEstimate[], explicit?: number): number {
  if (explicit !== undefined && explicit > 0) return explicit;
  const r = valueRange(estimates.map((e) => e.errorUnits).filter((v): v is number => v !== null));
  return r && r.max > 0 ? r.max : 1;
}

function timeLabel(t: number): string {
  const abs = formatAbsTime(t);
  return abs ? abs : `t = ${formatRelTime(t)}`;
}

/* ------------------------------------------------------------------ */
/* References                                                           */
/* ------------------------------------------------------------------ */

export interface ReferenceLayerProps {
  references: ReferencePoint[];
  /** draw stationary holds (consecutive references at the same position) as one ring with duration */
  groupHolds?: boolean;
  /** show labels (also requires the "labels" layer) */
  showLabels?: boolean;
}

/** Ground-truth reference points (diamonds) and stationary holds (rings with duration). */
export function ReferenceLayer({ references, groupHolds: group = true, showLabels = true }: ReferenceLayerProps) {
  const { layers, pxPerUnit, scale, selectedId, interactive } = useMap();
  const items = useMemo(() => {
    const sorted = [...references].sort((a, b) => a.t - b.t);
    if (!group) return sorted.map((r, i) => ({ id: `ref-${i}`, start: r.t, end: r.t, position: r.position, count: 1, label: r.label }));
    const holds = groupHolds(sorted);
    return holds.map((h, i) => ({
      id: `ref-${i}`,
      ...h,
      label: sorted.find((r) => r.t === h.start)?.label,
    }));
  }, [references, group]);
  if (!layers.references) return null;
  return (
    <g data-testid="layer-references">
      {items.map((h) => {
        const hold = h.count > 1 && h.end > h.start;
        const dur = h.end - h.start;
        const lines = [
          `Position: ${formatPosition(h.position, scale)}`,
          hold ? `Halt: ${dur.toFixed(1)} s (${h.count} Referenzen)` : `Zeit: ${timeLabel(h.start)}`,
        ];
        const detail = {
          kind: "reference" as const,
          id: h.id,
          title: h.label ? `Referenz ${h.label}` : hold ? "Stationärer Halt" : "Referenzpunkt",
          lines,
          position: h.position,
        };
        const sel = selectedId === h.id;
        return (
          <g
            key={h.id}
            transform={`translate(${h.position.x} ${h.position.y}) scale(${1 / pxPerUnit})`}
            style={{ cursor: "pointer" }}
            {...interactive(detail)}
          >
            <title>{detail.title}</title>
            <circle r={11} fill="transparent" />
            {hold && <circle r={8} fill="#102a3b" fillOpacity={0.08} stroke={POLY_TRUTH} strokeWidth={1} strokeDasharray="2 2" />}
            <path d="M0 -5.5L5.5 0L0 5.5L-5.5 0Z" fill="#ffffff" stroke={sel ? "#27b9ab" : POLY_TRUTH} strokeWidth={sel ? 2 : 1.5} />
            <circle r={1.2} fill={POLY_TRUTH} />
            {showLabels && layers.labels && (h.label || hold) && (
              <text
                x={9}
                y={14}
                fontSize={10}
                fill="#33495a"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
                className="tabular"
                pointerEvents="none"
              >
                {h.label ?? ""}
                {hold ? `${h.label ? " · " : ""}${dur.toFixed(0)} s` : ""}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Estimates                                                            */
/* ------------------------------------------------------------------ */

export interface EstimateLayerProps {
  estimates: PositionEstimate[];
  /** error (layout units) that maps to the end of the colour scale; default = max error */
  maxError?: number;
}

/** Estimated positions coloured by error. Failed estimates are never drawn at a made-up position. */
export function EstimateLayer({ estimates, maxError }: EstimateLayerProps) {
  const { layers, pxPerUnit, scale, selectedId, interactive } = useMap();
  const max = useMemo(() => errorMaxOf(estimates, maxError), [estimates, maxError]);
  if (!layers.estimates) return null;
  return (
    <g data-testid="layer-estimates">
      {estimates.map((e, i) => {
        if (!e.position) return null;
        const id = `est-${i}`;
        const color = e.errorUnits === null ? "#7f95a4" : colorRamp(normalize(e.errorUnits, 0, max), "error");
        const sel = selectedId === id;
        const detail = {
          kind: "estimate" as const,
          id,
          title: `Schätzung ${timeLabel(e.t)}`,
          lines: [
            `Position: ${formatPosition(e.position, scale)}`,
            e.errorUnits === null ? "Fehler: keine Referenz" : `Fehler: ${formatDistance(e.errorUnits, scale)}`,
            `Beacons: ${e.inputs.length}`,
          ],
          position: e.position,
        };
        return (
          <circle
            key={id}
            cx={e.position.x}
            cy={e.position.y}
            r={(sel ? 5.5 : 3.6) / pxPerUnit}
            fill={color}
            fillOpacity={0.9}
            stroke={sel ? "#102a3b" : "#ffffff"}
            strokeWidth={sel ? 1.5 : 0.8}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: "pointer" }}
            {...interactive(detail)}
          >
            <title>{detail.title}</title>
          </circle>
        );
      })}
    </g>
  );
}

export interface EstimateLegendProps {
  estimates: PositionEstimate[];
  scale: MapScale;
  maxError?: number;
  className?: string;
}

/** HTML legend for EstimateLayer: error colour scale + count of failed estimates (not drawn). */
export function EstimateLegend({ estimates, scale, maxError, className = "" }: EstimateLegendProps) {
  const max = errorMaxOf(estimates, maxError);
  const failed = estimates.filter((e) => e.position === null).length;
  const noTruth = estimates.filter((e) => e.position !== null && e.errorUnits === null).length;
  const unit = distanceUnit(scale);
  return (
    <div className={`rounded-lg border border-line bg-white px-3 py-2 text-xs ${className}`} data-testid="estimate-legend">
      <div className="mb-1 font-medium text-brand">Schätzfehler ({unit})</div>
      <div className="h-2 w-full max-w-[220px] rounded-sm" style={{ background: rampGradientCss("error") }} />
      <div className="tabular flex max-w-[220px] justify-between text-muted">
        <span>0</span>
        <span>{toDisplayDistance(max, scale).toFixed(2)}</span>
      </div>
      <div className="mt-1 text-muted">
        <span className="tabular font-medium text-brand">{failed}</span> fehlgeschlagen (nicht dargestellt)
        {noTruth > 0 && (
          <>
            {" · "}
            <span className="tabular font-medium text-brand">{noTruth}</span> ohne Referenz (grau)
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Error vectors                                                        */
/* ------------------------------------------------------------------ */

export interface ErrorVectorLayerProps {
  estimates: PositionEstimate[];
  maxError?: number;
}

/** Line from the true position to the estimate (only for valid estimates with truth). */
export function ErrorVectorLayer({ estimates, maxError }: ErrorVectorLayerProps) {
  const { layers } = useMap();
  const max = useMemo(() => errorMaxOf(estimates, maxError), [estimates, maxError]);
  if (!layers.errors) return null;
  return (
    <g data-testid="layer-errors" pointerEvents="none" aria-hidden="true">
      {estimates.map((e, i) => {
        if (!e.position || !e.truth) return null;
        const color = e.errorUnits === null ? "#7f95a4" : colorRamp(normalize(e.errorUnits, 0, max), "error");
        return (
          <line
            key={i}
            x1={e.truth.x}
            y1={e.truth.y}
            x2={e.position.x}
            y2={e.position.y}
            stroke={color}
            strokeWidth={1.25}
            strokeOpacity={0.75}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Trajectories                                                         */
/* ------------------------------------------------------------------ */

export interface TrajectoryLayerProps {
  estimates: PositionEstimate[];
  /** If given, the truth path is drawn from these references instead of estimates[].truth. */
  references?: ReferencePoint[];
  /** Break lines when consecutive points are further apart in time (default 3x median step). */
  maxGapSec?: number;
}

const toPath = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join("");

/** Truth path (dashed, dark) and estimate path (solid, teal). Lines break at failed epochs and large time gaps. */
export function TrajectoryLayer({ estimates, references, maxGapSec }: TrajectoryLayerProps) {
  const { layers } = useMap();
  const { truthSegs, estSegs } = useMemo(() => {
    const truthItems = references
      ? references.map((r) => ({ t: r.t, p: r.position }))
      : estimates.map((e) => ({ t: e.t, p: e.truth }));
    return {
      truthSegs: splitSegments(truthItems, maxGapSec),
      estSegs: splitSegments(
        estimates.map((e) => ({ t: e.t, p: e.position })),
        maxGapSec,
      ),
    };
  }, [estimates, references, maxGapSec]);
  if (!layers.trajectories) return null;
  return (
    <g data-testid="layer-trajectories" pointerEvents="none" aria-hidden="true" fill="none" strokeLinejoin="round" strokeLinecap="round">
      {truthSegs.map((s, i) => (
        <path key={`t${i}`} d={toPath(s)} stroke={POLY_TRUTH} strokeWidth={1.5} strokeDasharray="5 3" strokeOpacity={0.8} vectorEffect="non-scaling-stroke" />
      ))}
      {estSegs.map((s, i) => (
        <path key={`e${i}`} d={toPath(s)} stroke={POLY_ESTIMATE} strokeWidth={1.75} strokeOpacity={0.85} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}

export function TrajectoryLegend({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 text-xs text-muted ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6" aria-hidden="true">
          <line x1="0" y1="3" x2="26" y2="3" stroke={POLY_TRUTH} strokeWidth="1.5" strokeDasharray="5 3" />
        </svg>
        Referenz (Truth)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6" aria-hidden="true">
          <line x1="0" y1="3" x2="26" y2="3" stroke={POLY_ESTIMATE} strokeWidth="1.75" />
        </svg>
        Schätzung
      </span>
      <span>Lücken = fehlgeschlagene Epochen / große Zeitsprünge</span>
    </div>
  );
}
