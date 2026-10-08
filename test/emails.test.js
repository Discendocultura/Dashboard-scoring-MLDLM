import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tasas, resumenEmails, conIndicadores, nivel, filtrosEmail, coincideFiltro, ventanaEmails } from '../public/js/emails.js';
import { addDays } from '../public/js/tareas.js';

const em = (nombre, entregados, aperturas, clics) => ({ nombre, ...tasas({ sent: entregados, delivered: entregados, opened: aperturas, clicked: clics }) });

test('emails: tasas, medias ponderadas e indicadores frente al resto', () => {
  const t = tasas({ sent: 40, delivered: 40, opened: 36, clicked: 11 });
  assert.equal(t.apertura, 0.9);
  assert.equal(t.ctr, 0.275);
  assert.equal(Math.round(t.ctor * 1000), 306);
  const lista = [em('A', 1000, 500, 100), em('B', 1000, 450, 90), em('C', 1000, 250, 20), em('D', 10, 9, 5)];
  const r = resumenEmails(lista);
  assert.equal(r.entregados, 3010);
  assert.equal(r.aperturas, 1209);
  const c = conIndicadores(lista);
  const by = Object.fromEntries(c.map((e) => [e.nombre, e]));
  assert.equal(by.C.niveles.apertura, 'bajo');
  assert.match(by.C.consejo, /asunto/);
  assert.equal(by.A.niveles.apertura, 'alto');
  assert.equal(by.D.fiable, false); // pocos envíos: sin indicador
  assert.equal(by.D.niveles.apertura, '');
  // Buena apertura pero pocos clics de quien abre: la llamada a la acción
  const cta = conIndicadores([em('X', 1000, 500, 10), em('Y', 1000, 480, 120), em('Z', 1000, 470, 110)]).find((e) => e.nombre === 'X');
  assert.equal(cta.niveles.ctor, 'bajo');
  assert.match(cta.consejo, /llamada a la acción/);
  assert.equal(nivel(0.5, 0.5), 'medio');
  assert.equal(nivel(null, 0.5), '');
});

test('emails: filtros por nombre y ventana de fechas', () => {
  assert.deepEqual(filtrosEmail(' Octubre, [RAÍCES] Lanzamiento ,'), ['octubre', '[raíces] lanzamiento']);
  assert.ok(coincideFiltro('Email 1 · OCTUBRE', ['octubre']));
  assert.ok(!coincideFiltro('Newsletter', ['octubre']));
  assert.deepEqual(ventanaEmails({ inicioCaptacion: '2026-10-01', cierreCarrito: '2026-10-27T23:59' }, addDays), { desde: '2026-09-17', hasta: '2026-10-30' });
  assert.deepEqual(ventanaEmails({ calentamiento: '2026-11-20', apertura: '2026-11-25T09:00', cierre: '2026-11-25T21:00' }, addDays), { desde: '2026-11-18', hasta: '2026-11-27' });
  assert.equal(ventanaEmails({}, addDays), null);
});

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
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}

test('API de emails: por filtro (campañas y workflows) y por fechas del lanzamiento', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const body = {
    ...cfg,
    launches: {
      oct: { name: 'Octubre', registroTag: 'r', inicioCaptacion: '2026-09-28', fechaDirecto: '2026-10-20', cierreCarrito: '2026-10-27T23:59' },
      flt: { name: 'Con filtro', registroTag: 'r2', emailFiltro: 'octubre · email 3, [vsl]' },
    },
  };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body })).status, 200);
  // Sin filtro: las campañas enviadas en las fechas del lanzamiento (no la newsletter de septiembre)
  const d = (await call('/api/emails?l=oct', { cookie: admin })).data;
  assert.equal(d.emails.length, 8);
  assert.ok(d.emails.every((e) => e.tipo === 'campana' && e.asunto));
  assert.ok(d.resumen.apertura > 0.3 && d.resumen.apertura < 0.6);
  const rec = d.emails.find((e) => e.asunto === 'Recordatorio');
  assert.equal(rec.niveles.apertura, 'bajo');
  // Con filtro: una campaña y los 3 emails del workflow de la VSL
  const f = (await call('/api/emails?l=flt', { cookie: admin })).data;
  assert.equal(f.emails.filter((e) => e.tipo === 'campana').length, 1);
  assert.equal(f.emails.filter((e) => e.tipo === 'workflow').length, 3);
  assert.equal((await call('/api/emails?l=no-existe', { cookie: admin })).status, 404);
  assert.equal((await call('/api/emails?l=oct')).status, 401);
});

test('encuesta del avatar: la pregunta antigua de texto pasa al campo nuevo de opciones', async () => {
  const { actualizarEncuesta, ENCUESTA_PREGUNTAS } = await import('../public/js/encuesta.js');
  const vieja = [{ id: '0lVfpThUn3rOkt5nalEp', name: 'Edad', tipo: 'edad' }, { id: 'H3Q8asVCA89m3vaqFNSu', name: '¿Qué has probado hasta ahora para lograr el positivo?', tipo: 'texto' }];
  const nueva = actualizarEncuesta(vieja);
  assert.deepEqual(nueva.map((p) => [p.id, p.tipo]), [['0lVfpThUn3rOkt5nalEp', 'edad'], ['v4zDuixEurBx4MY7JofI', 'opciones']]);
  assert.deepEqual(actualizarEncuesta(nueva), nueva); // no hace nada si ya está
  assert.ok(ENCUESTA_PREGUNTAS.some((p) => p.id === 'v4zDuixEurBx4MY7JofI'));
  assert.ok(!ENCUESTA_PREGUNTAS.some((p) => p.id === 'H3Q8asVCA89m3vaqFNSu'));
  // La configuración guardada con la pregunta antigua se lee ya con la nueva
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'marca', marca: cfg.marca, encuesta: vieja } });
  const leida = (await call('/api/config', { cookie: admin })).data.config;
  assert.ok(leida.encuesta.some((p) => p.id === 'v4zDuixEurBx4MY7JofI' && p.tipo === 'opciones'));
});

test('campos para la encuesta: incluye los de opciones (casillas, radio) con su tipo', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { fields } = (await call('/api/fields?tipo=encuesta', { cookie: admin })).data;
  assert.equal(fields.find((f) => f.id === 'v4zDuixEurBx4MY7JofI')?.tipo, 'opciones');
  assert.equal(fields.find((f) => f.id === 'Ez1HWRYbBv5LXyHNPCQW')?.tipo, 'texto');
  assert.ok(!fields.some((f) => f.id === 'mockFechaCompraRaices')); // las fechas no
});
