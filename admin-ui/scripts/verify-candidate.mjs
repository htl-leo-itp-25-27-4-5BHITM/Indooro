import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { candidate, dist, nestedEntries } from "./candidate-paths.mjs";

const rootHtml = await readFile(path.join(candidate, "index.html"), "utf8");
assert.equal(rootHtml, await readFile(path.join(dist, "index.html"), "utf8"));
assert.match(rootHtml, /\/admin\/next\/assets\//);
assert.doesNotMatch(rootHtml, /https?:\/\//);

for (const entry of nestedEntries) {
  assert.equal(await readFile(path.join(candidate, entry, "index.html"), "utf8"), rootHtml);
}

const assets = await readdir(path.join(dist, "assets"));
assert.ok(assets.length > 0, "Candidate must include built assets");
for (const asset of assets) {
  const source = path.join(dist, "assets", asset);
  const packaged = path.join(candidate, "assets", asset);
  assert.ok((await stat(packaged)).isFile());
  assert.deepEqual(await readFile(packaged), await readFile(source));
}

console.log(`Verified candidate entry, ${nestedEntries.length} nested entry, and ${assets.length} assets`);
