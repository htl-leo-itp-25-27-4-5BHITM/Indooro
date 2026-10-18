#!/usr/bin/env node
// Compares a generated OpenAPI document (e.g. target/openapi/openapi.yaml or .json)
// with the reviewed shared-api contract. Operations are matched by "METHOD path".
// Usage: node scripts/contract/compare-operation-ids.mjs <generated> [reviewed]
// Exits 1 on any difference in operations, operationIds, first tags or deprecated flags.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { parse } from "yaml";

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const generatedPath = process.argv[2];
const reviewedPath = process.argv[3] ?? resolve(repoRoot, "openspec/specs/shared-api/openapi.yaml");

if (!generatedPath) {
  console.error("usage: compare-operation-ids.mjs <generated-openapi> [reviewed-openapi]");
  process.exit(2);
}

function operationsOf(file) {
  const doc = parse(readFileSync(file, "utf8"));
  const ops = new Map();
  for (const [p, item] of Object.entries(doc.paths ?? {})) {
    for (const [m, op] of Object.entries(item ?? {})) {
      if (!METHODS.includes(m)) continue;
      ops.set(`${m.toUpperCase()} ${p}`, {
        operationId: op.operationId,
        tag: (op.tags ?? [])[0],
        deprecated: op.deprecated === true,
      });
    }
  }
  return ops;
}

const generated = operationsOf(generatedPath);
const reviewed = operationsOf(reviewedPath);

const missing = [...reviewed.keys()].filter(k => !generated.has(k));
const extra = [...generated.keys()].filter(k => !reviewed.has(k));
const mismatches = [];
for (const [k, r] of reviewed) {
  const g = generated.get(k);
  if (!g) continue;
  if (g.operationId !== r.operationId) mismatches.push(`${k}: operationId generated=${g.operationId} reviewed=${r.operationId}`);
  if (g.tag !== r.tag) mismatches.push(`${k}: tag generated=${g.tag} reviewed=${r.tag}`);
  if (g.deprecated !== r.deprecated) mismatches.push(`${k}: deprecated generated=${g.deprecated} reviewed=${r.deprecated}`);
}

console.log(`generated operations: ${generated.size}`);
console.log(`reviewed operations:  ${reviewed.size}`);
console.log(`missing from generated (${missing.length}):`);
for (const k of missing) console.log(`  - ${k} (${reviewed.get(k).operationId})`);
console.log(`extra in generated (${extra.length}):`);
for (const k of extra) console.log(`  + ${k} (${generated.get(k).operationId})`);
console.log(`attribute mismatches (${mismatches.length}):`);
for (const line of mismatches) console.log(`  ~ ${line}`);

const diffCount = missing.length + extra.length + mismatches.length;
console.log(diffCount === 0 ? "OK: generated document matches the reviewed contract" : `DIFFERENCES: ${diffCount}`);
process.exit(diffCount === 0 ? 0 : 1);
