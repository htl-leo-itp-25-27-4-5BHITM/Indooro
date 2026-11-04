import { useId, useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Cell, PlannedRoute } from "../../domain/types";
import { buildRouteModel, routeSignature } from "./routeModel";

export interface RouteLayerProps {
  route: PlannedRoute | null;
  /** Simulated customer position in metres (fractional), or null if hidden. */
  position: { x: number; y: number; heading: number } | null;
  /** Index into route.order of the stop the customer is heading to; -1 = finished/none. */
  activeStopIndex: number;
  /** Ids of stops already reached. */
  reachedStopIds: ReadonlySet<string>;
  /** Start cell (entrance). */
  start: Cell;
  /** Optional 0..1 progress along the route (sim.progress). Without it the position is projected onto the route. */
  progress?: number;
}

const MINT = "#63E6B4";
const MINT_SOFT = "#B8F5DC";
const AMBER = "#E8B86D";
const INK = "#071117";
const TRAVELLED = "#35505A";
const BLUE = "#5AA9FF";
const LINE_W = 0.42;
const CHEVRON_GAP = 3.4;

const centre = (c: Cell) => ({ x: c.x + 0.5, y: c.y + 0.5 });

function Pill({ x, y, text, fill, color }: { x: number; y: number; text: string; fill: string; color: string }) {
  const w = text.length * 0.36 + 0.8;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-0.45} width={w} height={0.9} rx={0.45} fill={fill} stroke="rgba(255,255,255,0.28)" strokeWidth={0.05} />
      <text x={0} y={0.01} textAnchor="middle" dominantBaseline="central" fontSize={0.5} fontWeight={650} fill={color} style={{ letterSpacing: "0.02em" }}>
        {text}
      </text>
    </g>
  );
}

/**
 * Rendered INSIDE the store map <svg>, whose user units are metres (1 unit = 1 m).
 * Cell centres are at (x + 0.5, y + 0.5). Draws the optimised route (glow, line, direction
 * chevrons, travelled part dimmed), numbered stops, start/end markers and the SIMULATED position.
 */
export function RouteLayer({ route, position, activeStopIndex, reachedStopIds, start, progress }: RouteLayerProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const reduce = useReducedMotion();
  const sig = routeSignature(route);
  const model = useMemo(() => (route ? buildRouteModel(route) : null), [sig]);

  const chevrons = useMemo(() => {
    if (!model) return [];
    const out: { x: number; y: number; heading: number; at: number }[] = [];
    for (let at = CHEVRON_GAP / 2; at < model.length - 0.8; at += CHEVRON_GAP) out.push({ ...model.geometry.pointAt(at), at });
    return out;
  }, [model]);

  if (!route || !model || route.path.length === 0) return null;

  const L = Math.max(0.001, model.length);
  const travelled = Math.min(
    L,
    Math.max(0, progress !== undefined ? progress * L : position ? model.geometry.distanceOf(position) : 0)
  );
  const lastCell = route.path[route.path.length - 1];
  const lastStop = route.order[route.order.length - 1];
  const hasEnd = !lastStop || lastStop.cell.x !== lastCell.x || lastStop.cell.y !== lastCell.y;
  const s0 = centre(start);
  const e0 = centre(lastCell);
  const startLabelUp = s0.y >= 2.4;
  const endLabelUp = e0.y >= 2.4;

  const glowId = `${uid}-glow`;
  const dashProps = { strokeDasharray: `${travelled.toFixed(3)} ${(L + 10).toFixed(3)}` };

  return (
    <g data-testid="route-layer" pointerEvents="none" fontFamily="inherit">
      <defs>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={0.42} />
        </filter>
      </defs>

      {/* soft underlay */}
      <motion.path
        key={`glow-${sig}`}
        d={model.geometry.d}
        fill="none"
        stroke={MINT}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${glowId})`}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 0.26 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* main line, draws on whenever the route changes */}
      <motion.path
        key={`main-${sig}`}
        data-testid="route-path"
        data-length={route.totalMeters}
        d={model.geometry.d}
        fill="none"
        stroke={MINT}
        strokeWidth={LINE_W}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />

      {/* flowing highlight shows the direction of travel */}
      {!reduce && (
        <motion.path
          key={`flow-${sig}`}
          d={model.geometry.d}
          fill="none"
          stroke={MINT_SOFT}
          strokeWidth={0.14}
          strokeLinecap="round"
          strokeDasharray="0.01 1.19"
          opacity={0.75}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: -1.2 }}
          transition={{ duration: 0.9, ease: "linear", repeat: Infinity }}
        />
      )}

      {/* direction chevrons on the part still ahead */}
      {chevrons
        .filter((c) => c.at > travelled + 0.4)
        .map((c, i) => (
          <polyline
            key={i}
            points="-0.15,-0.17 0.1,0 -0.15,0.17"
            transform={`translate(${c.x} ${c.y}) rotate(${c.heading})`}
            fill="none"
            stroke={INK}
            strokeOpacity={0.6}
            strokeWidth={0.075}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

      {/* travelled part, dimmed */}
      {travelled > 0.01 && (
        <path
          d={model.geometry.d}
          pathLength={L}
          fill="none"
          stroke={TRAVELLED}
          strokeWidth={LINE_W + 0.04}
          strokeLinejoin="round"
          {...dashProps}
        />
      )}

      {/* start marker */}
      <g data-testid="route-start">
        <circle cx={s0.x} cy={s0.y} r={0.62} fill={INK} stroke={MINT} strokeWidth={0.16} />
        <circle cx={s0.x} cy={s0.y} r={0.2} fill={MINT} />
        <Pill x={s0.x} y={s0.y + (startLabelUp ? -1.45 : 1.45)} text="Start" fill="rgba(7,17,23,0.92)" color={MINT_SOFT} />
      </g>

      {/* end marker */}
      {hasEnd && (
        <g data-testid="route-end">
          <rect x={e0.x - 0.55} y={e0.y - 0.55} width={1.1} height={1.1} rx={0.3} fill={INK} stroke={MINT} strokeWidth={0.16} />
          <path d={`M${e0.x - 0.22} ${e0.y} l0.16 0.17 l0.3 -0.36`} fill="none" stroke={MINT} strokeWidth={0.12} strokeLinecap="round" strokeLinejoin="round" />
          <Pill x={e0.x} y={e0.y + (endLabelUp ? -1.45 : 1.45)} text="Kasse" fill="rgba(7,17,23,0.92)" color={MINT_SOFT} />
        </g>
      )}

      {/* numbered stops */}
      {route.order.map((stop, i) => {
        const p = centre(stop.cell);
        const reached = reachedStopIds.has(stop.id);
        const active = i === activeStopIndex && !reached;
        return (
          <g key={stop.id} data-testid={`route-stop-${i + 1}`} data-state={reached ? "reached" : active ? "active" : "open"}>
            {active && !reduce && (
              <motion.circle
                cx={p.x}
                cy={p.y}
                fill="none"
                stroke={AMBER}
                strokeWidth={0.12}
                initial={{ r: 0.7, opacity: 0.85 }}
                animate={{ r: 1.7, opacity: 0 }}
                transition={{ duration: 1.5, ease: "easeOut", repeat: Infinity }}
              />
            )}
            {active && <circle cx={p.x} cy={p.y} r={0.95} fill="none" stroke={AMBER} strokeWidth={0.12} strokeOpacity={0.9} />}
            <circle
              cx={p.x}
              cy={p.y}
              r={0.62}
              fill={reached ? MINT : INK}
              stroke={reached ? MINT : active ? AMBER : "rgba(255,255,255,0.85)"}
              strokeWidth={0.13}
            />
            {reached ? (
              <path d={`M${p.x - 0.28} ${p.y + 0.02} l0.2 0.22 l0.38 -0.46`} fill="none" stroke={INK} strokeWidth={0.15} strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <text x={p.x} y={p.y + 0.02} textAnchor="middle" dominantBaseline="central" fontSize={0.62} fontWeight={700} fill={active ? AMBER : "#FFFFFF"}>
                {i + 1}
              </text>
            )}
          </g>
        );
      })}

      {/* simulated position */}
      {position && (
        <g data-testid="position-marker" data-x={position.x.toFixed(2)} data-y={position.y.toFixed(2)} transform={`translate(${position.x} ${position.y})`}>
          <title>Simulierte Position</title>
          {/* illustrative accuracy halo – not a measured value */}
          <circle r={1.6} fill={BLUE} fillOpacity={0.14} stroke={BLUE} strokeOpacity={0.5} strokeWidth={0.07} strokeDasharray="0.25 0.2" />
          <g transform={`rotate(${position.heading})`}>
            <path d="M0.2 0 L2.5 -1.15 A2.6 2.6 0 0 1 2.5 1.15 Z" fill={BLUE} fillOpacity={0.38} />
          </g>
          <circle r={0.55} fill="#FFFFFF" stroke={BLUE} strokeWidth={0.2} />
          <circle r={0.2} fill={BLUE} />
        </g>
      )}
    </g>
  );
}
