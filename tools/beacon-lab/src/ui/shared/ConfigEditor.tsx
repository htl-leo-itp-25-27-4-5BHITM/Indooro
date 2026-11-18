/**
 * Editor for a complete PositioningConfig (+ optional EvaluationOptions).
 * Every parameter is visible – nothing is applied implicitly. Shared by positioning, comparison, heatmap and replay pages.
 */
import type { AlgorithmId, EvaluationOptions, PositioningConfig, RssiFilterKind, TemporalFilterKind } from "../../core/types";
import { ALGORITHMS } from "../../positioning/algorithms";
import { Field, NumberInput, Select, Toggle } from "../components";

export const ALGORITHM_IDS = Object.keys(ALGORITHMS) as AlgorithmId[];

export const RSSI_FILTER_LABEL: Record<RssiFilterKind, string> = {
  none: "kein Filter",
  "moving-average": "gleitender Mittelwert",
  ema: "EMA (exponentiell)",
  median: "Median",
  "trimmed-mean": "getrimmtes Mittel (wie iOS)",
  kalman: "Kalman (skalar)",
};

export const TEMPORAL_LABEL: Record<TemporalFilterKind, string> = {
  none: "keine",
  ema: "EMA auf Koordinaten",
  kalman: "Kalman (konstante Geschwindigkeit)",
};

/** Short human-readable description of a config, e.g. for table rows and legends. */
export function describeConfig(c: PositioningConfig): string {
  const parts = [ALGORITHMS[c.algorithm].name];
  if (c.rssiFilter.kind !== "none") parts.push(`RSSI: ${RSSI_FILTER_LABEL[c.rssiFilter.kind]}`);
  if (c.rssiFilter.outlier.enabled) parts.push("Hampel");
  if (c.temporal.kind !== "none") parts.push(`Zeit: ${TEMPORAL_LABEL[c.temporal.kind]}`);
  if (c.temporal.maxSpeedMps > 0) parts.push(`v≤${c.temporal.maxSpeedMps}`);
  return parts.join(" · ");
}

function Num({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  step,
  info,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  info?: string;
}) {
  return (
    <Field label={label} info={info}>
      <NumberInput value={value} onChange={(v) => v !== null && onChange(v)} unit={unit} min={min} max={max} step={step} aria-label={label} />
    </Field>
  );
}

export function ConfigEditor({
  config,
  onChange,
  options,
  onOptionsChange,
  compact = false,
  idPrefix = "cfg",
}: {
  config: PositioningConfig;
  onChange: (c: PositioningConfig) => void;
  options?: EvaluationOptions;
  onOptionsChange?: (o: EvaluationOptions) => void;
  compact?: boolean;
  idPrefix?: string;
}) {
  const p = config.params;
  const f = config.rssiFilter;
  const tf = config.temporal;
  const setP = (patch: Partial<typeof p>) => onChange({ ...config, params: { ...p, ...patch } });
  const setF = (patch: Partial<typeof f>) => onChange({ ...config, rssiFilter: { ...f, ...patch } });
  const setT = (patch: Partial<typeof tf>) => onChange({ ...config, temporal: { ...tf, ...patch } });
  const alg = ALGORITHMS[config.algorithm];
  const grid = compact ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 gap-3 lg:grid-cols-3";

  return (
    <div className="space-y-5" data-testid={`${idPrefix}-editor`}>
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Verfahren</h4>
        <Field label="Algorithmus" hint={alg.description}>
          <Select id={`${idPrefix}-algorithm`} value={config.algorithm} onChange={(e) => onChange({ ...config, algorithm: e.target.value as AlgorithmId })}>
            {ALGORITHM_IDS.map((id) => (
              <option key={id} value={id}>
                {ALGORITHMS[id].name}
              </option>
            ))}
          </Select>
        </Field>
        <div className={grid}>
          <Num label="RSSI-Schwelle" unit="dBm" value={p.rssiThreshold} min={-120} max={0} onChange={(v) => setP({ rssiThreshold: v })} info="Samples schwächer als dieser Wert werden ignoriert." />
          <Num label="Top-K Beacons" value={p.topK} min={0} max={50} onChange={(v) => setP({ topK: Math.round(v) })} info="Nur die k stärksten Beacons verwenden (0 = alle)." />
          <Num label="Min. Beacons" value={p.minBeacons} min={1} max={20} onChange={(v) => setP({ minBeacons: Math.round(v) })} info="Untergrenze; das Verfahren kann eine höhere Untergrenze erzwingen (Trilateration: 3)." />
          {config.algorithm === "weighted-centroid" && (
            <Num label="Gewichtsexponent g" value={p.weightExponent} min={0} max={5} step={0.1} onChange={(v) => setP({ weightExponent: v })} info="w = (10^(RSSI/10))^g. g = 0: ungewichtet; g ≈ 1/n entspricht etwa 1/Distanz." />
          )}
          {config.algorithm === "trilateration" && (
            <>
              <Num label="Huber δ" unit="m" value={p.huberDeltaM} min={0} max={10} step={0.05} onChange={(v) => setP({ huberDeltaM: v })} info="Robuste Verlustfunktion; 0 = gewöhnliche kleinste Quadrate. iOS-App: 0,85 m." />
              <Num label="Distanz min" unit="m" value={p.distanceClampMinM} min={0.05} max={10} step={0.05} onChange={(v) => setP({ distanceClampMinM: v })} />
              <Num label="Distanz max" unit="m" value={p.distanceClampMaxM} min={0.5} max={100} step={0.5} onChange={(v) => setP({ distanceClampMaxM: v })} />
            </>
          )}
          {config.algorithm === "knn-fingerprint" && (
            <>
              <Num label="k (Nachbarn)" value={p.knnK} min={1} max={20} onChange={(v) => setP({ knnK: Math.round(v) })} />
              <Num label="RSSI für 'nicht gehört'" unit="dBm" value={p.knnMissingRssi} min={-130} max={-50} onChange={(v) => setP({ knnMissingRssi: v })} />
            </>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">RSSI-Filter (je Beacon, kausal)</h4>
        <div className={grid}>
          <Field label="Filter">
            <Select id={`${idPrefix}-rssi-filter`} value={f.kind} onChange={(e) => setF({ kind: e.target.value as RssiFilterKind })}>
              {(Object.keys(RSSI_FILTER_LABEL) as RssiFilterKind[]).map((k) => (
                <option key={k} value={k}>
                  {RSSI_FILTER_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {(f.kind === "moving-average" || f.kind === "median" || f.kind === "trimmed-mean") && (
            <Num label="Fenster" unit="Samples" value={f.window} min={1} max={100} onChange={(v) => setF({ window: Math.round(v) })} />
          )}
          {f.kind === "ema" && <Num label="α" value={f.alpha} min={0.01} max={1} step={0.01} onChange={(v) => setF({ alpha: v })} />}
          {f.kind === "kalman" && (
            <>
              <Num label="q (Prozess)" unit="dB²" value={f.kalmanQ} min={0.001} max={100} step={0.1} onChange={(v) => setF({ kalmanQ: v })} />
              <Num label="r (Messung)" unit="dB²" value={f.kalmanR} min={0.001} max={400} step={1} onChange={(v) => setF({ kalmanR: v })} />
            </>
          )}
        </div>
        <Toggle checked={f.outlier.enabled} onChange={(enabled) => setF({ outlier: { ...f.outlier, enabled } })} label="Hampel-Ausreißerfilter vor der Glättung" />
        {f.outlier.enabled && (
          <div className={grid}>
            <Num label="Hampel-Fenster" unit="Samples" value={f.outlier.window} min={3} max={51} onChange={(v) => setF({ outlier: { ...f.outlier, window: Math.round(v) } })} />
            <Num label="Hampel k" unit="σ" value={f.outlier.k} min={1} max={10} step={0.5} onChange={(v) => setF({ outlier: { ...f.outlier, k: v } })} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Epochen</h4>
        <div className={grid}>
          <Num label="Schrittweite" unit="s" value={config.stepSec} min={0.1} max={10} step={0.1} onChange={(v) => onChange({ ...config, stepSec: v })} />
          <Num label="Fenster" unit="s" value={config.windowSec} min={0.1} max={30} step={0.1} onChange={(v) => onChange({ ...config, windowSec: v })} />
          <Num label="Veraltet nach" unit="s" value={config.staleSec} min={0.1} max={60} step={0.1} onChange={(v) => onChange({ ...config, staleSec: v })} />
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Zeitliche Stabilisierung (Positionen)</h4>
        <div className={grid}>
          <Field label="Filter">
            <Select id={`${idPrefix}-temporal`} value={tf.kind} onChange={(e) => setT({ kind: e.target.value as TemporalFilterKind })}>
              {(Object.keys(TEMPORAL_LABEL) as TemporalFilterKind[]).map((k) => (
                <option key={k} value={k}>
                  {TEMPORAL_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {tf.kind === "ema" && <Num label="α" value={tf.alpha} min={0.01} max={1} step={0.01} onChange={(v) => setT({ alpha: v })} />}
          {tf.kind === "kalman" && (
            <>
              <Num label="σ Beschleunigung" unit="m/s²" value={tf.kalmanAccelStd} min={0.01} max={10} step={0.05} onChange={(v) => setT({ kalmanAccelStd: v })} />
              <Num label="σ Messung" unit="m" value={tf.kalmanMeasStd} min={0.1} max={20} step={0.1} onChange={(v) => setT({ kalmanMeasStd: v })} />
            </>
          )}
          <Num label="Max. Geschwindigkeit" unit="m/s" value={tf.maxSpeedMps} min={0} max={10} step={0.1} onChange={(v) => setT({ maxSpeedMps: v })} info="Begrenzt unrealistische Sprünge (0 = aus). Der Schritt wird gekürzt, nicht verworfen." />
        </div>
      </section>

      {options && onOptionsChange && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Ground-Truth-Zuordnung</h4>
          <div className={grid}>
            <Field label="Referenz" info="Standzeit/nächster Punkt für stationäre Messungen; Interpolation (Annahme: konstante Geschwindigkeit) für Gehversuche.">
              <Select
                id={`${idPrefix}-matching`}
                value={options.referenceMatching}
                onChange={(e) => onOptionsChange({ ...options, referenceMatching: e.target.value as EvaluationOptions["referenceMatching"] })}
              >
                <option value="hold-or-nearest">Standzeit / nächster Punkt</option>
                <option value="interpolate">linear interpolieren (Annahme)</option>
              </Select>
            </Field>
            <Num label="Toleranz" unit="s" value={options.toleranceSec} min={0} max={30} step={0.1} onChange={(v) => onOptionsChange({ ...options, toleranceSec: v })} />
          </div>
        </section>
      )}
    </div>
  );
}
