import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { detectarAlertas, campanasActivas, porHora } from '../lib/vigia-grupos.js';

const MIN = 60_000;
// Serie cada 15 min durante 24 h: 2 salidas y 10 entradas y 15 clics por cada 15 min.
function serie(ahora, ultimas = {}) {
  const out = [];
  let e = 1000; let s = 50; let c = 1500;
  for (let t = ahora - 24 * 60 * MIN; t <= ahora; t += 15 * MIN) {
    out.push({ t, e, s, c });
    e += 10; s += 2; c += 15;
  }
  const ult = out.at(-1);
  Object.assign(ult, { e: ult.e + (ultimas.e || 0), s: ult.s + (ultimas.s || 0), c: ult.c + (ultimas.c || 0) });
  return out;
}

test('vigilancia: sin problemas no avisa', () => {
  const ahora = Date.UTC(2026, 9, 10, 12);
  assert.deepEqual(detectarAlertas(serie(ahora), { ahora, grupos: [{ lleno: true }, { lleno: false }], enlace: { ok: true } }), []);
});

test('vigilancia: pico de salidas, grupos llenos, enlace caído y clics sin entradas', () => {
  const ahora = Date.UTC(2026, 9, 10, 12);
  const fuga = detectarAlertas(serie(ahora, { s: 40 }), { ahora });
  assert.equal(fuga.length, 1);
  assert.equal(fuga[0].tipo, 'fuga');
  assert.ok(fuga[0].salidas >= 40);
  assert.deepEqual(detectarAlertas(serie(ahora), { ahora, grupos: [{ lleno: true }, { lleno: true }] }).map((a) => a.tipo), ['llenos']);
  assert.deepEqual(detectarAlertas(serie(ahora), { ahora, enlace: { ok: false, detalle: 'responde con error 404' } }).map((a) => a.tipo), ['enlace']);
  // La última hora: clics pero ninguna entrada
  const s = serie(ahora);
  const hace1h = s.findIndex((f) => f.t >= ahora - 60 * MIN);
  for (let i = hace1h; i < s.length; i++) s[i].e = s[hace1h].e;
  assert.ok(detectarAlertas(s, { ahora }).some((a) => a.tipo === 'clics'));
  const ph = porHora(serie(ahora, { s: 40 }), ahora);
  assert.equal(ph.length, 24);
  assert.ok(ph.at(-1).salidas >= 40);
});

test('vigilancia: campañas activas (captación y carrito, meteórico en curso)', () => {
  const config = {
    launches: {
      oct: { name: 'Oct', sendflowId: 'r1', inicioCaptacion: '2026-10-01', cierreCarrito: '2026-10-20T23:59', whatsappUrl: 'https://sendflow.pro/r/oct' },
      viejo: { name: 'Viejo', sendflowId: 'r0', inicioCaptacion: '2026-08-01', cierreCarrito: '2026-08-20T23:59' },
      sin: { name: 'Sin campaña', inicioCaptacion: '2026-10-01' },
    },
    meteoricos: { bf: { name: 'BF', sendflowId: 'r2', calentamiento: '2026-10-08', apertura: '2026-10-12T09:00', cierre: '2026-10-12T21:00' } },
  };
  assert.deepEqual(campanasActivas(config, '2026-10-10').map((c) => c.code), ['oct', 'bf']);
  assert.deepEqual(campanasActivas(config, '2026-10-14').map((c) => c.code), ['oct']);
});

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DIGEST_KEY: 'clave-larga-de-pruebas-123' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
const call = async (path, cookie) => {
  const res = await route(new Request(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }), ENV);
  return { status: res.status, data: await res.json().catch(() => null) };
};

test('vigilancia: la tarea con la clave guarda la foto y el dashboard la enseña', async () => {
  const admin = (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV)).headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', admin)).data.config;
  const hoy = new Date().toISOString().slice(0, 10);
  const body = { ...cfg, launches: { oct: { name: 'Octubre', registroTag: 'r', sendflowId: 'rel-demo', inicioCaptacion: hoy } }, sendflowAvisos: { email: true, telefono: '34 600 111 222', cuentaId: 'acc-1' } };
  const saved = await route(new Request('http://localhost/api/config', { method: 'POST', headers: { cookie: admin, 'content-type': 'text/plain' }, body: JSON.stringify(body) }), ENV);
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).config.sendflowAvisos, { email: true, telefono: '34600111222', cuentaId: 'acc-1' });
  assert.equal((await call('/api/sendflow?op=vigilar&key=mala')).status, 401);
  const r = (await call(`/api/sendflow?op=vigilar&key=${ENV.DIGEST_KEY}`)).data;
  assert.equal(r.vigiladas, 1);
  assert.deepEqual(r.campanas[0].alertas, []);
  const g = (await call('/api/sendflow?op=grupos&l=oct', admin)).data;
  assert.ok(g.vigilancia.ultima > Date.now() - 60_000);
  assert.equal(g.vigilancia.estado.grupos, 4);
  assert.equal((await call('/api/sendflow?op=cuentas', admin)).data.cuentas[0].id, 'acc-1');
});

test('vigilancia: por WhatsApp solo los fallos (no los picos de salidas)', async () => {
  const { FALLOS } = await import('../lib/vigia-grupos.js');
  assert.deepEqual(FALLOS, ['enlace', 'llenos', 'clics']);
  assert.ok(!FALLOS.includes('fuga'));
});
