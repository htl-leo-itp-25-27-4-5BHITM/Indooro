import type { ReportBlock, ReportModel, ReportSection, ReportTable } from "./reportModel";

/** Escapes text for use in HTML element content and quoted attribute values. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Conservative SVG sanitiser for figures handed in as strings: only a root <svg> is accepted, active content
 * (script, foreignObject, iframe, event handlers, javascript:/data: links, external hrefs) is removed.
 * Returns "" if the input is not an SVG document.
 */
export function sanitizeSvg(svg: string): string {
  const s = svg.trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return "";
  return s
    .replace(/<\s*(script|foreignObject|iframe|object|embed|style|link|meta|audio|video|image)\b[\s\S]*?(<\/\s*\1\s*>|\/>)/gi, "")
    .replace(/<\s*(script|foreignObject|iframe|object|embed|style|link|meta|audio|video|image)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, (m, v: string) => (/^["']?#/.test(v) ? m : ""))
    .replace(/javascript:/gi, "");
}

const CSS = `
:root{--ink:#173047;--muted:#506779;--line:#dce5e9;--brand:#102a3b;--accent:#167768;--synthetic:#b45309;--amber:#e8b86d;--page:#f4f7f8}
*{box-sizing:border-box}
html{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);font-size:10pt;line-height:1.45}
body{margin:0;background:#fff;font-variant-numeric:tabular-nums}
@page{size:A4;margin:22mm 16mm 20mm}
.doc{max-width:182mm;margin:0 auto;padding:12mm 0}
.doc-header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid var(--brand);padding-bottom:4mm;margin-bottom:6mm}
.doc-header .brand{font-size:9pt;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);font-weight:700}
h1{font-size:20pt;margin:1mm 0 0;color:var(--brand);line-height:1.15}
.sub{color:var(--muted);font-size:9.5pt;margin-top:1mm}
h2{font-size:13pt;margin:0 0 3mm;color:var(--brand);border-bottom:1px solid var(--line);padding-bottom:1.5mm;break-after:avoid}
h2 .no{color:var(--accent);margin-right:2mm}
h3{font-size:10.5pt;margin:5mm 0 2mm;break-after:avoid}
section.sec{margin-bottom:8mm}
section.pb{break-before:page}
p{margin:0 0 2.5mm}
.banner{border:3px solid var(--synthetic);background:#fff4e8;color:var(--synthetic);font-weight:800;font-size:15pt;text-align:center;padding:5mm 4mm;margin:0 0 6mm;letter-spacing:.04em;text-transform:uppercase}
.strip{display:none}
.notice{border:1px solid var(--line);border-left:4px solid var(--accent);background:var(--page);padding:2.5mm 3.5mm;margin:0 0 3mm;font-size:9.5pt}
.notice.warning{border-left-color:var(--amber);background:#fdf6ea}
.notice.synthetic{border-left-color:var(--synthetic);background:#fff4e8;color:var(--synthetic);font-weight:700}
table{width:100%;border-collapse:collapse;margin:0 0 3mm;font-size:8.5pt}
caption{text-align:left;font-weight:600;font-size:9pt;margin-bottom:1.5mm;caption-side:top}
th,td{border:1px solid var(--line);padding:1.2mm 1.8mm;vertical-align:top;text-align:left}
th{background:var(--page);font-weight:600}
td.num,th.num{text-align:right}
tr{break-inside:avoid}
thead{display:table-header-group}
table.kv th{width:42mm;white-space:nowrap}
.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;font-size:7.5pt;word-break:break-all}
.note{color:var(--muted);font-size:8pt;margin:-1.5mm 0 3mm}
ul{margin:0 0 3mm;padding-left:5mm}
li{margin-bottom:1mm}
figure{margin:0 0 5mm;break-inside:avoid}
figure svg{max-width:100%;height:auto;border:1px solid var(--line)}
figcaption{font-size:8.5pt;color:var(--muted);margin-top:1mm}
.interp{white-space:pre-wrap}
.footer{margin-top:10mm;border-top:1px solid var(--line);padding-top:2mm;font-size:7.5pt;color:var(--muted)}
@media print{
  html{font-size:9.5pt}
  .doc{max-width:none;padding:0}
  .footer{position:fixed;left:0;right:0;bottom:-14mm;margin:0;background:#fff}
  .strip{display:block;position:fixed;left:0;right:0;top:-16mm;text-align:center;font-weight:800;font-size:8.5pt;color:#fff;background:var(--synthetic);padding:1mm 0;letter-spacing:.05em}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
@media screen{body{background:var(--page)}.doc{background:#fff;padding:14mm 14mm;margin:8mm auto;border:1px solid var(--line)}}
`;

function renderTable(t: ReportTable): string {
  const num = new Set(t.numericColumns ?? []);
  const head = t.headers.map((h, i) => `<th scope="col"${num.has(i) ? ' class="num"' : ""}>${escapeHtml(h)}</th>`).join("");
  const body = t.rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => {
            const mono = /^[0-9a-f]{32,}$/i.test(c);
            const cls = [num.has(i) ? "num" : "", mono ? "mono" : ""].filter(Boolean).join(" ");
            return `<td${cls ? ` class="${cls}"` : ""}>${escapeHtml(c)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  return `<table>${t.caption ? `<caption>${escapeHtml(t.caption)}</caption>` : ""}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${t.note ? `<p class="note">${escapeHtml(t.note)}</p>` : ""}`;
}

function renderBlock(b: ReportBlock, sectionId: string): string {
  switch (b.type) {
    case "heading":
      return `<h3>${escapeHtml(b.text)}</h3>`;
    case "paragraph":
      return `<p${sectionId === "interpretation" ? ' class="interp"' : ""}>${escapeHtml(b.text)}</p>`;
    case "bullets":
      return `<ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
    case "kv":
      return `<table class="kv"><tbody>${b.rows.map((r) => `<tr><th scope="row">${escapeHtml(r.key)}</th><td${/^[0-9a-f]{32,}$/i.test(r.value) ? ' class="mono"' : ""}>${escapeHtml(r.value)}</td></tr>`).join("")}</tbody></table>`;
    case "table":
      return renderTable(b.table);
    case "notice":
      return `<div class="notice ${b.tone}" role="note">${escapeHtml(b.text)}</div>`;
    case "figure": {
      const svg = sanitizeSvg(b.svg);
      return `<figure id="fig-${escapeHtml(b.id)}">${svg || `<p class="note">Abbildung nicht darstellbar (ungültiges SVG).</p>`}<figcaption><strong>${escapeHtml(b.title)}.</strong> ${escapeHtml(b.caption)}</figcaption></figure>`;
    }
  }
}

const PAGE_BREAK_BEFORE = new Set(["data", "procedure", "results", "limitations", "reproducibility"]);

function renderSection(s: ReportSection): string {
  return `<section class="sec${PAGE_BREAK_BEFORE.has(s.id) ? " pb" : ""}" id="sec-${escapeHtml(s.id)}"><h2><span class="no">${s.number}</span>${escapeHtml(s.title)}</h2>${s.blocks.map((b) => renderBlock(b, s.id)).join("")}</section>`;
}

/** Complete, standalone, print-optimised (A4) HTML document. All user-provided text is escaped. */
export function renderReportHtml(model: ReportModel): string {
  const banner = model.syntheticBanner;
  const hashes = model.configHashes.length ? model.configHashes.map((h) => h.slice(0, 12)).join(", ") : "–";
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Indooro Positioning Lab ${escapeHtml(model.toolVersion)}">
<title>${escapeHtml(model.title)} – ${escapeHtml(model.campaignName)}</title>
<style>${CSS}</style>
</head>
<body>
${banner ? `<div class="strip">${escapeHtml(banner)}</div>` : ""}
<main class="doc">
<header class="doc-header"><div><div class="brand">Indooro Positioning Lab</div><h1>${escapeHtml(model.title)}</h1><div class="sub">${escapeHtml(model.campaignName)}</div></div><div class="sub">Erstellt: ${escapeHtml(model.generatedAt)}<br>Version ${escapeHtml(model.toolVersion)}</div></header>
${banner ? `<div class="banner" role="alert">${escapeHtml(banner)}</div>` : ""}
${model.sections.map(renderSection).join("\n")}
<footer class="footer">Indooro Positioning Lab – Messbericht · configHash: ${escapeHtml(hashes)} · erstellt ${escapeHtml(model.generatedAt)}${banner ? ` · ${escapeHtml(banner)}` : ""}</footer>
</main>
</body>
</html>`;
}
