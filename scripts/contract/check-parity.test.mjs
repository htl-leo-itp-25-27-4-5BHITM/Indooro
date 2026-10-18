import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { diffDocuments, loadDocument } from "./check-parity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const reviewedPath = resolve(repoRoot, "openspec/specs/shared-api/openapi.yaml");
const checker = resolve(here, "check-parity.mjs");

// The reviewed contract stands in for a generated document: an identical copy must produce no differences.
function reviewedAsGenerated() {
  return JSON.parse(JSON.stringify(loadDocument(reviewedPath)));
}

function runChecker(generatedDoc) {
  const dir = mkdtempSync(join(tmpdir(), "parity-"));
  const generated = join(dir, "openapi.json");
  writeFileSync(generated, JSON.stringify(generatedDoc));
  return spawnSync(process.execPath, [checker, generated], { encoding: "utf8" });
}

test("identical generated document has no differences", () => {
  const { diffs } = diffDocuments(reviewedAsGenerated(), loadDocument(reviewedPath));
  assert.deepEqual(diffs, []);
  const result = runChecker(reviewedAsGenerated());
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("renaming a documented field in the generated document fails the check", () => {
  const mutated = reviewedAsGenerated();
  const schema = mutated.components.schemas.MobileStoreSummary;
  schema.properties.storeCodeValue = schema.properties.storeCode;
  delete schema.properties.storeCode;

  const { diffs } = diffDocuments(mutated, loadDocument(reviewedPath));
  assert.ok(diffs.includes("schema MobileStoreSummary property only in generated: storeCodeValue"), diffs.join("\n"));
  assert.ok(diffs.includes("schema MobileStoreSummary property only in reviewed: storeCode"), diffs.join("\n"));

  const result = runChecker(mutated);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /FAIL schema MobileStoreSummary property only in generated: storeCodeValue/);
});

test("a missing operation in the generated document fails the check", () => {
  const mutated = reviewedAsGenerated();
  delete mutated.paths["/api/mobile/stores"].get;
  const result = runChecker(mutated);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /FAIL missing operation: GET \/api\/mobile\/stores/);
});

test("the committed known-diffs file has a reason for every entry", () => {
  const known = JSON.parse(readFileSync(resolve(here, "parity-known-diffs.json"), "utf8"));
  assert.ok(Array.isArray(known));
  for (const entry of known) {
    assert.equal(typeof entry.difference, "string");
    assert.ok(entry.reason && entry.reason.length > 0, `no reason for ${entry.difference}`);
    assert.doesNotMatch(entry.reason, /TODO drift/);
  }
});
