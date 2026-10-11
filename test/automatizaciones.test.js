// Plan → Automatizaciones (workflows de GHL con Claude), la etiqueta de registro fija y las páginas en Accesos y enlaces.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { autoCtx, automatizacionesDe, promptAutomatizacion, descripcionIaGhl, promptPreparacion, revisarExistente, sanitizeAutomatizaciones, fechaTxt } from '../public/js/automatizaciones.js';
import { accesosDePaginas, conAccesos } from '../public/js/urls-paginas.js';

const OCT = {
  name: 'El Camino Octubre 2026', fechaDirecto: '2026-10-29', horaDirecto: '18:30', replayAt: '2026-10-30T10:00', registroTag: 'registrado webinar 29-10-26',
  encuestaTag: 'encuesta-camino', compraTag: 'clienta-raices', vipTag: 'compra-vip', precioVip: 9, publiTag: 'publi', organicoTag: 'organico',
  recursosUrl: 'https://lp.ejemplo.com/camino-preclase', replayUrl: 'https://lp.ejemplo.com/camino-replay', paginaPagoUrl: 'https://lp.ejemplo.com/camino-pago',
  compraDateField: 'fechaCompraRaices',
};

test('lista del lanzamiento: numeradas, con el nombre en carpeta y sin las que no tocan', () => {
  const c = autoCtx('lanzamientos', OCT, { code: 'camino-oct26', cliente: 'Me lo dijo la matrona', producto: 'Raíces' });
  const l = automatizacionesDe(c);
  assert.deepEqual(l.map((a) => a.id), ['registro', 'encuesta', 'vip', 'recordatorios', 'grabacion', 'compra', 'carrito-abandonado']);
  assert.equal(l[0].nombre, '[camino-oct26] 01 · Registro al webinar');
  assert.equal(c.carpeta, 'El Camino Octubre 2026');
  assert.ok(l.every((a) => !a.faltan.length));
  // Sin VIP ni encuesta, no salen; con calendario de llamadas, sí la llamada.
  const sin = automatizacionesDe(autoCtx('lanzamientos', { ...OCT, precioVip: 0, encuestaTag: '', llamadaUrl: 'https://cal.ejemplo.com/x' }, { code: 'x' })).map((a) => a.id);
  assert.ok(!sin.includes('vip') && !sin.includes('encuesta') && sin.includes('llamada'));
});

test('prompt: carpeta, nombre, etiqueta de registro fija, fechas reales, borrador y prueba', () => {
  const c = autoCtx('lanzamientos', OCT, { code: 'camino-oct26', cliente: 'Me lo dijo la matrona' });
  const [reg, , , rec] = automatizacionesDe(c);
  const p = promptAutomatizacion(reg, c);
  assert.match(p, /CARPETA: «El Camino Octubre 2026»/);
  assert.match(p, /NOMBRE DEL WORKFLOW: «\[camino-oct26\] 01 · Registro al webinar»/);
  assert.match(p, /Añadir la etiqueta «registrado webinar 29-10-26»/);
  assert.match(p, /nomenclatura «registrado webinar DD-MM-AA»/);
  assert.match(p, /anuncios, añade la etiqueta «publi».*«organico»/);
  assert.match(p, /BORRADOR/);
  assert.match(p, /no puede crear workflows/);
  assert.match(p, /CÓMO PROBARLO/);
  const r = promptAutomatizacion(rec, c);
  assert.match(r, /miércoles 28\/10\/2026 a las 19:00/); // el día antes
  assert.match(r, /jueves 29\/10\/2026 a las 17:30/); // 1 h antes
  assert.match(r, /jueves 29\/10\/2026 a las 18:30 → «Estamos en directo».*camino-preclase/);
  assert.match(descripcionIaGhl(reg, c), /^Crea un workflow llamado «\[camino-oct26\] 01 · Registro al webinar»/);
});

test('sin datos: la etiqueta propuesta por la fecha y [FALTA] donde no hay', () => {
  const c = autoCtx('lanzamientos', { name: 'Nov', fechaDirecto: '2026-11-17' }, { code: 'nov' });
  const l = automatizacionesDe(c);
  assert.match(promptAutomatizacion(l[0], c), /«registrado webinar 17-11-26»/);
  const rec = l.find((a) => a.id === 'recordatorios');
  assert.ok(rec.faltan.includes('la URL de la página preclase'));
  assert.match(promptAutomatizacion(rec, c), /\[FALTA: URL de la página preclase\]/);
});

test('preparación y «ya existen»', () => {
  const c = autoCtx('lanzamientos', OCT, { code: 'camino-oct26' });
  const l = automatizacionesDe(c);
  const p = promptPreparacion(l, c);
  assert.match(p, /crea la carpeta «El Camino Octubre 2026»/);
  assert.match(p, /- registrado webinar 29-10-26/);
  assert.match(p, /\[camino-oct26\] 07 · Carrito abandonado/);
  assert.match(revisarExistente(l[0], c), /«registrado webinar 29-10-26»/);
});

test('otros embudos: VSL, venta directa y meteórico', () => {
  assert.deepEqual(automatizacionesDe(autoCtx('vsl', { name: 'VSL', registroTag: 'reg-vsl', vslUrl: 'https://x.com/v', llamadaUrl: 'https://cal' }, { code: 'vsl' })).map((a) => a.id), ['registro', 'llamada', 'seguimiento', 'compra']);
  assert.deepEqual(automatizacionesDe(autoCtx('directa', { name: 'D' }, { code: 'd' })).map((a) => a.id), ['compra', 'extras', 'carrito-abandonado']);
  assert.deepEqual(automatizacionesDe(autoCtx('meteorico', { name: 'M', cierre: '2026-11-30T23:59' }, { code: 'm' })).map((a) => a.id), ['compra', 'cierre']);
  assert.equal(fechaTxt('2026-11-30T23:59'), 'lunes 30/11/2026 a las 23:59');
});

test('sanitizar el estado', () => {
  assert.equal(sanitizeAutomatizaciones(null), undefined);
  assert.deepEqual(sanitizeAutomatizaciones({ origen: 'cero', items: { registro: { estado: 'probada', url: 'https://app.gohighlevel.com/w/1' }, 'MAL ID': {}, compra: { estado: 'raro', url: 'javascript:x' } } }),
    { origen: 'cero', items: { registro: { estado: 'probada', url: 'https://app.gohighlevel.com/w/1' }, compra: { estado: 'pendiente' } } });
});

test('páginas del lanzamiento en Accesos y enlaces, sin duplicar', () => {
  const nuevos = accesosDePaginas({ name: 'Octubre', graciasUrl: 'https://lp.ejemplo.com/gracias', raicesUrl: 'https://lp.ejemplo.com/venta' }, [{ nombre: 'Registro · orgánico', url: 'https://lp.ejemplo.com/registro' }, { nombre: 'Gracias por registrarte', url: 'https://lp.ejemplo.com/gracias' }]);
  assert.deepEqual(nuevos.map((a) => a.nombre), ['Octubre · Registro · orgánico', 'Octubre · Gracias por registrarte', 'Octubre · Página de venta']);
  assert.ok(nuevos.every((a) => a.tipo === 'pagina'));
  const r = conAccesos([{ tipo: 'workflow', nombre: 'WF', url: 'https://a' }, { tipo: 'pagina', nombre: 'viejo', url: 'https://lp.ejemplo.com/venta' }], nuevos);
  assert.equal(r.length, 4);
  assert.equal(r.filter((a) => a.url === 'https://lp.ejemplo.com/venta').length, 1);
});

// ---- Servidor: op «automatizaciones» ----
const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
const call = async (path, { method = 'GET', body, cookie } = {}) => {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
};

test('servidor: guarda el estado en el lanzamiento y la URL del workflow pasa a Accesos', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg.config, launches: { ...cfg.config.launches, oct: { name: 'Octubre', fechaDirecto: '2026-10-29', registroTag: 'registrado webinar 29-10-26' } }, _version: cfg.version } });
  const r = await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'automatizaciones', tipo: 'lanzamientos', l: 'oct', datos: { origen: 'cero', items: { registro: { estado: 'creada', url: 'https://app.gohighlevel.com/wf/1' } } }, workflow: { nombre: '[oct] 01 · Registro al webinar', url: 'https://app.gohighlevel.com/wf/1' } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.config.launches.oct.automatizaciones, { origen: 'cero', items: { registro: { estado: 'creada', url: 'https://app.gohighlevel.com/wf/1' } } });
  assert.ok(r.data.config.accesos.some((a) => a.tipo === 'workflow' && a.nombre === '[oct] 01 · Registro al webinar'));
  // Otra vez la misma: no se duplica en Accesos.
  const r2 = await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'automatizaciones', tipo: 'lanzamientos', l: 'oct', datos: { origen: 'cero', items: {} }, workflow: { nombre: '[oct] 01 · Registro al webinar', url: 'https://app.gohighlevel.com/wf/1' } } });
  assert.equal(r2.data.config.accesos.filter((a) => a.url === 'https://app.gohighlevel.com/wf/1').length, 1);
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'automatizaciones', tipo: 'nada', l: 'oct' } })).status, 400);
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'automatizaciones', tipo: 'lanzamientos', l: 'no-existe', datos: {} } })).status, 404);
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/config', { method: 'POST', cookie: setter, body: { op: 'automatizaciones', tipo: 'lanzamientos', l: 'oct', datos: {} } })).status, 403);
});

test('lanzamiento con una etiqueta de registro antigua: los workflows usan la nomenclatura y se avisa', () => {
  const c = autoCtx('lanzamientos', { ...OCT, registroTag: 'registro-camino-oct26' }, { code: 'camino-oct26' });
  assert.equal(c.registroTag, 'registrado webinar 29-10-26');
  assert.equal(c.registroDistinta, 'registro-camino-oct26');
  assert.match(promptAutomatizacion(automatizacionesDe(c)[0], c), /«registrado webinar 29-10-26»/);
  assert.equal(autoCtx('lanzamientos', OCT, { code: 'x' }).registroDistinta, '');
});
