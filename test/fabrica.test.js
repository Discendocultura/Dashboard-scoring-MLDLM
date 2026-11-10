// 🏭 Fábrica de anuncios: ganadores por ventas reales, prompts por formato, lotes guardados y el conector
// (lote_anuncios / marcar_lote_anuncios) que usa Claude con Magnific y Google Drive.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { ganadoresDe, cambiosPara, promptVariacion, carpetaLote, instruccionesLote, fraseClaude, sanitizeLote } from '../public/js/fabrica.js';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await route(new Request(`http://localhost${path}`, {
    method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined,
  }), ENV);
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (password) => {
  const res = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV);
  return res.headers.get('set-cookie')?.split(';')[0];
};

const arbol = () => ({ campanas: [{ id: '100', nombre: 'Captación', hijos: [{ id: '200', nombre: 'Frío', hijos: [
  { id: '30001', nombre: 'Vídeo historia', m: { gasto: 100, ctrEnlace: 1.2, registros: 40 } },
  { id: '30002', nombre: 'Imagen testimonio', m: { gasto: 50, ctrEnlace: 2.5, registros: 30 } },
  { id: '30003', nombre: 'Sin gasto', m: { gasto: 0 } },
] }] }] });

test('ganadores: primero los que venden de verdad, con su ROAS real; fuera los que no gastan', () => {
  const ventas = [{ dia: '2026-11-01', importe: 300, tipo: 'directa', toque: { adId: '30002', source: 'facebook' } }];
  const g = ganadoresDe(arbol(), ventas, { desde: '2026-10-01', hasta: '2026-11-30' });
  assert.deepEqual(g.map((x) => x.id), ['30002', '30001']);
  assert.equal(g[0].ventas, 1);
  assert.equal(g[0].roasReal, 6);
  // Sin ventas, manda registros / CTR.
  assert.deepEqual(ganadoresDe(arbol(), []).map((x) => x.id), ['30001', '30002']);
  assert.deepEqual(ganadoresDe(null), []);
});

test('prompt: imagen con la original de referencia; vídeo con guion y stock', () => {
  assert.ok(cambiosPara('video').some((c) => c.id === 'stock'));
  assert.ok(!cambiosPara('imagen').some((c) => c.id === 'stock'));
  const pi = promptVariacion({ nombre: 'Imagen testimonio', tipo: 'imagen', imagen: 'https://x.test/a.jpg', texto: 'Aprende historia' }, { marca: { nombre: 'Discendo' }, n: 4, cambios: ['gancho'] });
  assert.match(pi, /4/);
  assert.match(pi, /https:\/\/x\.test\/a\.jpg/);
  assert.match(pi, /referencia/);
  const pv = promptVariacion({ nombre: 'Vídeo historia', tipo: 'video' }, { n: 2, cambios: ['stock'] });
  assert.match(pv, /guion/i);
  assert.match(pv, /stock/i);
});

test('lote: se limpia (ids de Meta, https, 1–10 variaciones) y sabe su carpeta de Drive', () => {
  const l = sanitizeLote({ nombre: 'Noviembre', clienteNombre: 'Discendo', embudoNombre: 'Lanzamiento/Roma', drive: 'javascript:alert(1)',
    items: [{ id: '30001', n: 50, cambios: ['gancho', 'inventado'], imagen: 'http://inseguro.test/a.jpg' }, { id: 'malo' }] }, { ahora: Date.UTC(2026, 10, 10) });
  assert.equal(l.items.length, 1);
  assert.equal(l.items[0].n, 10);
  assert.deepEqual(l.items[0].cambios, ['gancho']);
  assert.equal(l.items[0].imagen, '');
  assert.equal(l.drive, '');
  assert.equal(l.estado, 'pendiente');
  assert.deepEqual(carpetaLote(l), ['Anuncios', 'Discendo', 'Lanzamiento-Roma', '2026-11-10 - Noviembre']);
  assert.match(instruccionesLote(l), /marcar_lote_anuncios/);
  assert.match(instruccionesLote(l), /Drive/);
  assert.match(fraseClaude(l, 'discendo'), new RegExp(l.id));
});

test('recorrido: se guarda el lote, Claude lo lee por el conector y lo marca hecho con el enlace de Drive', async () => {
  const admin = await login('admin');
  const setter = await login('setter');
  const items = [{ id: '30001', nombre: 'Vídeo historia', tipo: 'video', n: 3, cambios: ['gancho'], prompt: 'PROMPT 1' }];
  // El setter no prepara lotes.
  assert.equal((await call('/api/fabrica', { method: 'POST', cookie: setter, body: { op: 'guardar', lote: { nombre: 'x', items } } })).status, 403);
  const g = await call('/api/fabrica', { method: 'POST', cookie: admin, body: { op: 'guardar', lote: { nombre: 'Lote 1', embudo: 'emb1', embudoNombre: 'Roma', items } } });
  assert.equal(g.status, 200);
  const id = g.data.lote.id;
  assert.equal((await call('/api/fabrica', { cookie: admin })).data.lotes[0].id, id);

  const { TOOLS } = await import('../lib/mcp-tools.js');
  const tool = (n) => TOOLS.find((t) => t.name === n);
  const r = await tool('lote_anuncios').run({}, { s: { role: 'admin' } });
  assert.equal(r.lote.id, id);
  assert.equal(r.anuncios[0].prompt, 'PROMPT 1');
  assert.match(r.carpetaDrive, /^Anuncios \/ .+ \/ Roma \/ \d{4}-\d{2}-\d{2} - Lote 1$/);
  assert.ok(tool('marcar_lote_anuncios').escribe);
  await tool('marcar_lote_anuncios').run({ lote: id, drive: 'https://drive.google.com/drive/folders/abc' }, { s: { role: 'admin' } });
  const l = (await call('/api/fabrica', { cookie: admin })).data.lotes[0];
  assert.equal(l.estado, 'hecho');
  assert.equal(l.drive, 'https://drive.google.com/drive/folders/abc');
  // Ya no hay pendientes.
  await assert.rejects(tool('lote_anuncios').run({}, { s: { role: 'admin' } }), /ningún lote pendiente/);

  // Las creatividades (mock) traen imagen o vídeo.
  const c = await call('/api/fabrica?creatividades=30001,30002,malo', { cookie: admin });
  assert.equal(c.status, 200);
  assert.deepEqual(Object.keys(c.data.creatividades).sort(), ['30001', '30002']);

  // Borrar.
  assert.equal((await call('/api/fabrica', { method: 'POST', cookie: admin, body: { op: 'borrar', id } })).status, 200);
  assert.equal((await call('/api/fabrica', { cookie: admin })).data.lotes.length, 0);
});
