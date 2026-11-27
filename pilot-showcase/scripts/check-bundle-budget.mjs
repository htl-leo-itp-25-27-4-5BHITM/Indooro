import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const app = fileURLToPath(new URL("../", import.meta.url));
const dist = path.resolve(app, process.argv[2] ?? "dist");
const budgets = JSON.parse(await readFile(new URL("./bundle-budget.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(path.join(dist, ".vite/manifest.json"), "utf8"));
const initial = new Set();
const visited = new Set();
function visit(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Missing manifest import: ${key}`);
  if (chunk.file.endsWith(".js")) initial.add(chunk.file);
  for (const dependency of chunk.imports ?? []) visit(dependency);
}
const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
if (!entries.length) throw new Error("Build manifest contains no entry points");
for (const [key] of entries) visit(key);

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  }));
  return nested.flat();
}
// Count every emitted JS file, including workers and deferred chunks, exactly once.
const totals = { initialJS: { raw: 0, gzip: 0 }, totalJS: { raw: 0, gzip: 0 }, css: { raw: 0, gzip: 0 } };
const measured = new Set();
console.log("| Chunk | Raw bytes | Gzip bytes | Initial JS |\n| --- | ---: | ---: | :---: |");
for (const file of (await files(dist)).sort()) {
  if (!/\.(js|css)$/.test(file)) continue;
  const name = path.relative(dist, file).split(path.sep).join("/");
  measured.add(name);
  const content = await readFile(file);
  const sizes = { raw: content.length, gzip: gzipSync(content).length };
  const group = file.endsWith(".js") ? "totalJS" : "css";
  for (const metric of ["raw", "gzip"]) {
    totals[group][metric] += sizes[metric];
    if (initial.has(name)) totals.initialJS[metric] += sizes[metric];
  }
  console.log(`| ${name} | ${sizes.raw} | ${sizes.gzip} | ${initial.has(name) ? "yes" : ""} |`);
}
for (const name of initial) {
  if (!measured.has(name)) throw new Error(`Missing initial asset: ${name}`);
}
for (const [group, sizes] of Object.entries(totals)) {
  if (!sizes.raw) throw new Error(`No assets counted for ${group}`);
  console.log(`| **${group}** | **${sizes.raw}** | **${sizes.gzip}** | |`);
  for (const metric of ["raw", "gzip"]) {
    const limit = budgets[group]?.[metric];
    if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error(`Invalid budget: ${group}.${metric}`);
    if (sizes[metric] > limit) {
      console.error(`${group}.${metric}: ${sizes[metric]} exceeds budget ${limit} bytes`);
      process.exitCode = 1;
    }
  }
}
