import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { loadDocument } from "./check-parity.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const reviewedPath = resolve(here, "..", "..", "openspec/specs/shared-api/openapi.yaml");

test("export-mobile-openapi output is reproducible and filtered to ios", async () => {
  const { buildMobileDocument, renderMobile, OUTPUT } = await import("../export-mobile-openapi.mjs");
  const reviewed = loadDocument(reviewedPath);
  const mobile = buildMobileDocument(reviewed);
  const methods = ["get", "put", "post", "delete", "patch"];
  for (const item of Object.values(mobile.paths)) {
    for (const method of methods.filter(m => item[m])) {
      assert.ok(Object.keys(item[method]).every(key => !key.startsWith("x-indooro-")), "x-indooro-* left on operation");
    }
  }
  const json = JSON.stringify(mobile);
  for (const ref of json.match(/#\/components\/[a-z]+\/[A-Za-z0-9_]+/g) ?? []) {
    const [, , kind, name] = ref.split("/");
    assert.ok(mobile.components?.[kind]?.[name], `dangling ref ${ref}`);
  }
  assert.equal(renderMobile(reviewed), readFileSync(OUTPUT, "utf8"), "api/openapi/indooro-mobile.yaml is stale");
});

test("export-mobile-openapi detects a changed reviewed contract", async () => {
  const { renderMobile, OUTPUT } = await import("../export-mobile-openapi.mjs");
  const mutated = loadDocument(reviewedPath);
  for (const item of Object.values(mutated.paths)) {
    for (const op of Object.values(item)) {
      if (op?.["x-indooro-consumers"]?.includes("ios")) {
        op["x-indooro-consumers"] = op["x-indooro-consumers"].filter(c => c !== "ios");
        break;
      }
    }
  }
  assert.notEqual(renderMobile(mutated), readFileSync(OUTPUT, "utf8"));

  const cli = spawnSync(process.execPath, [resolve(here, "..", "export-mobile-openapi.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
});
