import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)),
  '../backend/indooro_server/src/main/resources/META-INF/resources');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Only deployed customer/landing assets are served. APIs belong to page.route fixtures.
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname}${pathname.endsWith('/') ? 'index.html' : ''}`);
    if (!file.startsWith(`${root}${sep}`) ||
        !(file === resolve(root, 'index.html') || file.startsWith(resolve(root, 'customer') + sep))) {
      response.writeHead(404).end('Not found');
      return;
    }
    const bytes = await readFile(file);
    response.writeHead(200, {
      'content-type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    }).end(bytes);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(4188, '127.0.0.1', () => console.log('Web quality server: http://127.0.0.1:4188'));
