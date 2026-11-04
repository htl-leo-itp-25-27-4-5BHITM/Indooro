// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { escapeHtml, renderReportHtml, sanitizeSvg } from "./renderHtml";
import { SYNTHETIC_BANNER, buildReportModel } from "./reportModel";
import { buildResultsJson, resultsToCsv } from "./exports";
import { ReportPreview } from "./ReportPreview";
import { makeCampaign, makeInput, makeMetrics, makeResult, makeRun } from "./fixtures";

afterEach(cleanup);

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(12)).toBe("12");
  });
});

describe("sanitizeSvg", () => {
  it("keeps plain svg and drops scripts, handlers and external links", () => {
    const dirty = `<svg xmlns="http://www.w3.org/2000/svg" onload="evil()"><script>alert(1)</script><foreignObject><div>x</div></foreignObject><a href="javascript:alert(1)"><circle onclick="x()" r="2"/></a><use href="#a"/><image href="http://x/y.png"/></svg>`;
    const clean = sanitizeSvg(dirty);
    expect(clean).toContain("<circle");
    expect(clean).not.toMatch(/script|foreignObject|onload|onclick|javascript:|http:\/\/x/i);
    expect(clean).toContain('href="#a"');
  });
  it("rejects non-svg input", () => {
    expect(sanitizeSvg("<div>hi</div>")).toBe("");
    expect(sanitizeSvg("<svg><circle/>")).toBe("");
  });
});

describe("renderReportHtml", () => {
  it("is a standalone A4 print document with header and footer", () => {
    const html = renderReportHtml(buildReportModel(makeInput()));
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@page{size:A4");
    expect(html).toContain("Indooro Positioning Lab – Messbericht");
    expect(html).toContain("deadbeefdead"); // config hash in footer
    expect(html).toContain("2026-11-21T09:30:00Z");
    expect(html).not.toContain("<script");
    expect(html).not.toContain(SYNTHETIC_BANNER);
  });
  it("contains the metric values from the input, not hardcoded ones", () => {
    const a = renderReportHtml(buildReportModel(makeInput()));
    expect(a).toContain("2.35 LE");
    const b = renderReportHtml(buildReportModel(makeInput({ results: [makeResult("r1", "real", { metrics: makeMetrics({ mean: 9.8765, rmse: 11.1111, within3: 0.123 }) })] })));
    expect(b).toContain("9.88 LE");
    expect(b).toContain("11.11 LE");
    expect(b).toContain("12.3 %");
    expect(b).not.toContain("2.35 LE");
  });
  it("shows the large synthetic banner when any synthetic run is included", () => {
    const html = renderReportHtml(buildReportModel(makeInput({ runs: [makeRun("r1"), makeRun("s1", "synthetic")], results: [makeResult("r1"), makeResult("s1", "synthetic")] })));
    expect(html).toContain(`class="banner"`);
    expect(html).toContain(SYNTHETIC_BANNER);
    expect(html).toContain(`class="strip"`);
  });
  it("escapes user text everywhere (XSS)", () => {
    const evil = `<img src=x onerror=alert(1)>`;
    const input = makeInput({
      campaign: makeCampaign({ name: evil, notes: evil, market: evil }),
      runs: [makeRun("r1", "real", { name: evil })],
      results: [makeResult("r1", "real", { runName: evil, warnings: [evil] })],
      interpretationNotes: evil,
      figures: [{ id: "f", title: evil, svg: `<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>`, caption: evil }],
    });
    const html = renderReportHtml(buildReportModel(input));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).not.toContain("<script");
  });
  it("renders the interpretation placeholder and the user text verbatim (escaped)", () => {
    expect(renderReportHtml(buildReportModel(makeInput()))).toContain("Keine Interpretation erfasst.");
    const h = renderReportHtml(buildReportModel(makeInput({ interpretationNotes: "Hypothese: A & B" })));
    expect(h).toContain("Hypothese: A &amp; B");
    expect(h).toContain("Interpretation des Teams – keine automatische Schlussfolgerung");
  });
  it("embeds sanitised figures", () => {
    const h = renderReportHtml(buildReportModel(makeInput({ figures: [{ id: "f1", title: "CDF", svg: `<svg xmlns="http://www.w3.org/2000/svg"><circle r="3"/></svg>`, caption: "Fehlerverteilung" }] })));
    expect(h).toContain("<circle");
    expect(h).toContain("Fehlerverteilung");
  });
});

describe("exports", () => {
  it("results JSON carries configs, hashes and metrics", () => {
    const json = JSON.parse(buildResultsJson(makeInput()));
    expect(json.results[0].configHash).toBe("deadbeef".repeat(8));
    expect(json.results[0].config.algorithm).toBe("weighted-centroid");
    expect(json.results[0].metrics.mean).toBe(2.3456);
    expect(json.hasSyntheticData).toBe(false);
    expect(json.results[0].estimates).toBeUndefined();
  });
  it("CSV has a header and one row per result with escaped cells", () => {
    const csv = resultsToCsv([makeResult("r1", "real", { runName: 'A, "B"' })]);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('"A, ""B"""');
    expect(lines[0].split(",").length).toBe(25);
  });
});

describe("ReportPreview", () => {
  it("renders a sandboxed iframe and triggers downloads through the callback", () => {
    const onDownload = vi.fn();
    render(<ReportPreview input={makeInput({ runs: [makeRun("s1", "synthetic")], results: [makeResult("s1", "synthetic")] })} onDownload={onDownload} />);
    const frame = screen.getByTitle("Berichtsvorschau") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).not.toContain("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain(SYNTHETIC_BANNER);
    fireEvent.click(screen.getByRole("button", { name: "HTML herunterladen" }));
    expect(onDownload).toHaveBeenCalledWith(expect.objectContaining({ mime: "text/html", fileName: expect.stringContaining("SYNTHETISCH") }));
    fireEvent.click(screen.getByRole("button", { name: "JSON-Ergebnisse herunterladen" }));
    const json = onDownload.mock.calls[1][0];
    expect(json.mime).toBe("application/json");
    expect(JSON.parse(json.content).results).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Drucken / als PDF speichern" })).toBeTruthy();
  });
});
