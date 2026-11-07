#!/usr/bin/env node
// Bereitet den lokalen Full-Run vor. Aufruf (aus admin-ui, damit tsx die TS-Quellen laedt):
//   cd admin-ui && node --import tsx ../scripts/ops/full_run/prepare.mjs --dataset ../docs/pilot-readiness/kit/demo --out /tmp/out
// oder mit Einzelparametern: --layout --csv --error-csv --store-code --out
//
// Es wird der ECHTE Produktionscode des Admin-UI benutzt:
//   - parseImportedDocument / createEditorState (Editor-JSON-Import, src/editor/model.ts)
//   - reviewCsvImport (src/catalogCsvImport.ts)
//   - runCatalogImport (src/catalogImportRunner.ts), mit aufzeichnendem post()-Adapter. So entsteht
//     der Body inkl. Blockbildung und Idempotency-Key genau so, wie ihn die Oberflaeche sendet.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, "../../../admin-ui/src");
const { parseImportedDocument, createEditorState } = await import(path.join(ui, "editor/model.ts"));
const { reviewCsvImport, newImportKey } = await import(path.join(ui, "catalogCsvImport.ts"));
const { runCatalogImport, BULK_PATH } = await import(path.join(ui, "catalogImportRunner.ts"));

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`Ungueltiges Argument: ${argv[i]}`);
    out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

function fail(message) {
  console.error(`PREPARE FEHLER: ${message}`);
  process.exit(1);
}

const opts = args(process.argv.slice(2));
if (!opts.out) fail("--out fehlt");

let manifest = {};
let baseDir = process.cwd();
if (opts.dataset) {
  const file = opts.dataset.endsWith(".json") ? opts.dataset : path.join(opts.dataset, "dataset.json");
  manifest = JSON.parse(readFileSync(file, "utf8"));
  baseDir = path.dirname(path.resolve(file));
}
const files = manifest.files ?? {};
const resolveFile = (cli, fromManifest) => {
  const value = cli ?? fromManifest;
  if (!value) return null;
  return cli ? path.resolve(cli) : path.resolve(baseDir, value);
};
const layoutFile = resolveFile(opts.layout, files.layout);
const csvFile = resolveFile(opts.csv, files.csv);
const errorCsvFile = resolveFile(opts["error-csv"], files.errorCsv);
const storeCode = opts["store-code"] ?? manifest.store?.storeCode;
if (!layoutFile || !csvFile || !errorCsvFile || !storeCode) fail("layout, csv, error-csv und store-code werden benoetigt");
if (storeCode.length > 50) fail("storeCode ist laenger als 50 Zeichen");

// 1) Layout wie im Editor importieren. Gespeichert wird createEditorState(...).document.
let layout;
try {
  layout = createEditorState(parseImportedDocument(JSON.parse(readFileSync(layoutFile, "utf8")))).document;
} catch (error) {
  fail(`Layout wird vom Editor-Import abgelehnt: ${error.message}`);
}
const shelves = layout.elements.filter((e) => e.type === "shelf" && typeof e.category === "string" && e.category.trim());
const layoutBeaconCodes = layout.elements.filter((e) => e.type === "beacon").map((e) => String(e.beaconId));
const manifestBeacons = (manifest.beacons ?? []).map((b) => b.code);
const missing = layoutBeaconCodes.filter((code) => !manifestBeacons.includes(code));
if (missing.length) fail(`Layout-Beacons ohne Eintrag im Manifest: ${missing.join(", ")}`);

// 2) CSV pruefen wie die Oberflaeche (neuer, leerer Markt: keine vorhandenen IDs).
const context = { layout: { elements: layout.elements }, existingIds: new Set() };
const good = reviewCsvImport(new Uint8Array(readFileSync(csvFile)), context);
const bad = reviewCsvImport(new Uint8Array(readFileSync(errorCsvFile)), context);
if (good.errors.length) fail(`Gute CSV hat Fehler: ${JSON.stringify(good.errors)}`);
if (manifest.expectedProductCount !== undefined && good.products.length !== manifest.expectedProductCount) {
  fail(`Gute CSV liefert ${good.products.length} Produkte, erwartet ${manifest.expectedProductCount}`);
}
const expectedErrors = manifest.expectedErrors ?? [];
if (JSON.stringify(bad.errors) !== JSON.stringify(expectedErrors)) {
  fail(`Fehler-CSV: erwartet ${JSON.stringify(expectedErrors)}, erhalten ${JSON.stringify(bad.errors)}`);
}

// 3) Bulk-Bloecke mit dem Produktions-Runner erzeugen (Aufzeichnung statt HTTP).
const batches = [];
const okBody = (n) => ({ rows: Array.from({ length: n }, (_, i) => ({ row: i + 1, status: "saved", reason: null })) });
await runCatalogImport(good.products, {
  newKey: newImportKey,
  async post(requestPath, body, headers) {
    batches.push({ path: requestPath, idempotencyKey: headers["Idempotency-Key"], products: body });
    return { status: 200, body: okBody(body.length) };
  }
}, { storeCode });
if (batches.some((b) => !b.path.startsWith(`${BULK_PATH}?storeCode=`))) fail("Unerwarteter Bulk-Pfad");

const payload = {
  generatedBy: "scripts/ops/full_run/prepare.mjs",
  dataset: { ...manifest, store: { ...(manifest.store ?? {}), storeCode } },
  layoutSave: {
    layoutName: layout.shopName,
    changeNote: "Im neuen Layout-Editor als Entwurf gespeichert",
    activate: false,
    layout
  },
  goodImport: { counts: good.counts, batches },
  errorImport: { counts: bad.counts, errors: bad.errors, wouldSend: bad.errors.length === 0 },
  expectedErrors
};
mkdirSync(opts.out, { recursive: true });
writeFileSync(path.join(opts.out, "payload.json"), JSON.stringify(payload, null, 2) + "\n");

console.log(`Layout:    ${layout.shopName}, ${layout.elements.length} Elemente, ${shelves.length} Regale, ${layoutBeaconCodes.length} Beacons (${layoutBeaconCodes.join(", ")})`);
console.log(`Gute CSV:  ${good.counts.valid}/${good.counts.rows} gueltig, ${batches.length} Block/Bloecke, ${good.overwrites.length} Ueberschreibungen`);
console.log(`Fehler-CSV: ${bad.counts.valid} gueltig, ${bad.counts.invalid} ungueltig, Fehler: ${JSON.stringify(bad.errors)}`);
console.log(`payload.json geschrieben nach ${path.join(opts.out, "payload.json")}`);
