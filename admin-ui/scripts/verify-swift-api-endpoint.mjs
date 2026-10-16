import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = mkdtempSync(join(tmpdir(), "indooro-swift-endpoint-"));

try {
  const probe = join(temporary, "main.swift");
  writeFileSync(probe, "import Foundation\nprint(IndooroAPI.baseURL)\n");
  for (const variant of ["indooro-", "indooro-EinkaeuferFinal"]) {
    const source = join(root, "swift", variant, "indooroApp/Managers/IndooroAPI.swift");
    for (const configuration of ["debug", "release"]) {
      const executable = join(temporary, `${variant}-${configuration}`);
      execFileSync("swiftc", [...(configuration === "debug" ? ["-D", "DEBUG"] : []), source, probe, "-o", executable], { stdio: "inherit" });
      const run = (override) => execFileSync(executable, [], {
        encoding: "utf8",
        env: { ...process.env, INDOORO_API_BASE_URL: override },
      }).trim();
      const production = "https://it220209.cloud.htl-leonding.ac.at/api";
      assert.equal(run(undefined), production);
      assert.equal(run("file:///tmp/api"), production);
      assert.equal(run("http://127.0.0.1:8080/not-api"), production);
      assert.equal(run("http://127.0.0.1:8080/api"), configuration === "debug" ? "http://127.0.0.1:8080/api" : production);
    }
  }
  console.log("Swift API base uses the local override only in valid Debug builds");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
