import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { mock, mockRoutes } from "./admin-smoke-mocks.mjs";

const root = join(process.cwd(), "backend/indooro_server/src/main/resources/META-INF/resources");
const port = Number(process.env.ADMIN_SMOKE_PORT || 4177);
const securityHeaders = {
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin"
};

const json = (response, body, status = 200) => {
  response.writeHead(status, { ...securityHeaders, "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
  const route = mockRoutes.find((entry) => entry.url === url.pathname && (entry.method === "GET" || entry.method === request.method));
  if (route) {
    route.onServe?.();
    return json(response, route.payload, route.status);
  }
  if (url.pathname === "/assets/data/categories.json") return json(response, mock.categories);

  let filePath = normalize(join(root, url.pathname));
  if (!filePath.startsWith(root)) {
    response.writeHead(403, securityHeaders);
    response.end("Forbidden");
    return;
  }
  if (url.pathname.endsWith("/")) filePath = join(filePath, "index.html");
  try {
    const bytes = await readFile(filePath);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
    response.writeHead(200, { ...securityHeaders, "content-type": types[extname(filePath)] || "application/octet-stream" });
    response.end(bytes);
  } catch {
    response.writeHead(404, securityHeaders);
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Admin smoke server on http://127.0.0.1:${port}`);
});
