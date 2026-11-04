import { createContext, useContext, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";
import { InfoTip } from "./InfoTip";

const FieldCtx = createContext<{ id: string; describedBy?: string } | null>(null);

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** explanatory tooltip text next to the label */
  info?: string;
  children: ReactNode;
  className?: string;
}

/** Label + control + hint/error wrapper. Child controls pick up id / aria-describedby via context. */
export function Field({ label, hint, error, info, children, className }: FieldProps) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <FieldCtx.Provider value={{ id, describedBy: descId }}>
      <div className={cn("space-y-1", className)}>
        <div className="flex items-center gap-1.5">
          <label htmlFor={id} className="text-xs font-medium text-ink">
            {label}
          </label>
          {info && <InfoTip text={info} label={typeof label === "string" ? label : undefined} />}
        </div>
        {children}
        {(hint || error) && (
          <p id={descId} className={cn("text-xs", error ? "text-danger" : "text-muted")} role={error ? "alert" : undefined}>
            {error ?? hint}
          </p>
        )}
      </div>
    </FieldCtx.Provider>
  );
}

const CONTROL =
  "w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-muted/60 focus:border-teal focus:outline-2 focus:outline-teal/30 disabled:bg-page disabled:text-muted";

function useFieldProps(id?: string) {
  const ctx = useContext(FieldCtx);
  return { id: id ?? ctx?.id, "aria-describedby": ctx?.describedBy } as const;
}

export function TextInput({ className, id, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={cn(CONTROL, "h-9", className)} {...useFieldProps(id)} {...rest} />;
}

export interface NumberInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

/** Numeric input with unit suffix. Empty input yields null; out-of-range values are clamped on blur. */
export function NumberInput({ value, onChange, unit, min, max, step = 1, disabled, placeholder, id, className, ...rest }: NumberInputProps) {
  const fp = useFieldProps(id);
  return (
    <div className={cn("relative", className)}>
      <input
        type="number"
        inputMode="decimal"
        className={cn(CONTROL, "tabular h-9 text-right", unit && "pr-11")}
        value={value === null || Number.isNaN(value) ? "" : value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={rest["aria-label"]}
        {...fp}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") return onChange(null);
          const n = Number(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          if (value === null) return;
          let v = value;
          if (min !== undefined && v < min) v = min;
          if (max !== undefined && v > max) v = max;
          if (v !== value) onChange(v);
        }}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{unit}</span>}
    </div>
  );
}

export function Select({ className, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "h-9 pr-8", className)} {...useFieldProps(id)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, id, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(CONTROL, "py-2", className)} {...useFieldProps(id)} {...rest} />;
}

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/** Switch (role="switch"). */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50",
          checked ? "border-accent bg-accent" : "border-line bg-line",
        )}
      >
        <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm text-ink">
        {label}
        {description && <span className="block text-xs text-muted">{description}</span>}
      </label>
    </div>
  );
}

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  digits?: number;
  label?: string;
  id?: string;
}

/** Range slider with numeric readout. */
export function Slider({ value, onChange, min, max, step = 1, unit, digits, label, id }: SliderProps) {
  const fp = useFieldProps(id);
  const shown = digits !== undefined ? value.toFixed(digits) : String(value);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        className="h-1.5 flex-1 cursor-pointer accent-accent"
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        aria-valuetext={`${shown}${unit ? ` ${unit}` : ""}`}
        onChange={(e) => onChange(Number(e.target.value))}
        {...fp}
      />
      <output className="tabular w-20 text-right text-sm text-ink" data-testid="slider-readout">
        {shown}
        {unit && <span className="ml-1 text-xs text-muted">{unit}</span>}
      </output>
    </div>
  );
}
