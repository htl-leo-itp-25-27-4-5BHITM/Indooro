import { ApiClientError } from "./api/client";
import {
  MAX_READINESS_RADIUS,
  MIN_READINESS_RADIUS,
  type ReadinessCounts,
  type ReadinessFinding,
  type ReadinessReport,
  type ReadinessStatus
} from "./api/readiness";

// Pure readiness helpers. No React and no clock access here: the caller passes the date for exports.

export function statusLabel(status: ReadinessStatus): string {
  if (status === "RED") return "Nicht bereit";
  if (status === "YELLOW") return "Bereit mit Hinweisen";
  return "Bereit";
}

export function statusColorName(status: ReadinessStatus): string {
  if (status === "RED") return "Rot";
  if (status === "YELLOW") return "Gelb";
  return "Grün";
}

export function groupFindings(findings: readonly ReadinessFinding[]): { blocking: ReadinessFinding[]; warnings: ReadinessFinding[] } {
  return {
    blocking: findings.filter((finding) => finding.severity === "BLOCKING"),
    warnings: findings.filter((finding) => finding.severity === "WARNING")
  };
}

/** Codes of the beacon registry checks (uuid, major/minor, duplicates, layout against registry). */
export const BEACON_CONSISTENCY_CODES: readonly string[] = [
  "BEACON_UUID_ALL_ZERO",
  "BEACON_MAJOR_MINOR_MISSING",
  "BEACON_IDENTITY_DUPLICATE",
  "BEACON_IDENTITY_MISMATCH",
  "LAYOUT_BEACON_NOT_REGISTERED"
];

export function beaconConsistencyFindings(findings: readonly ReadinessFinding[]): ReadinessFinding[] {
  return findings.filter((finding) => BEACON_CONSISTENCY_CODES.includes(finding.code));
}

/**
 * One line on whether registered beacons and layout beacons agree. It says "nothing to compare" instead of
 * "consistent" when the store has no beacons at all.
 */
export function beaconConsistencyText(report: Pick<ReadinessReport, "counts" | "findings">): string {
  const issues = beaconConsistencyFindings(report.findings).length;
  if (issues > 0) return `${issues} Abweichung${issues === 1 ? "" : "en"} zwischen Registrierung und Layout`;
  if (report.counts.placedBeacons === 0 && report.counts.assignedBeacons === 0) return "Keine Beacons zum Vergleichen";
  return "Registrierung und Layout stimmen überein";
}

export function formatRadius(radius: number): string {
  return String(radius).replace(".", ",");
}

/** Accepts "8", "8.0" or "8,0"; the radius must be inside the server-side range 0.5 to 30. */
export function parseRadiusInput(raw: string): { radius: number } | { error: string } {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return { error: "Bitte eine Zahl eingeben, z. B. 8,0." };
  const radius = Number(normalized);
  if (radius < MIN_READINESS_RADIUS || radius > MAX_READINESS_RADIUS) {
    return { error: "Der Radius muss zwischen 0,5 und 30 Metern liegen." };
  }
  return { radius };
}

/** Coverage is the share of walkable cells with fewer than three placed beacons within the radius. */
export function coverageText(counts: Pick<ReadinessCounts, "walkableCells" | "lowCoverageCells">): string {
  if (counts.walkableCells <= 0) return "Keine begehbaren Zellen";
  // One decimal place: 563 of 564 cells must not read as 100 %.
  const share = (Math.round((counts.lowCoverageCells / counts.walkableCells) * 1000) / 10).toLocaleString("de-AT", { maximumFractionDigits: 1 });
  return `${counts.lowCoverageCells} von ${counts.walkableCells} begehbaren Zellen unter 3 Beacons (${share} %)`;
}

/** Display name of a coverage profile id. Unknown ids are shown as they are. */
export function profileLabel(profile: string): string {
  if (profile === "market") return "Markt";
  if (profile === "testroom") return "Testraum";
  return profile;
}

export const READINESS_PROFILE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "market", label: "Markt (Standard)" },
  { value: "testroom", label: "Testraum" }
];

function percentText(share: number): string {
  return `${(Math.round(share * 1000) / 10).toLocaleString("de-AT", { maximumFractionDigits: 1 })} %`;
}

/** The rule the coverage was measured against, or null when the server did not send its values. */
export function ruleText(report: Pick<ReadinessReport, "radius" | "minBeaconsPerCell" | "maxLowCoverageShare">): string | null {
  if (report.minBeaconsPerCell === null || report.maxLowCoverageShare === null) return null;
  return `mindestens ${report.minBeaconsPerCell} Beacons im Radius ${formatRadius(report.radius)} m, höchstens ${percentText(report.maxLowCoverageShare)} der begehbaren Zellen darunter`;
}

/** Coverage line of a report. States "nicht berechnet" instead of a share when nothing was calculated. */
export function coverageSummary(report: Pick<ReadinessReport, "counts" | "coverageComputed">): string {
  return report.coverageComputed ? coverageText(report.counts) : "Abdeckung nicht berechnet";
}

export function describeReadinessError(error: unknown): { kind: "forbidden" | "unauthorized" | "retryable"; title: string; message: string } {
  if (error instanceof ApiClientError && error.kind === "forbidden") {
    return { kind: "forbidden", title: "Zugriff verweigert", message: "Kein Zugriff auf diesen Markt." };
  }
  if (error instanceof ApiClientError && error.kind === "unauthorized") {
    return { kind: "unauthorized", title: "Sitzung abgelaufen", message: "Sitzung abgelaufen. Bitte erneut anmelden." };
  }
  const message = error instanceof ApiClientError ? error.message : "Die Prüfung konnte nicht geladen werden.";
  return { kind: "retryable", title: "Pilot-Bereitschaft konnte nicht geladen werden", message };
}

function findingReferences(finding: ReadinessFinding): string {
  return [
    finding.elementId ? `Element ${finding.elementId}` : null,
    finding.productId != null ? `Produkt ${finding.productId}` : null,
    finding.layoutCode ? `Layout-Code ${finding.layoutCode}` : null,
    finding.beaconCode ? `Beacon ${finding.beaconCode}` : null
  ].filter(Boolean).join(" · ");
}

function findingLine(finding: ReadinessFinding): string {
  const references = findingReferences(finding);
  return `- [ ] \`${finding.code}\` ${finding.message}${references ? ` (${references})` : ""}`;
}

export function readinessToMarkdown(report: ReadinessReport, options: { storeName: string; checkedOn: string }): string {
  const { blocking, warnings } = groupFindings(report.findings);
  const { counts } = report;
  const layout = report.layoutVersionNo != null ? `Version ${report.layoutVersionNo}` : "kein aktives Layout";
  const lines = [
    `# Pilot-Bereitschaft: ${options.storeName}`,
    "",
    `Stand: ${options.checkedOn}`,
    `Ampel: ${statusLabel(report.status)} (${statusColorName(report.status)})`,
    `Layout: ${layout}`,
    `Abdeckungsprofil: ${profileLabel(report.profile)}`,
    ...(ruleText(report) ? [`Abdeckungsregel: ${ruleText(report)}`] : []),
    `Beacon-Radius: ${formatRadius(report.radius)} m`,
    `Blockierend: ${blocking.length}`,
    `Warnungen: ${warnings.length}`,
    "",
    "## Zähler",
    `- Regale: ${counts.shelves}`,
    `- Eingänge: ${counts.entrances}`,
    `- Produkte: ${counts.products}`,
    `- Beacons platziert: ${counts.placedBeacons}`,
    `- Beacons zugewiesen: ${counts.assignedBeacons}`,
    `- Beacon-Registrierung: ${beaconConsistencyText(report)}`,
    `- Abdeckung: ${coverageSummary(report)}`,
    "",
    `## Blockierend (${blocking.length})`,
    ...(blocking.length ? blocking.map(findingLine) : ["Keine blockierenden Punkte."]),
    "",
    `## Warnungen (${warnings.length})`,
    ...(warnings.length ? warnings.map(findingLine) : ["Keine Warnungen."]),
    ""
  ];
  return lines.join("\n");
}
