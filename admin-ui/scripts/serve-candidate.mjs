import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const resources = path.join(repository, "backend/indooro_server/src/main/resources/META-INF/resources");
const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

http.createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.resolve(resources, relative);
  if (target !== resources && !target.startsWith(resources + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const file = (await stat(target)).isDirectory() ? path.join(target, "index.html") : target;
    const data = await readFile(file);
    response.writeHead(200, { "content-type": contentTypes[path.extname(file)] ?? "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404).end();
  }
}).listen(4188, "127.0.0.1", () => console.log("Candidate static test server listening on 4188"));
