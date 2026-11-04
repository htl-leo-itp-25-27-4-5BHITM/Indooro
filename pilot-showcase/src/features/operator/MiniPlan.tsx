import { motion, useReducedMotion } from "motion/react";
import { computeCoverage } from "./evaluateReadiness";
import type { SimState } from "./simModel";

interface Props {
  state: SimState;
  /** Anzahl sichtbarer Regale (für die Aufbau-Animation). */
  shelfCount?: number;
  showLabels?: boolean;
  beaconCount?: number;
  showHeat?: boolean;
  /** Beacons ohne Major/Minor rot hervorheben. */
  flagIncomplete?: boolean;
  className?: string;
}

/** Kleiner Grundriss (Meter-Einheiten). Reine Darstellung der Simulationsdaten. */
export function MiniPlan({ state, shelfCount, showLabels = true, beaconCount = 0, showHeat = false, flagIncomplete = true, className = "" }: Props) {
  const reduce = useReducedMotion();
  const { gridWidth: W, gridHeight: H } = state;
  const shown = shelfCount ?? state.shelves.length;
  const coverage = showHeat ? computeCoverage(state) : null;
  return (
    <svg viewBox={`-0.3 -0.3 ${W + 0.6} ${H + 0.6}`} role="img" aria-label="Fiktiver Grundriss des Demomarkts mit Regalen und Beacons" className={`block w-full ${className}`}>
      <rect x={0} y={0} width={W} height={H} rx={0.25} fill="#f4f7f5" stroke="#c5d3cc" strokeWidth={0.06} />
      {Array.from({ length: W - 1 }, (_, i) => (
        <line key={`v${i}`} x1={i + 1} y1={0} x2={i + 1} y2={H} stroke="#dce5e1" strokeWidth={0.025} />
      ))}
      {Array.from({ length: H - 1 }, (_, i) => (
        <line key={`h${i}`} x1={0} y1={i + 1} x2={W} y2={i + 1} stroke="#dce5e1" strokeWidth={0.025} />
      ))}

      {coverage
        ? coverage.perCell.map((n, i) =>
            n < 0 ? null : (
              <motion.rect
                key={`c${i}`}
                x={i % W}
                y={Math.floor(i / W)}
                width={1}
                height={1}
                fill={n >= 3 ? "#27b9ab" : "#e8b86d"}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: n >= 3 ? 0.14 + Math.min(n - 3, 3) * 0.05 : 0.45 }}
                transition={{ duration: 0.6, delay: reduce ? 0 : (i % W) * 0.03 }}
              />
            )
          )
        : null}

      {/* Eingang und Kassenbereich */}
      <rect x={0} y={H - 1} width={2} height={1} fill="#167768" opacity={0.9} />
      <text x={1} y={H - 0.42} fontSize={0.42} textAnchor="middle" fill="#fff" fontWeight={600}>
        Eingang
      </text>
      <rect x={W - 3} y={H - 1} width={3} height={1} fill="#50645a" opacity={0.85} />
      <text x={W - 1.5} y={H - 0.42} fontSize={0.42} textAnchor="middle" fill="#fff" fontWeight={600}>
        Kassen
      </text>

      {state.shelves.slice(0, shown).map((s, i) => (
        <g key={s.id}>
          <motion.rect
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            rx={0.12}
            fill="#0f1f17"
            initial={reduce ? false : { opacity: 0, scaleX: 0.2 }}
            animate={{ opacity: 0.88, scaleX: 1 }}
            style={{ transformBox: "fill-box", transformOrigin: "left center" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : 0.05 }}
          />
          {showLabels && s.label ? (
            <motion.text
              x={s.x + s.w / 2}
              y={s.y + s.h / 2 + 0.17}
              fontSize={0.5}
              textAnchor="middle"
              fill="#b8f5dc"
              fontWeight={600}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.35 + i * 0.01, duration: 0.4 }}
            >
              {s.category}
            </motion.text>
          ) : null}
        </g>
      ))}

      {state.beacons.slice(0, beaconCount).map((b, i) => {
        const bad = flagIncomplete && (b.major === null || b.minor === null);
        const color = bad ? "#e5484d" : "#167768";
        return (
          <motion.g
            key={b.code}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : i * 0.05 }}
          >
            <circle cx={b.x} cy={b.y} r={0.42} fill="#fff" stroke={color} strokeWidth={0.1} />
            <circle cx={b.x} cy={b.y} r={0.16} fill={color} />
            {bad ? (
              <text x={b.x} y={b.y - 0.62} fontSize={0.45} textAnchor="middle" fill="#e5484d" fontWeight={700}>
                ?
              </text>
            ) : null}
          </motion.g>
        );
      })}
    </svg>
  );
}
