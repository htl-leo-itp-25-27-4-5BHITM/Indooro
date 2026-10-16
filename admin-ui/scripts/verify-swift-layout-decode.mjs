import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const storeId = process.argv[2];
assert.match(storeId ?? "", /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Pass a store UUID: npm run test:swift-layout -- <store-id>");
const origin = process.env.ADMIN_SMOKE_BASE_URL ?? "http://127.0.0.1:8080";
const response = await fetch(new URL(`/api/mobile/stores/${storeId}/layout/current`, origin));
assert.equal(response.status, 200, `Public current layout returned HTTP ${response.status}`);
const body = await response.text();
const models = resolve(dirname(fileURLToPath(import.meta.url)), "../../swift/indooro-EinkaeuferFinal/indooroApp/Models");
const temporary = mkdtempSync(join(tmpdir(), "indooro-swift-layout-"));

try {
  const fixture = join(temporary, "current-layout.json");
  const probe = join(temporary, "main.swift");
  const executable = join(temporary, "decode-layout");
  writeFileSync(fixture, body);
  writeFileSync(probe, `import Foundation
let data = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))
let response = try JSONDecoder().decode(MobileLayoutResponse.self, from: data)
precondition(!response.layout.elements.isEmpty)
precondition(response.layout.elements.allSatisfy { $0.id > 0 })
print("Swift MobileLayoutResponse decoded \\(response.layout.elements.count) elements with numeric IDs")
`);
  execFileSync("swiftc", [join(models, "../Managers/IndooroAPI.swift"), join(models, "LayoutData.swift"), join(models, "MobileStoreModels.swift"), probe, "-o", executable], { stdio: "inherit" });
  execFileSync(executable, [fixture], { stdio: "inherit" });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
