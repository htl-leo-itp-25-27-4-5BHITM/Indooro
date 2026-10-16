import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { candidate, dist, nestedEntries } from "./candidate-paths.mjs";

const html = await readFile(path.join(dist, "index.html"), "utf8");
if (!html.includes("/admin/next/assets/")) {
  throw new Error("Vite output must reference /admin/next/assets/ before packaging");
}

await rm(candidate, { recursive: true, force: true });
await mkdir(candidate, { recursive: true });
await cp(dist, candidate, { recursive: true });
for (const entry of nestedEntries) {
  const directory = path.join(candidate, entry);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html);
}

console.log(`Packaged candidate admin assets at ${candidate}`);
