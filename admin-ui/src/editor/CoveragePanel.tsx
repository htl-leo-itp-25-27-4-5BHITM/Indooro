import { useEffect, useMemo, useState } from "react";
import { coverageRule, type CoverageResult } from "./coverage";
import { coveragePathData, COVERAGE_COLORS, coverageLegend, formatCoverageSummary, formatGapLine, gapStatus } from "./coverageView";
import type { CoverageOverlay } from "./useCoverageOverlay";

const RADIUS_STEP = 0.5;

/** Number field for the radius. Only values inside the rule's range are committed; blur restores the committed value. */
function RadiusNumberField({ radius, onChange }: { radius: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(radius));
  useEffect(() => {
    setDraft((current) => (current.trim() !== "" && Number(current) === radius ? current : String(radius)));
  }, [radius]);
  return <label>Radius (m)
    <input
      type="number"
      min={coverageRule.minRadiusMeters}
      max={coverageRule.maxRadiusMeters}
      step={RADIUS_STEP}
      value={draft}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = Number(text);
        if (text.trim() !== "" && parsed >= coverageRule.minRadiusMeters && parsed <= coverageRule.maxRadiusMeters) onChange(parsed);
      }}
      onBlur={() => setDraft(String(radius))}
    />
  </label>;
}

function Summary({ result, busy }: { result: CoverageResult | null; busy: boolean }) {
  if (!result) return <p>{busy ? "Abdeckung wird berechnet …" : ""}</p>;
  if (result.beaconCount === 0) return <p>Noch keine Beacons platziert.</p>;
  const status = gapStatus(result.summary.lowCoverageShare, coverageRule.maxLowCoverageShare);
  return <>
    <p>{formatCoverageSummary(result.summary, coverageRule.minBeaconsPerCell)}</p>
    <p className={`le-coverage-gap is-${status}`}><span aria-hidden="true">{status === "ok" ? "✓ " : "⚠ "}</span>{formatGapLine(result.summary, coverageRule)}</p>
  </>;
}

/** Left-panel block: toggle, radius controls, live summary and legend. The overlay is view-only. */
export function CoveragePanel({ overlay }: { overlay: CoverageOverlay }) {
  const { enabled, setEnabled, radius, setRadius, result, busy } = overlay;
  const minBeacons = coverageRule.minBeaconsPerCell;
  return <section className="le-coverage-panel" aria-label="Beacon-Abdeckung">
    <h2>Beacon-Abdeckung</h2>
    <label className="le-coverage-toggle"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Beacon-Abdeckung anzeigen</label>
    {enabled && <>
      <p className="le-hint">Reine Ansicht: Die Abdeckung wird nicht gespeichert und verändert den Grundriss nicht.</p>
      <div className="le-coverage-radius">
        <label>Radius-Regler
          <input type="range" min={coverageRule.minRadiusMeters} max={coverageRule.maxRadiusMeters} step={RADIUS_STEP} value={radius} onChange={(event) => setRadius(Number(event.target.value))} />
        </label>
        <RadiusNumberField radius={radius} onChange={setRadius} />
      </div>
      <div className="le-coverage-summary" role="status" aria-live="polite" aria-busy={busy}><Summary result={result} busy={busy} /></div>
      <ul className="le-coverage-legend" aria-label="Legende Beacon-Abdeckung">
        {coverageLegend(minBeacons).map((entry) => <li key={entry.cls}>
          <span className="le-coverage-swatch" aria-hidden="true" style={{ background: entry.hatched ? `repeating-linear-gradient(45deg, ${entry.color} 0 2px, #fff 2px 4px)` : entry.color }} />
          {entry.label}
        </li>)}
      </ul>
    </>}
  </section>;
}

/** Overlay cells inside the canvas transform, below the elements so beacons stay visible. Renders nothing without a result. */
export function CoverageLayer({ result }: { result: CoverageResult | null }) {
  const paths = useMemo(() => (result ? coveragePathData(result.grid, coverageRule.minBeaconsPerCell) : null), [result]);
  if (!paths) return null;
  return <g className="le-coverage-layer" pointerEvents="none" aria-hidden="true">
    <defs>
      <pattern id="le-coverage-hatch" width={0.5} height={0.5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={0.5} stroke="#7a1d22" strokeWidth={0.12} />
      </pattern>
    </defs>
    <path d={paths.high} fill={COVERAGE_COLORS.high} fillOpacity={0.3} />
    <path d={paths.exact} fill={COVERAGE_COLORS.exact} fillOpacity={0.4} />
    <path d={paths.low} fill={COVERAGE_COLORS.low} fillOpacity={0.35} />
    <path d={paths.low} fill="url(#le-coverage-hatch)" />
  </g>;
}
