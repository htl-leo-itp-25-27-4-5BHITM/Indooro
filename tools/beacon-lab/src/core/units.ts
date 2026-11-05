import type { MapScale } from "./types";

/** Unit in which distances may be displayed. Metres only with a confirmed scale. */
export function distanceUnit(scale: MapScale): "m" | "LE" {
  return scale.confirmed ? "m" : "LE";
}

/** Converts layout units to the display unit (metres if confirmed, otherwise layout units unchanged). */
export function toDisplayDistance(units: number, scale: MapScale): number {
  return scale.confirmed ? units * scale.metersPerUnit : units;
}

/** Converts a physical threshold in metres to layout units using the (possibly unconfirmed) scale. */
export function metersToUnits(meters: number, scale: MapScale): number {
  return meters / scale.metersPerUnit;
}

export function formatDistance(units: number | null | undefined, scale: MapScale, digits = 2): string {
  if (units === null || units === undefined || !Number.isFinite(units)) return "–";
  // German number format (decimal comma), consistent with all tables in the lab
  return `${toDisplayDistance(units, scale).toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })} ${distanceUnit(scale)}`;
}

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return "–";
  return `${(fraction * 100).toFixed(digits)} %`;
}
