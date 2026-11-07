import { motion, useReducedMotion } from "motion/react";
import { Check, Search } from "lucide-react";
import { LogoMark } from "./Logo";
import { Tag } from "./Tag";

/**
 * Hero product visual: phone frame (CSS/SVG only) with a mini store map. A mint route draws itself from the entrance
 * to an amber product pin, then loops gently. All values are fictional. Reduced motion renders the finished state.
 */

const ROUTE = "M40 214 H97 V64 H138";
const CYCLE = 7.5; // seconds
// Route draw takes 60% of the cycle; the user dot follows the polyline (segment lengths 57 / 150 / 41).
const DRAW = 0.6;
const DOT_TIMES = [0, DRAW * 0.23, DRAW * 0.83, DRAW, 1];

const SHELVES: { x: number; y: number; w: number; hot?: boolean }[] = [
  { x: 28, y: 36, w: 58 },
  { x: 108, y: 36, w: 64 },
  { x: 28, y: 76, w: 58 },
  { x: 108, y: 76, w: 64, hot: true },
  { x: 28, y: 116, w: 58 },
  { x: 108, y: 116, w: 64 },
  { x: 28, y: 156, w: 58 },
  { x: 108, y: 156, w: 64 }
];

function MiniMap({ animate }: { animate: boolean }) {
  const loop = { duration: CYCLE, repeat: Infinity, ease: "linear" as const };
  return (
    <svg viewBox="0 0 200 236" className="block h-full w-full" role="img" aria-label="Vereinfachter Marktplan mit Route vom Eingang zum Regal">
      <defs>
        <linearGradient id="hp-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f222a" />
          <stop offset="1" stopColor="#0b1a20" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="198" height="234" rx="14" fill="url(#hp-floor)" stroke="#31515a" strokeWidth="1.2" />
      {/* fine grid, as in the product film */}
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={(i + 1) * 20} x2={(i + 1) * 20} y1="2" y2="234" stroke="#28464d" strokeOpacity=".28" />
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <line key={`h${i}`} y1={(i + 1) * 21} y2={(i + 1) * 21} x1="2" x2="198" stroke="#28464d" strokeOpacity=".28" />
      ))}
      {SHELVES.map((s, i) => (
        <g key={i}>
          <rect x={s.x} y={s.y} width={s.w} height="16" rx="4" fill={s.hot ? "#245F56" : "#18313a"} stroke={s.hot ? "#63e6b4" : "#41616a"} strokeWidth={s.hot ? 1.4 : 0.9} />
          <path d={`M${s.x + 6} ${s.y + 5.5} H${s.x + s.w - 6}`} stroke={s.hot ? "#63e6b4" : "#507079"} strokeWidth="1" strokeLinecap="round" />
        </g>
      ))}
      <text x="140" y="108" textAnchor="middle" fill="#9db0b2" fontSize="7" fontWeight="600" letterSpacing=".6">
        REGAL 4
      </text>

      {/* route: halo + stroke, drawing from the entrance */}
      <motion.g
        initial={animate ? undefined : false}
        animate={animate ? { opacity: [1, 1, 1, 0] } : { opacity: 1 }}
        transition={animate ? { ...loop, times: [0, DRAW, 0.9, 1] } : undefined}
      >
        <motion.path
          d={ROUTE}
          fill="none"
          stroke="#63e6b4"
          strokeOpacity=".16"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={animate ? undefined : false}
          animate={animate ? { pathLength: [0, 1, 1] } : { pathLength: 1 }}
          transition={animate ? { ...loop, times: [0, DRAW, 1] } : undefined}
        />
        <motion.path
          d={ROUTE}
          fill="none"
          stroke="#63e6b4"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 0 3px rgb(99 230 180 / .8))" }}
          initial={animate ? undefined : false}
          animate={animate ? { pathLength: [0, 1, 1] } : { pathLength: 1 }}
          transition={animate ? { ...loop, times: [0, DRAW, 1] } : undefined}
        />
      </motion.g>

      {/* START ring (entrance) */}
      <circle cx="40" cy="214" r="7.5" fill="#071117" stroke="#63e6b4" strokeWidth="2" />
      <circle cx="40" cy="214" r="3" fill="#63e6b4" />
      <text x="40" y="231" textAnchor="middle" fill="#f4f7f5" fontSize="7.5" fontWeight="600" letterSpacing=".4">
        EINGANG
      </text>

      {/* walking dot following the route */}
      {animate ? (
        <motion.circle
          r="3.4"
          fill="#fff"
          stroke="#63e6b4"
          strokeWidth="1.6"
          initial={animate ? undefined : false}
          animate={{ cx: [40, 97, 97, 138, 138], cy: [214, 214, 64, 64, 64], opacity: [1, 1, 1, 0, 0] }}
          transition={{ ...loop, times: DOT_TIMES }}
        />
      ) : null}

      {/* amber destination pin */}
      <motion.g
        initial={animate ? undefined : false}
        animate={animate ? { scale: [0.55, 0.55, 1.12, 1, 1], opacity: [0.35, 0.35, 1, 1, 1] } : { scale: 1, opacity: 1 }}
        transition={animate ? { ...loop, times: [0, DRAW - 0.02, DRAW + 0.04, DRAW + 0.08, 1] } : undefined}
        style={{ transformOrigin: "140px 64px", transformBox: "view-box" }}
      >
        {animate ? (
          <motion.circle
            cx="140"
            cy="64"
            fill="none"
            stroke="#e8b86d"
            strokeWidth="1.4"
            initial={animate ? undefined : false}
            animate={{ r: [7, 7, 7, 17, 17], opacity: [0, 0, 0.8, 0, 0] }}
            transition={{ ...loop, times: [0, DRAW, DRAW + 0.02, DRAW + 0.2, 1] }}
          />
        ) : null}
        <circle cx="140" cy="64" r="7.5" fill="#e8b86d" />
        <circle cx="140" cy="64" r="2.8" fill="#071117" />
      </motion.g>
    </svg>
  );
}

export function HeroPhone({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const animate = !reduce;
  const float = (delay: number, amp = 6) =>
    animate ? { animate: { y: [0, -amp, 0] }, transition: { duration: 6, delay, repeat: Infinity, ease: "easeInOut" as const } } : {};

  return (
    <div className={`relative mx-auto w-full max-w-[300px] sm:max-w-[320px] ${className}`}>
      {/* glow behind the device */}
      <div aria-hidden className="pointer-events-none absolute -inset-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(99_230_180/0.22),transparent)] blur-2xl" />

      <motion.div
        initial={animate ? { opacity: 0, y: 40, rotate: -1 } : false}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ duration: 1.1, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative rounded-[2.7rem] bg-[linear-gradient(130deg,#668087,#0b151a_22%,#152831_84%,#6a8588)] p-[3px] shadow-[0_50px_90px_-20px_rgb(0_0_0/0.75),0_0_0_1px_rgb(158_180_179/0.25)]"
      >
        <div className="relative aspect-[9/17.6] overflow-hidden rounded-[2.55rem] border-[5px] border-ink-950 bg-ink-900 [container-type:inline-size]">
          <div aria-hidden className="absolute left-1/2 top-[1.6cqw] z-10 h-[6.2cqw] w-[28cqw] -translate-x-1/2 rounded-full bg-black" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_8%,#173c3e,#0c1b22_60%)]" />
          <div className="relative flex h-full flex-col px-[5.5cqw] pb-[5cqw] pt-[11cqw]">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-[1.5cqw] text-[5cqw] font-semibold tracking-[-0.04em] text-white">
                <LogoMark size={20} />
                indooro
              </span>
              <span className="rounded-full bg-white/8 px-[2.4cqw] py-[0.8cqw] text-[2.9cqw] font-medium text-ink-200 ring-1 ring-inset ring-white/10">Fiktiver Demomarkt</span>
            </div>

            <div className="mt-[4.5cqw] flex items-center gap-[2.4cqw] rounded-[3.4cqw] bg-ink-600/70 px-[3.4cqw] py-[2.9cqw] ring-1 ring-inset ring-mint/60">
              <Search className="size-[4.2cqw] text-mint" strokeWidth={2.2} aria-hidden />
              <span className="text-[4.4cqw] font-medium text-white">Hafermilch</span>
              <span className="ml-auto h-[4.4cqw] w-px animate-pulse bg-mint" aria-hidden />
            </div>

            <div className="mt-[2.6cqw] flex items-center gap-[2.4cqw] rounded-[3cqw] bg-ink-700/80 px-[3.2cqw] py-[2.4cqw] ring-1 ring-inset ring-white/10">
              <span className="text-[5cqw]" aria-hidden>
                🥛
              </span>
              <div className="min-w-0 leading-tight">
                <div className="text-[3.7cqw] font-semibold text-white">Hafermilch</div>
                <div className="text-[3.1cqw] text-amber">Regal 4 · Meter 2</div>
              </div>
              <span className="ml-auto text-[3cqw] font-semibold text-mint">Route →</span>
            </div>

            <div className="mt-[3.4cqw] min-h-0 flex-1">
              <MiniMap animate={animate} />
            </div>

            <div className="mt-[3.4cqw] rounded-[3.2cqw] bg-mint py-[2.8cqw] text-center text-[3.8cqw] font-bold text-ink-950">Route folgen</div>
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,#ffffff12_0%,transparent_21%,transparent_72%,#ffffff07_96%)]" />
        </div>
      </motion.div>

      {/* floating cards */}
      <motion.div
        {...float(0, 7)}
        className="absolute -left-4 top-[40%] z-10 hidden w-[10.5rem] rounded-2xl bg-ink-800/80 p-3 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-inset ring-white/12 backdrop-blur-xl sm:block lg:-left-32"
      >
        <Tag kind="simulation" onDark>
          Simuliert
        </Tag>
        <p className="mt-2 text-[12px] font-semibold leading-snug text-white">Position im Markt</p>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-200">In dieser Demo wird die Position simuliert.</p>
      </motion.div>

      <motion.div
        {...float(1.4, 5)}
        className="absolute -right-3 bottom-[12%] z-10 w-[10.5rem] rounded-2xl bg-ink-800/80 p-3 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-inset ring-white/12 backdrop-blur-xl sm:-right-6 lg:-right-20"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-300">Einkaufsliste</p>
        <ul className="mt-1.5 space-y-1">
          {[
            ["Hafermilch", true],
            ["Vollkornbrot", true],
            ["Äpfel", false]
          ].map(([name, done]) => (
            <li key={String(name)} className="flex items-center gap-2 text-[12px] text-white">
              <span className={`grid size-4 place-items-center rounded-full ${done ? "bg-mint text-ink-950" : "ring-1 ring-inset ring-ink-300"}`}>{done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}</span>
              <span className={done ? "text-ink-200 line-through decoration-white/30" : ""}>{name}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
