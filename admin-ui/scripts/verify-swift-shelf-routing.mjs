import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const storeId = process.argv[2];
if (storeId) assert.match(storeId, /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Pass a store UUID");
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const variants = ["indooro-", "indooro-EinkaeuferFinal"];
const temporary = mkdtempSync(join(tmpdir(), "indooro-swift-routing-"));

try {
  const fixture = join(temporary, "collision-layout.json");
  writeFileSync(fixture, JSON.stringify({
    shopName: "Routing fixture",
    gridSize: { width: 40, height: 60 },
    elements: [
      { id: 1, type: "shelf", x: 2, y: 2, width: 2, height: 4, category: "310/1", meter: 1 },
      { id: 2, type: "shelf", x: 8, y: 2, width: 2, height: 4, category: "31/1", meter: 1 },
      { id: 3, type: "shelf", x: 14, y: 2, width: 2, height: 4, category: "310/2", meter: 2 },
    ],
  }));

  let liveFixture;
  if (storeId) {
    const origin = process.env.ADMIN_SMOKE_BASE_URL ?? "http://127.0.0.1:8080";
    const response = await fetch(new URL("/api/mobile/stores/" + storeId + "/layout/current", origin));
    assert.equal(response.status, 200, "Public current layout returned HTTP " + response.status);
    liveFixture = join(temporary, "current-layout.json");
    writeFileSync(liveFixture, await response.text());
  }

  const probe = join(temporary, "main.swift");
  writeFileSync(probe, [
    "import Foundation",
    "let fixture = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))",
    "let layout = try JSONDecoder().decode(LayoutData.self, from: fixture)",
    "func target(_ code: String, in elements: [LayoutElement]) -> Int64? {",
    "    elements.first(where: { $0.type != \"beacon\" && $0.matchesProductLayoutCode(code) })?.id",
    "}",
    "precondition(target(\"31/1/1/1\", in: layout.elements) == 2)",
    "precondition(target(\"310/1/1/1\", in: layout.elements) == 1)",
    "precondition(target(\"310/2/1/1\", in: layout.elements) == 3)",
    "precondition(target(\"31/2/1/1\", in: layout.elements) == nil)",
    "if CommandLine.arguments.count > 2 {",
    "    let live = try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2]))",
    "    let envelope = try JSONSerialization.jsonObject(with: live) as! [String: Any]",
    "    let currentData = try JSONSerialization.data(withJSONObject: envelope[\"layout\"] ?? envelope)",
    "    let current = try JSONDecoder().decode(LayoutData.self, from: currentData)",
    "    let shelves = current.elements.filter { $0.type == \"shelf\" && $0.categoryBase == \"310\" }",
    "    precondition(!shelves.isEmpty)",
    "    for shelf in shelves {",
    "        let code = \"310/\\(shelf.effectiveMeter ?? 1)/1/1\"",
    "        precondition(target(code, in: current.elements) == shelf.id)",
    "    }",
    "}",
    "print(\"Swift shelf routing resolves exact category and section\")",
  ].join("\n"));

  for (const variant of variants) {
    const models = join(root, "swift", variant, "indooroApp", "Models");
    const executable = join(temporary, "routing-" + variant);
    execFileSync("swiftc", [join(models, "LayoutData.swift"), join(models, "MobileStoreModels.swift"), probe, "-o", executable], { stdio: "inherit" });
    execFileSync(executable, [fixture, ...(liveFixture ? [liveFixture] : [])], { stdio: "inherit" });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
