import type { MeasurementRun, RunRole } from "../../core/types";
import { Field, Select } from "../components";

const ROLE_LABEL: Record<RunRole, string> = { calibration: "Kalibrierung", evaluation: "Evaluation" };
const KIND_LABEL = { stationary: "stationär", walk: "Gehversuch" } as const;

export function runLabel(r: MeasurementRun): string {
  return `${r.name} · ${KIND_LABEL[r.kind]} · ${ROLE_LABEL[r.role]}${r.origin === "synthetic" ? " · SYNTHETISCH" : ""}`;
}

/** Select for one run. `roles` restricts the choice (e.g. evaluation only, to prevent leakage). */
export function RunSelect({
  runs,
  value,
  onChange,
  roles,
  label = "Messreihe",
  id = "run-select",
}: {
  runs: MeasurementRun[];
  value: string | null;
  onChange: (id: string) => void;
  roles?: RunRole[];
  label?: string;
  id?: string;
}) {
  const options = roles ? runs.filter((r) => roles.includes(r.role)) : runs;
  return (
    <Field label={label}>
      <Select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} disabled={options.length === 0}>
        {options.length === 0 && <option value="">– keine passende Messreihe –</option>}
        {value === null && options.length > 0 && <option value="">– wählen –</option>}
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {runLabel(r)}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export { ROLE_LABEL, KIND_LABEL };
