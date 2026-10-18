#!/usr/bin/env node
// Runs OpenApiExportTest (test profile) and leaves the generated document in
// backend/indooro_server/target/openapi/openapi.json. Ports are overridable so that
// parallel local sessions do not collide (CONTRACT_TEST_PORT, CONTRACT_TEST_SSL_PORT).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const backend = resolve(repoRoot, "backend", "indooro_server");
const port = Number(process.env.CONTRACT_TEST_PORT ?? 18095);
const sslPort = Number(process.env.CONTRACT_TEST_SSL_PORT ?? port + 1);

const result = spawnSync("sh", [
  "mvnw", "-q", "test",
  "-Dtest=OpenApiExportTest",
  "-DfailIfNoTests=false",
  `-Dquarkus.http.test-port=${port}`,
  `-Dquarkus.http.test-ssl-port=${sslPort}`,
], { cwd: backend, stdio: "inherit" });

if (result.status !== 0) {
  console.error(`export-generated: mvnw failed (exit ${result.status ?? result.signal})`);
  process.exit(result.status ?? 1);
}
console.log(`export-generated: ${resolve(backend, "target", "openapi", "openapi.json")}`);
