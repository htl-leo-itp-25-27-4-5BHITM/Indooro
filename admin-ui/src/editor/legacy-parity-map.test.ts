import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Unabhängig vom Arbeitsverzeichnis: dieses Modul liegt in admin-ui/src/editor.
const here = dirname(fileURLToPath(import.meta.url));
const adminUi = join(here, "..", "..");
const repoRoot = join(adminUi, "..");

const STATUSES = ["same", "changed", "removed", "candidate-only"];
const DECISIONS = ["none", "product-owner-2026-10-16", "accepted-improvement", "accepted-removed"];
const SCOPES = ["store", "global", "both"];

interface Evidence { file: string; test: string }
interface ParityEntry {
  legacy: string;
  legacyLabel: string;
  scope: string;
  status: string;
  candidate: string[];
  note: string;
  decision: string;
  evidence: Evidence[];
  gap?: string;
}

const entries = JSON.parse(readFileSync(join(here, "legacy-parity-map.json"), "utf8")) as ParityEntry[];
const legacyHtml = readFileSync(join(repoRoot, "backend/indooro_server/src/main/resources/META-INF/resources/admin/editor/index.html"), "utf8");
const candidateText = ["src/editor/LayoutEditor.tsx", "src/EditorRoute.tsx", "src/LegacyEditorRoute.tsx"]
  .map((path) => readFileSync(join(adminUi, path), "utf8"))
  .join("\n");

const isOpenGap = (entry: ParityEntry) => entry.gap !== undefined
  && !entry.decision.startsWith("accepted-")
  && !entry.decision.startsWith("product-owner-");

test("legacy parity map lists every element id of the legacy editor HTML", () => {
  const ids = [...legacyHtml.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 0, "keine ids in editor/index.html gefunden");
  const mapped = new Set(entries.map((entry) => entry.legacy));
  const missing = ids.filter((id) => !mapped.has(id));
  assert.deepEqual(missing, [], `Legacy-ids ohne Eintrag in legacy-parity-map.json: ${missing.join(", ")}`);
});

test("every entry uses allowed status, decision and scope values with unique keys", () => {
  const seen = new Set<string>();
  for (const entry of entries) {
    assert.ok(!seen.has(entry.legacy), `doppelter Schlüssel: ${entry.legacy}`);
    seen.add(entry.legacy);
    assert.ok(STATUSES.includes(entry.status), `${entry.legacy}: unbekannter status ${entry.status}`);
    assert.ok(DECISIONS.includes(entry.decision), `${entry.legacy}: unbekannte decision ${entry.decision}`);
    assert.ok(SCOPES.includes(entry.scope), `${entry.legacy}: unbekannter scope ${entry.scope}`);
    assert.ok(entry.legacyLabel.trim().length > 0, `${entry.legacy}: legacyLabel fehlt`);
    assert.ok(entry.note.trim().length > 0, `${entry.legacy}: note fehlt`);
    assert.ok(Array.isArray(entry.candidate), `${entry.legacy}: candidate ist kein Array`);
    if (entry.status === "removed") {
      assert.deepEqual(entry.candidate, [], `${entry.legacy}: removed braucht ein leeres candidate`);
    } else {
      assert.ok(entry.candidate.length > 0, `${entry.legacy}: nicht-removed braucht candidate-Texte`);
    }
    if (entry.gap !== undefined) {
      assert.ok(entry.gap.trim().length > 0, `${entry.legacy}: gap ist leer`);
    }
  }
});

test("candidate texts of non-removed entries appear verbatim in the candidate sources", () => {
  const missing: string[] = [];
  for (const entry of entries) {
    if (entry.status === "removed") continue;
    for (const text of entry.candidate) {
      if (!candidateText.includes(text)) missing.push(`${entry.legacy}: "${text}"`);
    }
  }
  assert.deepEqual(missing, [], `candidate-Texte nicht im Quelltext gefunden: ${missing.join("; ")}`);
});

test("every evidence entry names an existing test file and a title that occurs in it", () => {
  const problems: string[] = [];
  for (const entry of entries) {
    for (const evidence of entry.evidence) {
      const path = join(repoRoot, evidence.file);
      if (!existsSync(path)) {
        problems.push(`${entry.legacy}: Datei fehlt ${evidence.file}`);
        continue;
      }
      if (!readFileSync(path, "utf8").includes(evidence.test)) {
        problems.push(`${entry.legacy}: Testtitel nicht in ${evidence.file}: "${evidence.test}"`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});

test("every non-removed entry has evidence or a declared gap", () => {
  const uncovered = entries
    .filter((entry) => entry.status !== "removed" && entry.evidence.length === 0 && entry.gap === undefined)
    .map((entry) => entry.legacy);
  assert.deepEqual(uncovered, [], `ohne Nachweis und ohne gap: ${uncovered.join(", ")}`);
});

test("an entry with a declared gap is never marked same", () => {
  const wrong = entries.filter((entry) => entry.status === "same" && entry.gap !== undefined).map((entry) => entry.legacy);
  assert.deepEqual(wrong, [], `gap, aber status same: ${wrong.join(", ")}`);
});

test("open gaps fail unless a product-owner or accepted decision covers them", () => {
  const open = entries.filter(isOpenGap).map((entry) => `${entry.legacy}: ${entry.gap}`);
  assert.deepEqual(open, [], `offene Lücken (decision none):\n${open.join("\n")}`);
});
