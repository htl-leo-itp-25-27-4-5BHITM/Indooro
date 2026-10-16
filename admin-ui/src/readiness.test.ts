import assert from "node:assert/strict";
import test from "node:test";
import { ApiClientError } from "./api/client";
import { parseReadinessReport, readinessPath, type ReadinessReport } from "./api/readiness";
import {
  coverageText,
  describeReadinessError,
  groupFindings,
  parseRadiusInput,
  readinessToMarkdown,
  statusLabel
} from "./readiness";

const counts = { shelves: 12, entrances: 1, products: 340, placedBeacons: 4, assignedBeacons: 5, walkableCells: 300, lowCoverageCells: 12 };

const redReport: ReadinessReport = {
  storeId: "store-1",
  layoutId: "layout-1",
  layoutVersionNo: 3,
  radius: 8,
  status: "RED",
  blockingCount: 2,
  warningCount: 1,
  counts,
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

test("readiness request uses the default radius and encodes the store id", () => {
  assert.equal(readinessPath("store 1"), "/api/stores/store%201/readiness?radius=8");
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
