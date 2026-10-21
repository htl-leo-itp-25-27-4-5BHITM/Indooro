import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "./api/client";
import { parseReadinessReport, readinessPath, type ReadinessReport } from "./api/readiness";
import {
  beaconConsistencyFindings,
  beaconConsistencyText,
  coverageSummary,
  coverageText,
  describeReadinessError,
  groupFindings,
  INITIAL_RADIUS_FIELD,
  parseRadiusInput,
  radiusFieldAfterReport,
  radiusFieldApplied,
  radiusFieldTyped,
  profileLabel,
  readinessToMarkdown,
  ruleText,
  statusLabel
} from "./readiness";

const counts = { shelves: 12, entrances: 1, products: 340, placedBeacons: 4, assignedBeacons: 5, walkableCells: 300, lowCoverageCells: 12, skippedGlobalProducts: 0 };

const redReport: ReadinessReport = {
  storeId: "store-1",
  layoutId: "layout-1",
  layoutVersionNo: 3,
  radius: 8,
  status: "RED",
  blockingCount: 2,
  warningCount: 1,
  counts,
  profile: "market",
  coverageComputed: true,
  minBeaconsPerCell: 3,
  maxLowCoverageShare: 0.05,
  findings: [
    { severity: "BLOCKING", code: "PRODUCT_WITHOUT_SHELF", message: "Produkt hat keinen passenden Regalplatz.", elementId: null, productId: 42, layoutCode: "31/1/1/1", beaconCode: null },
    { severity: "WARNING", code: "BEACON_NOT_PLACED", message: "Beacon zugewiesen, aber nicht platziert.", elementId: null, productId: null, layoutCode: null, beaconCode: "B-002" },
    { severity: "BLOCKING", code: "SHELF_WITHOUT_LABEL", message: "Zielregal ohne Bezeichnung.", elementId: "17", productId: null, layoutCode: null, beaconCode: null }
  ]
};

const greenReport: ReadinessReport = {
  ...redReport,
  status: "GREEN",
  blockingCount: 0,
  warningCount: 0,
  findings: []
};

test("red report exports a checklist with blocking findings and their element and product ids", () => {
  const markdown = readinessToMarkdown(redReport, { storeName: "Indooro Linz", checkedOn: "16.10.2026" });
  assert.match(markdown, /^# Pilot-Bereitschaft: Indooro Linz\n/);
  assert.match(markdown, /Stand: 16\.10\.2026/);
  assert.match(markdown, /Ampel: Nicht bereit \(Rot\)/);
  assert.match(markdown, /Blockierend: 2\nWarnungen: 1/);
  assert.match(markdown, /## Blockierend \(2\)\n- \[ \] `PRODUCT_WITHOUT_SHELF` Produkt hat keinen passenden Regalplatz\. \(Produkt 42 · Layout-Code 31\/1\/1\/1\)/);
  assert.match(markdown, /- \[ \] `SHELF_WITHOUT_LABEL` Zielregal ohne Bezeichnung\. \(Element 17\)/);
  assert.match(markdown, /## Warnungen \(1\)\n- \[ \] `BEACON_NOT_PLACED` Beacon zugewiesen, aber nicht platziert\. \(Beacon B-002\)/);
  assert.match(markdown, /- Abdeckung: 12 von 300 begehbaren Zellen unter 3 Beacons \(4 %\)/);
  assert.doesNotMatch(markdown, /Keine blockierenden Punkte/);
});

test("green report exports an explicit zero blocking count and no checkboxes", () => {
  const markdown = readinessToMarkdown(greenReport, { storeName: "Indooro Linz", checkedOn: "16.10.2026" });
  assert.match(markdown, /Ampel: Bereit \(Grün\)/);
  assert.match(markdown, /^Blockierend: 0$/m);
  assert.match(markdown, /## Blockierend \(0\)\nKeine blockierenden Punkte\./);
  assert.match(markdown, /## Warnungen \(0\)\nKeine Warnungen\./);
  assert.doesNotMatch(markdown, /- \[ \]/);
});

test("export shows the layout state and radius and uses only the date it is given", () => {
  const noLayout: ReadinessReport = { ...greenReport, layoutId: null, layoutVersionNo: null, radius: 0.5 };
  const markdown = readinessToMarkdown(noLayout, { storeName: "Leer", checkedOn: "01.01.2030" });
  assert.match(markdown, /Layout: kein aktives Layout/);
  assert.match(markdown, /Beacon-Radius: 0,5 m/);
  assert.match(markdown, /Stand: 01\.01\.2030/);
  assert.doesNotMatch(readinessToMarkdown(redReport, { storeName: "A", checkedOn: "" }), /Stand: \d/);
});

test("findings are grouped by severity and keep the server order inside each group", () => {
  const { blocking, warnings } = groupFindings(redReport.findings);
  assert.deepEqual(blocking.map((finding) => finding.code), ["PRODUCT_WITHOUT_SHELF", "SHELF_WITHOUT_LABEL"]);
  assert.deepEqual(warnings.map((finding) => finding.code), ["BEACON_NOT_PLACED"]);
  assert.deepEqual(groupFindings([]), { blocking: [], warnings: [] });
});

test("traffic light texts state the readiness without relying on colour", () => {
  assert.equal(statusLabel("RED"), "Nicht bereit");
  assert.equal(statusLabel("YELLOW"), "Bereit mit Hinweisen");
  assert.equal(statusLabel("GREEN"), "Bereit");
});

test("coverage text handles layouts without walkable cells", () => {
  assert.equal(coverageText({ walkableCells: 0, lowCoverageCells: 0 }), "Keine begehbaren Zellen");
  assert.equal(coverageText({ walkableCells: 200, lowCoverageCells: 0 }), "0 von 200 begehbaren Zellen unter 3 Beacons (0 %)");
  assert.equal(coverageText({ walkableCells: 564, lowCoverageCells: 563 }), "563 von 564 begehbaren Zellen unter 3 Beacons (99,8 %)");
});

test("radius input accepts German and English decimals inside 0.5 to 30 metres", () => {
  assert.deepEqual(parseRadiusInput("8.0"), { radius: 8 });
  assert.deepEqual(parseRadiusInput(" 8,5 "), { radius: 8.5 });
  assert.deepEqual(parseRadiusInput("30"), { radius: 30 });
  const tooSmall = parseRadiusInput("0.4");
  assert.ok("error" in tooSmall);
  assert.match(tooSmall.error, /0,5 und 30/);
  assert.ok("error" in parseRadiusInput("30.1"));
  assert.ok("error" in parseRadiusInput("acht"));
});

test("readiness request without a radius leaves the default to the store's profile and encodes the store id", () => {
  assert.equal(readinessPath("store 1"), "/api/stores/store%201/readiness");
  assert.equal(readinessPath("store 1", null), "/api/stores/store%201/readiness");
  assert.equal(readinessPath("store-1", 12.5), "/api/stores/store-1/readiness?radius=12.5");
});

test("error states map forbidden and unauthorized responses to clear German texts", () => {
  assert.deepEqual(describeReadinessError(new ApiClientError("forbidden", 403, "x")), {
    kind: "forbidden", title: "Zugriff verweigert", message: "Kein Zugriff auf diesen Markt."
  });
  assert.equal(describeReadinessError(new ApiClientError("unauthorized", 401, "x")).kind, "unauthorized");
  assert.equal(describeReadinessError(new ApiClientError("server", 500, "Serverfehler. Bitte später erneut versuchen.")).kind, "retryable");
  assert.equal(describeReadinessError(new TypeError("boom")).message, "Die Prüfung konnte nicht geladen werden.");
});

test("server payloads must match the report shape", () => {
  assert.equal(parseReadinessReport(redReport).findings.length, 3);
  assert.throws(() => parseReadinessReport({ ...redReport, status: "PINK" }), ApiClientError);
  assert.throws(() => parseReadinessReport({ ...redReport, findings: [{ severity: "INFO" }] }), ApiClientError);
  assert.throws(() => parseReadinessReport({ ...redReport, counts: { shelves: 1 } }), ApiClientError);
});

test("profile labels name the known profiles and show unknown ids as they are", () => {
  assert.equal(profileLabel("market"), "Markt");
  assert.equal(profileLabel("testroom"), "Testraum");
  assert.equal(profileLabel("kiosk"), "kiosk");
});

test("rule text states beacons, radius and the allowed share, or nothing when the values are unknown", () => {
  assert.equal(ruleText(redReport), "mindestens 3 Beacons im Radius 8 m, höchstens 5 % der begehbaren Zellen darunter");
  assert.equal(ruleText({ ...redReport, radius: 10, maxLowCoverageShare: 0.075 }), "mindestens 3 Beacons im Radius 10 m, höchstens 7,5 % der begehbaren Zellen darunter");
  assert.equal(ruleText({ ...redReport, minBeaconsPerCell: null }), null);
  assert.equal(ruleText({ ...redReport, maxLowCoverageShare: null }), null);
});

test("coverage is never shown as a result when it was not computed", () => {
  const notComputed = { ...redReport, coverageComputed: false, counts: { ...counts, walkableCells: 0, lowCoverageCells: 0, skippedGlobalProducts: 0 } };
  assert.equal(coverageSummary(notComputed), "Abdeckung nicht berechnet");
  assert.equal(coverageSummary(redReport), coverageText(counts));
  const markdown = readinessToMarkdown(notComputed, { storeName: "A", checkedOn: "" });
  assert.match(markdown, /- Abdeckung: Abdeckung nicht berechnet/);
  assert.doesNotMatch(markdown, /Keine begehbaren Zellen/);
});

test("markdown export names the coverage profile and its rule", () => {
  const testroom = { ...redReport, profile: "testroom", radius: 10 };
  const markdown = readinessToMarkdown(testroom, { storeName: "Testraum", checkedOn: "" });
  assert.match(markdown, /Abdeckungsprofil: Testraum/);
  assert.match(markdown, /Abdeckungsregel: mindestens 3 Beacons im Radius 10 m, höchstens 5 %/);
  assert.doesNotMatch(readinessToMarkdown({ ...redReport, minBeaconsPerCell: null }, { storeName: "A", checkedOn: "" }), /Abdeckungsregel/);
});

test("report parsing reads profile and rule values and stays honest for older servers", () => {
  const withProfile = parseReadinessReport({ ...redReport, profile: "testroom", coverageComputed: false });
  assert.equal(withProfile.profile, "testroom");
  assert.equal(withProfile.coverageComputed, false);
  assert.equal(withProfile.minBeaconsPerCell, 3);
  const legacy = Object.fromEntries(Object.entries(redReport).filter(([key]) => !["profile", "coverageComputed", "minBeaconsPerCell", "maxLowCoverageShare"].includes(key)));
  const parsed = parseReadinessReport(legacy);
  assert.equal(parsed.profile, "market");
  assert.equal(parsed.coverageComputed, true);
  assert.equal(parsed.minBeaconsPerCell, null);
  assert.equal(parsed.maxLowCoverageShare, null);
  const legacyEmpty = parseReadinessReport({ ...legacy, counts: { ...counts, walkableCells: 0, lowCoverageCells: 0, skippedGlobalProducts: 0 } });
  assert.equal(legacyEmpty.coverageComputed, false);
});

const zeroUuidFinding = { severity: "BLOCKING", code: "BEACON_UUID_ALL_ZERO", message: "Registriertes Beacon Indooro5 hat die UUID 0.", elementId: null, productId: null, layoutCode: null, beaconCode: "Indooro5" } as const;
const mismatchFinding = { severity: "BLOCKING", code: "BEACON_IDENTITY_MISMATCH", message: "Layout und Registrierung weichen ab.", elementId: "b1", productId: null, layoutCode: null, beaconCode: "Indooro5" } as const;

test("beacon consistency findings are picked out by their codes", () => {
  const all = [...redReport.findings, zeroUuidFinding, mismatchFinding];
  assert.deepEqual(beaconConsistencyFindings(all).map((finding) => finding.code), ["BEACON_UUID_ALL_ZERO", "BEACON_IDENTITY_MISMATCH"]);
  assert.deepEqual(beaconConsistencyFindings(redReport.findings), []);
});

test("beacon consistency text names deviations and does not claim consistency without beacons", () => {
  assert.equal(beaconConsistencyText({ counts, findings: [zeroUuidFinding] }), "1 Abweichung zwischen Registrierung und Layout");
  assert.equal(beaconConsistencyText({ counts, findings: [zeroUuidFinding, mismatchFinding] }), "2 Abweichungen zwischen Registrierung und Layout");
  assert.equal(beaconConsistencyText({ counts, findings: [] }), "Registrierung und Layout stimmen überein");
  assert.equal(beaconConsistencyText({ counts: { ...counts, placedBeacons: 0, assignedBeacons: 0 }, findings: [] }), "Keine Beacons zum Vergleichen");
});

test("markdown export lists the beacon registry state", () => {
  assert.match(readinessToMarkdown({ ...redReport, findings: [zeroUuidFinding] }, { storeName: "A", checkedOn: "" }), /- Beacon-Registrierung: 1 Abweichung zwischen/);
  assert.match(readinessToMarkdown(greenReport, { storeName: "A", checkedOn: "" }), /- Beacon-Registrierung: Registrierung und Layout stimmen überein/);
});

test("radius field shows the radius of the profile of the first report", () => {
  const market = radiusFieldAfterReport(INITIAL_RADIUS_FIELD, { radius: 8, profile: "market" });
  assert.deepEqual(market, { input: "8.0", radius: null, touched: false, profile: "market" });
  const testroom = radiusFieldAfterReport(INITIAL_RADIUS_FIELD, { radius: 10, profile: "testroom" });
  assert.equal(testroom.input, "10.0");
  assert.equal(testroom.radius, null);
});

test("radius field follows a profile change while the user has not touched it", () => {
  const market = radiusFieldAfterReport(INITIAL_RADIUS_FIELD, { radius: 8, profile: "market" });
  const testroom = radiusFieldAfterReport(market, { radius: 10, profile: "testroom" });
  assert.equal(testroom.input, "10.0");
  assert.equal(testroom.radius, null);
});

test("a radius the user applied wins until the profile changes", () => {
  const first = radiusFieldAfterReport(INITIAL_RADIUS_FIELD, { radius: 10, profile: "testroom" });
  const applied = radiusFieldApplied(radiusFieldTyped(first, "6,5"), 6.5);
  assert.deepEqual(applied, { input: "6.5", radius: 6.5, touched: true, profile: "testroom" });
  // The report for the applied radius does not overwrite the input.
  const sameProfile = radiusFieldAfterReport(applied, { radius: 6.5, profile: "testroom" });
  assert.deepEqual(sameProfile, applied);
  // A report with another profile drops the manual radius and asks for the profile default.
  const changed = radiusFieldAfterReport(applied, { radius: 6.5, profile: "market" });
  assert.equal(changed.radius, null);
  assert.equal(changed.touched, false);
  assert.equal(changed.profile, "market");
  const defaultReport = radiusFieldAfterReport(changed, { radius: 8, profile: "market" });
  assert.equal(defaultReport.input, "8.0");
});

test("typed but not applied input is kept when a report arrives", () => {
  const first = radiusFieldAfterReport(INITIAL_RADIUS_FIELD, { radius: 8, profile: "market" });
  const typed = radiusFieldTyped(first, "12");
  assert.equal(radiusFieldAfterReport(typed, { radius: 8, profile: "market" }).input, "12");
});

test("report parsing reads the skipped global products and treats an older server as none skipped", () => {
  const withSkipped = parseReadinessReport({ ...redReport, counts: { ...redReport.counts, skippedGlobalProducts: 79 } });
  assert.equal(withSkipped.counts.skippedGlobalProducts, 79);
  const oldCounts: Record<string, number> = { ...redReport.counts };
  delete oldCounts.skippedGlobalProducts;
  assert.equal(parseReadinessReport({ ...redReport, counts: oldCounts }).counts.skippedGlobalProducts, 0);
});

test("markdown export names skipped global products only when there are some", () => {
  const skipped = { ...redReport, counts: { ...redReport.counts, skippedGlobalProducts: 79 } };
  assert.match(readinessToMarkdown(skipped, { storeName: "A", checkedOn: "" }), /- Globale Produkte nicht geprüft: 79/);
  assert.doesNotMatch(readinessToMarkdown(redReport, { storeName: "A", checkedOn: "" }), /Globale Produkte/);
});
