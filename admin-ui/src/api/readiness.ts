import { ApiClientError, type ApiClient } from "./client";

// Mirrors ReadinessDtos.java (GET /api/stores/{storeId}/readiness).
export type ReadinessSeverity = "BLOCKING" | "WARNING";
export type ReadinessStatus = "RED" | "YELLOW" | "GREEN";

export interface ReadinessFinding {
  severity: ReadinessSeverity;
  code: string;
  message: string;
  elementId: string | null;
  productId: number | null;
  layoutCode: string | null;
  beaconCode: string | null;
}

export interface ReadinessCounts {
  shelves: number;
  entrances: number;
  products: number;
  placedBeacons: number;
  assignedBeacons: number;
  walkableCells: number;
  lowCoverageCells: number;
}

export interface ReadinessReport {
  storeId: string;
  layoutId: string | null;
  layoutVersionNo: number | null;
  radius: number;
  status: ReadinessStatus;
  blockingCount: number;
  warningCount: number;
  counts: ReadinessCounts;
  findings: ReadinessFinding[];
}

export const DEFAULT_READINESS_RADIUS = 8.0;
export const MIN_READINESS_RADIUS = 0.5;
export const MAX_READINESS_RADIUS = 30;

export function readinessPath(storeId: string, radius: number = DEFAULT_READINESS_RADIUS): string {
  return `/api/stores/${encodeURIComponent(storeId)}/readiness?radius=${encodeURIComponent(String(radius))}`;
}

const statuses: readonly string[] = ["RED", "YELLOW", "GREEN"];
const severities: readonly string[] = ["BLOCKING", "WARNING"];
const countKeys = ["shelves", "entrances", "products", "placedBeacons", "assignedBeacons", "walkableCells", "lowCoverageCells"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFinding(value: unknown): value is ReadinessFinding {
  return isRecord(value)
    && typeof value.severity === "string" && severities.includes(value.severity)
    && typeof value.code === "string"
    && typeof value.message === "string";
}

/** Shape check for the server response. Optional id fields are normalized to null when absent. */
export function parseReadinessReport(value: unknown): ReadinessReport {
  if (!isRecord(value) || typeof value.status !== "string" || !statuses.includes(value.status)
    || !isRecord(value.counts) || !Array.isArray(value.findings) || !value.findings.every(isFinding)
    || typeof value.blockingCount !== "number" || typeof value.warningCount !== "number" || typeof value.radius !== "number"
    || !countKeys.every((key) => typeof (value.counts as Record<string, unknown>)[key] === "number")) {
    throw new ApiClientError("invalid-response", null, "Ungültige Antwort der Pilot-Bereitschaftsprüfung.");
  }
  const findings = (value.findings as unknown[]).map((item): ReadinessFinding => {
    const finding = item as Record<string, unknown>;
    return {
      severity: finding.severity as ReadinessSeverity,
      code: finding.code as string,
      message: finding.message as string,
      elementId: typeof finding.elementId === "string" ? finding.elementId : null,
      productId: typeof finding.productId === "number" ? finding.productId : null,
      layoutCode: typeof finding.layoutCode === "string" ? finding.layoutCode : null,
      beaconCode: typeof finding.beaconCode === "string" ? finding.beaconCode : null
    };
  });
  return {
    storeId: String(value.storeId ?? ""),
    layoutId: typeof value.layoutId === "string" ? value.layoutId : null,
    layoutVersionNo: typeof value.layoutVersionNo === "number" ? value.layoutVersionNo : null,
    radius: value.radius,
    status: value.status as ReadinessStatus,
    blockingCount: value.blockingCount,
    warningCount: value.warningCount,
    counts: value.counts as unknown as ReadinessCounts,
    findings
  };
}

export async function fetchStoreReadiness(
  api: ApiClient,
  storeId: string,
  radius: number = DEFAULT_READINESS_RADIUS,
  options: { signal?: AbortSignal } = {}
): Promise<ReadinessReport> {
  const payload = await api.get<unknown>(readinessPath(storeId, radius), { signal: options.signal });
  return parseReadinessReport(payload);
}
