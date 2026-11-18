import { useEffect, useState, type Dispatch, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, CircleAlert, Download, Loader2, Search, TriangleAlert } from "lucide-react";
import { currentReport, FIX_ORDER, FIXES, fixAvailable, type FixCode, type FlowAction, type FlowState } from "./operatorFlow";
import { COVERAGE_RADIUS_M } from "./simModel";
import { MiniPlan } from "./MiniPlan";
import type { Finding, ReadinessStatus } from "./evaluateReadiness";

interface StageProps {
  state: FlowState;
  dispatch: Dispatch<FlowAction>;
}

/** Zählt in festen Abständen bis `max` hoch (für Aufbau-Animationen). Ohne Animation sofort am Ziel. */
function useCounter(max: number, intervalMs: number, key: unknown): number {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? max : 0);
  useEffect(() => {
    if (reduce) {
      setN(max);
      return;
    }
    setN(0);
    const id = window.setInterval(() => setN((v) => (v >= max ? v : v + 1)), intervalMs);
    return () => window.clearInterval(id);
  }, [max, intervalMs, key, reduce]);
  return n;
}

const inputCls = "mt-1.5 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[15px] text-text outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/25";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-ink-900 px-5 text-[14px] font-semibold text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-40";

/* 1 – Markt anlegen */
export function StageMarket({ state, dispatch }: StageProps) {
  const m = state.sim.market;
  const [name, setName] = useState(m.name);
  const [code, setCode] = useState(m.code);
  const [address, setAddress] = useState(m.address);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          dispatch({ type: "create", market: { name, code, address } });
        }}
      >
        <label className="block text-[13px] font-medium text-muted">
          Name
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={state.created} />
        </label>
        <label className="block text-[13px] font-medium text-muted">
          Markt-Code
          <input className={`${inputCls} font-mono`} value={code} onChange={(e) => setCode(e.target.value)} disabled={state.created} />
        </label>
        <label className="block text-[13px] font-medium text-muted">
          Adresse
          <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} disabled={state.created} />
        </label>
        <button type="submit" className={primaryBtn} disabled={state.created || !name.trim() || !code.trim()} data-testid="operator-create">
          {state.created ? (
            <>
              <Check className="size-4" aria-hidden /> Angelegt
            </>
          ) : (
            "Anlegen"
          )}
        </button>
      </form>
      <div className="rounded-2xl border border-line bg-paper p-5">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Einrichtungs-Checkliste</p>
        <p className="mt-1 text-[15px] font-medium text-text">{state.created ? "1 von 7 Schritten erledigt" : "0 von 7 Schritten erledigt"}</p>
        <ul className="mt-3 space-y-2 text-[14px]">
          {["Markt angelegt", "Layout aktiv", "Regale beschriftet", "Beacons registriert und platziert", "Sortiment importiert", "Suche findet Produkte", "Bereitschaft ohne blockierende Befunde"].map((t, i) => {
            const done = i === 0 && state.created;
            return (
              <li key={t} className={`flex items-center gap-2.5 ${done ? "text-text" : "text-muted"}`}>
                <span className={`grid size-5 shrink-0 place-items-center rounded-full ring-1 ring-inset ${done ? "bg-ok/20 text-[#13744a] ring-ok/40" : "ring-line"}`}>
                  {done ? <Check className="size-3" aria-hidden /> : null}
                </span>
                {t}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* 2 – Grundriss & Regale */
export function StageLayout({ state }: StageProps) {
  const shelves = state.sim.shelves;
  const n = useCounter(shelves.length, 480, "layout");
  return (
    <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border border-line bg-white p-3">
        <MiniPlan state={state.sim} shelfCount={n} beaconCount={0} />
        <p className="px-1 pt-2 text-[12px] text-muted">Fiktiver Grundriss, 14 × 9 m, 1 Zelle = 1 m.</p>
      </div>
      <ul className="space-y-2" aria-label="Regale">
        {shelves.map((s, i) => (
          <li key={s.id} className={`flex items-baseline gap-3 rounded-xl border px-3.5 py-2.5 text-[14px] transition-opacity duration-500 ${i < n ? "border-line bg-white opacity-100" : "border-transparent opacity-0"}`}>
            <span className="font-mono text-[13px] font-semibold text-accent">{s.category}</span>
            <span className="text-text">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 3 – Beacons */
export function StageBeacons({ state }: StageProps) {
  const [heat, setHeat] = useState(true);
  const beacons = state.sim.beacons;
  const n = useCounter(beacons.length, 380, "beacons");
  const cov = currentReport(state).coverage;
  const pct = Math.round(cov.coveredShare * 100);
  return (
    <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
      <div className="rounded-2xl border border-line bg-white p-3">
        <MiniPlan state={state.sim} beaconCount={n} showHeat={heat} />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-2 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-teal/30" aria-hidden /> mindestens 3 Beacons im Radius von {COVERAGE_RADIUS_M} m
          </span>
          <button type="button" onClick={() => setHeat((h) => !h)} className="min-h-10 rounded-full px-3 font-medium text-accent underline-offset-4 hover:underline">
            {heat ? "Überlagerung ausblenden" : "Überlagerung einblenden"}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <ul className="space-y-2" aria-label="Beacons">
          {beacons.map((b, i) => {
            const bad = b.major === null || b.minor === null;
            return (
              <li key={b.code} className={`flex items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2 text-[13.5px] transition-opacity duration-500 ${i < n ? "opacity-100" : "opacity-0"} ${bad ? "border-danger/50" : "border-line"}`}>
                <span className="font-mono font-semibold text-text">{b.code}</span>
                <span className={bad ? "font-medium text-[#b3262b]" : "font-mono text-muted"}>{bad ? "Major/Minor fehlt" : `${b.major} / ${b.minor}`}</span>
              </li>
            );
          })}
        </ul>
        <div className="rounded-xl bg-paper px-4 py-3 text-[13.5px] leading-relaxed text-muted">
          <span className="font-semibold text-text">Planungswert: {pct} % der begehbaren Zellen</span> erreichen drei oder mehr Beacons im Radius. Das ist eine Rechnung am Plan, keine Messung im Markt.
        </div>
      </div>
    </div>
  );
}

/* 4 – Produkte importieren */
export function StageProducts({ state, dispatch }: StageProps) {
  const rows = state.sim.products.slice(0, 8);
  const shelfCodes = new Set(state.sim.shelves.map((s) => s.category));
  const invalid = rows.filter((p) => !shelfCodes.has(p.layoutCode));
  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-[13.5px]">
            <thead className="bg-paper text-[11px] uppercase tracking-[0.08em] text-muted">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Zeile</th>
                <th className="px-3.5 py-2.5 font-semibold">Produkt</th>
                <th className="px-3.5 py-2.5 font-semibold">Regal</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const bad = !shelfCodes.has(p.layoutCode);
                return (
                  <tr key={p.id} className={`border-t border-line ${bad ? "bg-danger/8" : ""}`}>
                    <td className="px-3.5 py-2 font-mono text-muted">{p.line}</td>
                    <td className="px-3.5 py-2 text-text">
                      <span aria-hidden className="mr-2">{p.emoji}</span>
                      {p.name}
                    </td>
                    <td className="px-3.5 py-2 font-mono text-text">{p.layoutCode}</td>
                    <td className="px-3.5 py-2">
                      {bad ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#b3262b]">
                          <CircleAlert className="size-4" aria-hidden /> Fehler
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#13744a]">
                          <Check className="size-4" aria-hidden /> gültig
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p role="status" className="mt-3 text-[13.5px] text-muted">
        {rows.length} Zeilen · {rows.length - invalid.length} gültig · {invalid.length} ungültig
      </p>
      {invalid.map((p) => (
        <p key={p.id} className="mt-2 rounded-xl border border-danger/40 bg-danger/8 px-3.5 py-2.5 text-[14px] text-[#8f1d22]">
          Zeile {p.line}: Kein Regal {p.layoutCode} im aktiven Layout.
        </p>
      ))}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={primaryBtn} onClick={() => dispatch({ type: "importCsv" })} disabled={state.imported} data-testid="operator-import">
          {state.imported ? (
            <>
              <Check className="size-4" aria-hidden /> {state.sim.products.length} Produkte übernommen
            </>
          ) : (
            "Datei trotzdem übernehmen (nur Simulation)"
          )}
        </button>
        <span className="text-[12.5px] text-muted">Fiktive CSV: id;name;kategorie;meter;fach;reihe;preis</span>
      </div>
    </div>
  );
}

const CHECKS = ["Layout aktiv und genau ein Eingang", "Regale beschriftet", "Produkte gegen Regale", "Beacons: UUID, Major, Minor", "Abdeckung im Radius"];

/** Finding codes covered by each check row (same grouping as StoreReadinessEvaluator). */
const CHECK_CODES: readonly (readonly string[])[] = [
  ["NO_ACTIVE_LAYOUT", "ENTRANCE_COUNT", "GRID_SIZE_IMPLAUSIBLE"],
  ["TARGET_SHELF_WITHOUT_LABEL"],
  ["PRODUCT_NO_SHELF", "SHELF_WITHOUT_PRODUCTS", "DUPLICATE_PRODUCT_ID", "PRODUCT_LIMIT_REACHED"],
  ["BEACON_UUID_ALL_ZERO", "BEACON_MAJOR_MINOR_MISSING", "BEACON_IDENTITY_DUPLICATE", "BEACON_IDENTITY_MISMATCH", "LAYOUT_BEACON_NOT_REGISTERED", "BEACON_WITHOUT_IDENTITY", "BEACON_ASSIGNED_NOT_PLACED"],
  ["LOW_BEACON_COVERAGE", "COVERAGE_NOT_COMPUTED"]
];

function checkOutcome(findings: readonly Finding[], index: number): "ok" | "warn" | "block" {
  const hits = findings.filter((f) => CHECK_CODES[index].includes(f.code));
  if (hits.some((f) => f.severity === "BLOCKING")) return "block";
  return hits.length > 0 ? "warn" : "ok";
}

function SeverityChip({ f }: { f: Finding }) {
  const block = f.severity === "BLOCKING";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] ring-1 ring-inset ${block ? "bg-danger/10 text-[#b3262b] ring-danger/30" : "bg-warn/20 text-[#7a5212] ring-warn/40"}`}>
      {block ? <CircleAlert className="size-3" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
      {block ? "Blockierend" : "Warnung"}
    </span>
  );
}

function FindingRow({ f, children }: { f: Finding; children?: ReactNode }) {
  return (
    <li className="rounded-xl border border-line bg-white p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip f={f} />
        <code className="font-mono text-[12.5px] font-semibold text-text">{f.code}</code>
      </div>
      <p className="mt-1.5 text-[14px] leading-relaxed text-text">{f.message}</p>
      {children}
    </li>
  );
}

/* 5 – Bereitschaftsprüfung */
export function StageCheck({ state, dispatch }: StageProps) {
  const reduce = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const report = currentReport(state);
  const finished = state.checked;
  const start = () => setRunning(true);

  // Im Autoplay startet die Prüfung selbst.
  useEffect(() => {
    if (state.autoplay && !state.checked && !running) setRunning(true);
  }, [state.autoplay, state.checked, running]);

  useEffect(() => {
    if (!running) return;
    if (reduce) {
      setDone(CHECKS.length);
      dispatch({ type: "runCheck" });
      setRunning(false);
      return;
    }
    setDone(0);
    const id = window.setInterval(() => {
      setDone((d) => {
        if (d + 1 >= CHECKS.length) {
          window.clearInterval(id);
          window.setTimeout(() => {
            dispatch({ type: "runCheck" });
            setRunning(false);
          }, 350);
        }
        return d + 1;
      });
    }, 420);
    return () => window.clearInterval(id);
  }, [running, reduce, dispatch]);

  const shown = finished ? CHECKS.length : done;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <ul className="space-y-2.5" aria-label="Prüfschritte">
          {CHECKS.map((c, i) => {
            const outcome = finished ? checkOutcome(report.findings, i) : "ok";
            const tone =
              i >= shown
                ? "text-muted ring-line"
                : outcome === "block"
                  ? "bg-danger/12 text-[#b3262b] ring-danger/35"
                  : outcome === "warn"
                    ? "bg-warn/20 text-[#7a5212] ring-warn/40"
                    : "bg-ok/20 text-[#13744a] ring-ok/40";
            return (
              <li key={c} className="flex items-center gap-3 text-[14.5px]" data-outcome={i < shown ? outcome : "pending"}>
                <span className={`grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors duration-300 ${tone}`}>
                  {i < shown ? (
                    outcome === "block" ? <CircleAlert className="size-3.5" aria-label="blockierender Befund" /> : outcome === "warn" ? <TriangleAlert className="size-3.5" aria-label="Warnung" /> : <Check className="size-3.5" aria-label="in Ordnung" />
                  ) : running && i === shown ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                </span>
                <span className={i < shown ? "text-text" : "text-muted"}>{c}</span>
              </li>
            );
          })}
        </ul>
        {!finished ? (
          <button type="button" className={`${primaryBtn} mt-5`} onClick={start} disabled={running || !state.imported} data-testid="operator-run-check">
            {running ? "Prüfung läuft …" : "Prüfung starten"}
          </button>
        ) : null}
      </div>
      <div aria-live="polite">
        {finished ? (
          <motion.ul initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="space-y-2.5" aria-label="Befunde">
            {report.findings.map((f) => (
              <FindingRow key={f.key} f={f} />
            ))}
            <li className="px-1 text-[12.5px] text-muted">
              {report.blocking} blockierend · {report.warnings} Warnung{report.warnings === 1 ? "" : "en"}
            </li>
          </motion.ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-[14px] text-muted">Die Befunde erscheinen hier, sobald die Prüfung durchgelaufen ist.</p>
        )}
      </div>
    </div>
  );
}

/* 6 – Fehler beheben */
export function StageFix({ state, dispatch }: StageProps) {
  const report = currentReport(state);
  return (
    <div className="space-y-3">
      <ul className="space-y-3" aria-label="Offene Befunde">
        {FIX_ORDER.map((code: FixCode) => {
          const open = report.findings.filter((f) => f.code === code);
          const fixed = state.applied.includes(code);
          const info = FIXES[code];
          if (open.length === 0 && !fixed) return null;
          return (
            <li key={code} className={`rounded-2xl border p-4 transition-colors ${fixed && open.length === 0 ? "border-ok/40 bg-ok/8" : "border-line bg-white"}`}>
              <div className="flex flex-wrap items-center gap-2">
                {fixed && open.length === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ok/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#13744a]">
                    <Check className="size-3" aria-hidden /> Behoben
                  </span>
                ) : (
                  <SeverityChip f={open[0]} />
                )}
                <code className="font-mono text-[12.5px] font-semibold text-text">{code}</code>
              </div>
              {open[0] ? <p className="mt-1.5 text-[14px] text-text">{open[0].message}</p> : null}
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                <span className="font-semibold text-text">Im echten Admin: </span>
                {info.realWorld}
              </p>
              {open.length > 0 && fixAvailable(state, code) ? (
                <button type="button" onClick={() => dispatch({ type: "fix", code })} className={`${primaryBtn} mt-3`} data-testid={`operator-fix-${code}`}>
                  {info.button}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {report.findings.length === 0 ? <p className="text-[14px] text-muted">Keine offenen Befunde.</p> : null}
    </div>
  );
}

/* 7 – Startklar */
export function StageReady({ state }: StageProps) {
  const reduce = useReducedMotion();
  const report = currentReport(state);
  const [q, setQ] = useState("");
  const hits = state.sim.products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4);
  const green = report.status === "GREEN";
  const counters = [
    { label: "Regale", value: String(report.counts.shelves) },
    { label: "Produkte", value: String(report.counts.products) },
    { label: "Beacons", value: String(report.counts.beacons) },
    { label: "Abdeckung (Plan)", value: `${Math.round(report.coverage.coveredShare * 100)} %` }
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-line bg-paper p-5">
        <div className="relative grid size-16 shrink-0 place-items-center">
          {!reduce && green ? (
            <motion.span aria-hidden className="absolute inset-0 rounded-full bg-ok/30" initial={{ scale: 0.6, opacity: 0.8 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 1.4, ease: "easeOut" }} />
          ) : null}
          <motion.span
            className={`relative grid size-16 place-items-center rounded-full text-white ${green ? "bg-ok" : "bg-warn"}`}
            initial={reduce ? false : { scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
          >
            {green ? <Check className="size-8" strokeWidth={3} aria-hidden /> : <TriangleAlert className="size-8" aria-hidden />}
          </motion.span>
        </div>
        <div>
          <p className="text-[22px] font-semibold tracking-tight text-text">{report.label}</p>
          <p className="text-[14px] text-muted">{green ? "Keine Befunde. Der fiktive Demomarkt ist startklar." : "Keine blockierenden Befunde. Warnungen bleiben erlaubt."}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {counters.map((c, i) => (
          <motion.div key={c.label} className="rounded-2xl border border-line bg-white p-4" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduce ? 0 : 0.15 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
            <dt className="text-[12px] font-medium text-muted">{c.label}</dt>
            <dd className="mt-1 text-[28px] font-semibold tracking-tight text-text">{c.value}</dd>
          </motion.div>
        ))}
      </dl>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
            <Download className="size-4 text-accent" aria-hidden /> Bericht als Markdown
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">Im echten System exportieren Sie Ampel, Zähler und Befunde als Markdown-Datei. Hier wird nichts heruntergeladen.</p>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-text">
            <Search className="size-4 text-accent" aria-hidden /> Suche nur in diesem Markt
          </p>
          <input className={`${inputCls} !mt-2`} placeholder="z. B. Milch, Brot, Wasser" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Produkt im Demomarkt suchen" />
          <ul className="mt-2 space-y-1 text-[13.5px]">
            {q.trim() && hits.length === 0 ? <li className="text-muted">Nichts gefunden. Produkte anderer Märkte erscheinen nicht.</li> : null}
            {q.trim()
              ? hits.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-text">
                    <span>
                      <span aria-hidden className="mr-1.5">{p.emoji}</span>
                      {p.name}
                    </span>
                    <span className="font-mono text-[12px] text-muted">{p.layoutCode}</span>
                  </li>
                ))
              : null}
          </ul>
        </div>
      </div>
    </div>
  );
}

export const STATUS_STYLE: Record<ReadinessStatus | "NONE", string> = {
  NONE: "bg-black/5 text-muted ring-black/10",
  RED: "bg-danger/10 text-[#b3262b] ring-danger/30",
  YELLOW: "bg-warn/20 text-[#7a5212] ring-warn/40",
  GREEN: "bg-ok/15 text-[#13744a] ring-ok/30"
};
