// Servidor local que imita a Cloudflare Pages: /api/* y /directo → lib/router.js, estáticos de public/.
//   npm run dev:mock   → con datos falsos (contraseñas admin / setter)
//   npm run dev        → contra GHL real (lee las variables de .env)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const { route } = await import('../lib/router.js');
const root = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
// Base de datos local que imita a D1 (en memoria; D1_FILE=datos.sqlite para conservarla; NO_D1=1 para probar sin ella).
const { crearD1Local } = await import('../lib/d1-local.js');
const DB = process.env.NO_D1 === '1' ? null : crearD1Local(process.env.D1_FILE || ':memory:');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const port = Number(process.env.PORT || 3000);

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = url.pathname;
    if (path === '/__mock/sales' && process.env.GHL_MOCK === '1') {
      const { simulateSales } = await import('../lib/mock.js');
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ vip: simulateSales() }));
      return;
    }
    // Simula que una lead rellena la encuesta: /__mock/tag?cid=…&tag=…
    if (path === '/__mock/tag' && process.env.GHL_MOCK === '1') {
      const { addTags } = await import('../lib/mock.js');
      addTags(url.searchParams.get('cid'), [url.searchParams.get('tag')]);
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
      return;
    }
    if (path === '/directo' || path.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      const response = await route(request, DB ? { ...process.env, DB } : process.env);
      const headers = {};
      response.headers.forEach((v, k) => { headers[k] = v; });
      // En local (http) quitamos "Secure" para que el navegador guarde la cookie.
      const cookies = response.headers.getSetCookie().map((c) => c.replace('; Secure', ''));
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(response.status, headers);
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (path === '/') path = '/index.html';
    const file = normalize(join(root, 'public', path));
    if (!file.startsWith(join(root, 'public'))) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404).end('Not found'); return; }
    console.error(e);
    res.writeHead(500).end('Error');
  }
}).listen(port, () => console.log(`Dashboard en http://localhost:${port}${process.env.GHL_MOCK === '1' ? ' (datos de prueba)' : ''}`));
