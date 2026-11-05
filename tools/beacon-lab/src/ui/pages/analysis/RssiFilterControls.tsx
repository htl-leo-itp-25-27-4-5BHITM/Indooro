import type { RssiFilterConfig, RssiFilterKind } from "../../../core/types";
import { Field, NumberInput, Select, Toggle } from "../../components";
import { RSSI_FILTER_LABEL } from "../../shared";

/** Compact editor for an RssiFilterConfig (signal analysis). */
export function RssiFilterControls({ value, onChange, idPrefix = "sig" }: { value: RssiFilterConfig; onChange: (c: RssiFilterConfig) => void; idPrefix?: string }) {
  const f = value;
  const set = (patch: Partial<RssiFilterConfig>) => onChange({ ...f, ...patch });
  const num = (label: string, v: number, on: (n: number) => void, opts: { min: number; max: number; step?: number; unit?: string; testId: string; int?: boolean }) => (
    <Field label={label}>
      <div data-testid={opts.testId}>
      <NumberInput
        value={v}
        min={opts.min}
        max={opts.max}
        step={opts.step ?? 1}
        unit={opts.unit}
        onChange={(n) => n !== null && on(opts.int ? Math.round(n) : n)}
        aria-label={label}
      />
      </div>
    </Field>
  );
  return (
    <div className="space-y-4" data-testid={`${idPrefix}-filter-controls`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Filter">
          <Select id={`${idPrefix}-filter-kind`} data-testid={`${idPrefix}-filter-kind`} value={f.kind} onChange={(e) => set({ kind: e.target.value as RssiFilterKind })}>
            {(Object.keys(RSSI_FILTER_LABEL) as RssiFilterKind[]).map((k) => (
              <option key={k} value={k}>
                {RSSI_FILTER_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        {(f.kind === "moving-average" || f.kind === "median" || f.kind === "trimmed-mean") &&
          num("Fenster (Samples)", f.window, (window) => set({ window }), { min: 1, max: 100, int: true, testId: `${idPrefix}-window` })}
        {f.kind === "ema" && num("α", f.alpha, (alpha) => set({ alpha }), { min: 0.01, max: 1, step: 0.01, testId: `${idPrefix}-alpha` })}
        {f.kind === "kalman" && (
          <>
            {num("q (Prozess, dB²)", f.kalmanQ, (kalmanQ) => set({ kalmanQ }), { min: 0.001, max: 100, step: 0.1, testId: `${idPrefix}-kalman-q` })}
            {num("r (Messung, dB²)", f.kalmanR, (kalmanR) => set({ kalmanR }), { min: 0.001, max: 400, step: 1, testId: `${idPrefix}-kalman-r` })}
          </>
        )}
      </div>
      <Toggle
        checked={f.outlier.enabled}
        onChange={(enabled) => set({ outlier: { ...f.outlier, enabled } })}
        label="Hampel-Ausreißerfilter vor der Glättung"
        description="Zentriertes Fenster (nutzt Vergangenheit und Zukunft): nur für die Offline-Analyse, nicht echtzeitfähig."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {num("Hampel-Fenster (Samples)", f.outlier.window, (window) => set({ outlier: { ...f.outlier, window } }), { min: 3, max: 51, int: true, testId: `${idPrefix}-hampel-window` })}
        {num("Hampel k (σ)", f.outlier.k, (k) => set({ outlier: { ...f.outlier, k } }), { min: 1, max: 10, step: 0.5, testId: `${idPrefix}-hampel-k` })}
      </div>
    </div>
  );
}
