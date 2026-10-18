#!/usr/bin/env node
// Normalized parity between the generated OpenAPI document and the reviewed contract.
// Usage: node scripts/contract/check-parity.mjs <generated.json|yaml> [reviewed.yaml] [known-diffs.json]
// Compared: operation set, operationId, first tag, parameters (name/in/required), requestBody presence and
// content types, and property names and required lists of component schemas present in both documents.
// Ignored: x-* keys, descriptions, summaries, examples and response codes (generated annotations are sparse).
// Exit 1 when a difference is not listed in the known-diffs file (each entry: {"difference", "reason"}).
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_REVIEWED = resolve(repoRoot, "openspec/specs/shared-api/openapi.yaml");
const DEFAULT_KNOWN = resolve(repoRoot, "scripts/contract/parity-known-diffs.json");

export function loadDocument(file) {
  const text = readFileSync(file, "utf8");
  return file.endsWith(".json") ? JSON.parse(text) : parse(text);
}

function deref(doc, node) {
  let current = node;
  for (let hops = 0; current && current.$ref && hops < 20; hops++) {
    const segments = current.$ref.replace(/^#\//, "").split("/").map(s => s.replace(/~1/g, "/").replace(/~0/g, "~"));
    current = segments.reduce((acc, key) => acc?.[key], doc);
  }
  return current;
}

function operationsOf(doc) {
  const ops = new Map();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const shared = (item.parameters ?? []).map(p => deref(doc, p));
    for (const [method, op] of Object.entries(item)) {
      if (!METHODS.includes(method)) continue;
      const params = new Map();
      for (const p of [...shared, ...(op.parameters ?? []).map(p => deref(doc, p))]) {
        params.set(`${p.in}:${p.name}`, p.in === "path" ? true : p.required === true);
      }
      const body = op.requestBody ? deref(doc, op.requestBody) : null;
      ops.set(`${method.toUpperCase()} ${path}`, {
        operationId: op.operationId,
        tag: (op.tags ?? [])[0],
        params,
        contentTypes: body ? Object.keys(body.content ?? {}).sort() : null,
      });
    }
  }
  return ops;
}

// Property names and required names, following allOf/oneOf/anyOf one level of composition at a time.
function schemaShape(doc, schema, depth = 0) {
  const shape = { properties: new Set(), required: new Set() };
  const node = deref(doc, schema);
  if (!node || typeof node !== "object" || depth > 6) return shape;
  for (const name of Object.keys(node.properties ?? {})) shape.properties.add(name);
  for (const name of node.required ?? []) shape.required.add(name);
  for (const key of ["allOf", "oneOf", "anyOf"]) {
    for (const member of node[key] ?? []) {
      const inner = schemaShape(doc, member, depth + 1);
      inner.properties.forEach(p => shape.properties.add(p));
      inner.required.forEach(r => shape.required.add(r));
    }
  }
  return shape;
}

function diffSets(label, generated, reviewed, out) {
  for (const item of reviewed) if (!generated.has(item)) out.push(`${label} only in reviewed: ${item}`);
  for (const item of generated) if (!reviewed.has(item)) out.push(`${label} only in generated: ${item}`);
}

export function diffDocuments(generatedDoc, reviewedDoc) {
  const diffs = [];
  const stats = { operations: 0, parameters: 0, bodies: 0, schemas: 0, properties: 0 };
  const gen = operationsOf(generatedDoc);
  const rev = operationsOf(reviewedDoc);

  for (const key of rev.keys()) if (!gen.has(key)) diffs.push(`missing operation: ${key}`);
  // Test-only probe resources (src/test) are part of the generated document during the export but not of the API.
  const isTestProbe = key => /^[A-Z]+ \/api\/test-[a-z-]*probe\//.test(key);
  for (const key of gen.keys()) if (!rev.has(key) && !isTestProbe(key)) diffs.push(`extra operation: ${key}`);

  for (const [key, r] of rev) {
    const g = gen.get(key);
    if (!g) continue;
    stats.operations++;
    if (g.operationId !== r.operationId) diffs.push(`operationId ${key}: generated=${g.operationId} reviewed=${r.operationId}`);
    if (g.tag !== r.tag) diffs.push(`first tag ${key}: generated=${g.tag} reviewed=${r.tag}`);

    stats.parameters += r.params.size;
    for (const [param, required] of r.params) {
      if (!g.params.has(param)) diffs.push(`parameter ${key}: missing in generated: ${param}`);
      else if (g.params.get(param) !== required) {
        diffs.push(`parameter ${key}: required flag ${param} generated=${g.params.get(param)} reviewed=${required}`);
      }
    }
    for (const param of g.params.keys()) if (!r.params.has(param)) diffs.push(`parameter ${key}: extra in generated: ${param}`);

    if (g.contentTypes === null || r.contentTypes === null) {
      if (g.contentTypes !== r.contentTypes) {
        diffs.push(`requestBody ${key}: generated=${g.contentTypes ? "present" : "absent"} reviewed=${r.contentTypes ? "present" : "absent"}`);
      }
    } else {
      stats.bodies++;
      const same = g.contentTypes.join(",") === r.contentTypes.join(",");
      if (!same) diffs.push(`requestBody content types ${key}: generated=[${g.contentTypes}] reviewed=[${r.contentTypes}]`);
    }
  }

  const genSchemas = generatedDoc.components?.schemas ?? {};
  const revSchemas = reviewedDoc.components?.schemas ?? {};
  for (const name of Object.keys(revSchemas)) {
    if (!(name in genSchemas)) continue;
    stats.schemas++;
    const g = schemaShape(generatedDoc, genSchemas[name]);
    const r = schemaShape(reviewedDoc, revSchemas[name]);
    stats.properties += r.properties.size;
    diffSets(`schema ${name} property`, g.properties, r.properties, diffs);
    diffSets(`schema ${name} required`, g.required, r.required, diffs);
  }
  return { diffs, stats };
}

export function applyKnown(diffs, known) {
  const knownSet = new Set(known.map(entry => entry.difference));
  const unknown = diffs.filter(d => !knownSet.has(d));
  const observed = new Set(diffs);
  const stale = known.filter(entry => !observed.has(entry.difference));
  return { unknown, stale, known: diffs.length - unknown.length };
}

function main(argv) {
  const [generatedPath, reviewedPath = DEFAULT_REVIEWED, knownPath = DEFAULT_KNOWN] = argv;
  if (!generatedPath) {
    console.error("usage: check-parity.mjs <generated.json|yaml> [reviewed.yaml] [known-diffs.json]");
    return 2;
  }
  const { diffs, stats } = diffDocuments(loadDocument(generatedPath), loadDocument(reviewedPath));
  const known = JSON.parse(readFileSync(knownPath, "utf8"));
  const { unknown, stale, known: knownCount } = applyKnown(diffs, known);

  for (const d of diffs) console.log(`${unknown.includes(d) ? "FAIL" : "known"} ${d}`);
  for (const entry of stale) console.log(`WARN stale known diff (no longer observed): ${entry.difference}`);
  console.log(`compared: ${stats.operations} operations, ${stats.parameters} parameters, ${stats.bodies} request bodies, ` +
    `${stats.schemas} schemas, ${stats.properties} properties`);
  console.log(`differences: ${diffs.length} (known ${knownCount}, unknown ${unknown.length}, stale known ${stale.length})`);
  console.log(unknown.length === 0 ? "OK: generated document matches the reviewed contract" : "PARITY FAILED");
  return unknown.length === 0 ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
