import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret', DIGEST_KEY: 'clave-larga-de-prueba-123' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
async function call(path, { method = 'GET', body, cookie, cliente } = {}) {
  const res = await route(new Request(`http://localhost${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(cliente ? { 'x-cliente': cliente } : {}), 'content-type': 'text/plain' },
    body: body ? JSON.stringify(body) : undefined,
  }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie')?.split(';')[0];

test('agencia: marca por cliente, plantillas de embudo y panel de todos los clientes', async () => {
  const admin = await login('admin');
  const setter = await login('setter');
  await call('/api/clientes', { method: 'POST', cookie: admin, body: { op: 'guardar', cliente: { id: 'clinica-sol', nombre: 'Clínica Sol', locationId: 'LOC123abc' } } });

  // 2.4 · Cliente nuevo: sin nada de MLDLM (mensajes neutros con {producto}, sin encuesta ni producto)
  const sol = (await call('/api/config', { cookie: admin, cliente: 'clinica-sol' })).data.config;
  assert.equal(sol.marca.producto, '');
  assert.deepEqual(sol.encuesta, []);
  assert.ok(sol.templates.cierre.includes('{producto}') && !sol.templates.cierre.includes('Raíces'));
  const mldlm = (await call('/api/config', { cookie: admin })).data.config;
  assert.equal(mldlm.marca.producto, 'Raíces');
  assert.equal(mldlm.encuesta.length, 4);
  // Marca: solo admin
  assert.equal((await call('/api/config', { method: 'POST', cookie: setter, body: { op: 'marca', marca: { producto: 'X' } } })).status, 403);
  const m = await call('/api/config', { method: 'POST', cookie: admin, cliente: 'clinica-sol', body: { op: 'marca', marca: { producto: 'Método Sol', color: '#123456', color2: '#abcdef' }, encuesta: [{ id: 'campo1', name: '¿Edad?', tipo: 'edad' }, { id: '', name: 'sin campo' }] } });
  assert.equal(m.status, 200);
  assert.equal(m.data.config.marca.producto, 'Método Sol');
  assert.deepEqual(m.data.config.encuesta, [{ id: 'campo1', name: '¿Edad?', tipo: 'edad' }]);
  const { buildMessage } = await import('../public/js/scoring.js');
  assert.match(buildMessage(sol.templates.cierre, { nombre: 'Ana', producto: 'Método Sol' }), /Método Sol es para ti/);

  // 2.2 · Plantilla del embudo de lanzamientos de MLDLM, aplicada en Clínica Sol
  const lanzId = mldlm.embudos.find((e) => e.tipo === 'lanzamientos').id;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...mldlm, embudos: mldlm.embudos.map((e) => (e.id === lanzId ? { ...e, formato: 'v2' } : e)), launches: { ...mldlm.launches, nov: { name: 'Nov', registroTag: 'registro-nov', embudo: lanzId, precioVip: 27, precioPrograma: 997, inicioCaptacion: '2026-10-01', textos: { 'clases-titulo': 'Mira las clases' } } } } });
  assert.equal((await call('/api/plantillas', { cookie: setter })).status, 403);
  const g = await call('/api/plantillas', { method: 'POST', cookie: admin, body: { op: 'guardar', embudo: lanzId, nombre: 'Webinar 2 vídeos', desc: 'Con carrito de 5 días' } });
  assert.equal(g.status, 200);
  assert.ok(g.data.plantilla.habituales > 0);
  const lista = (await call('/api/plantillas', { cookie: admin, cliente: 'clinica-sol' })).data.plantillas; // común a la agencia
  assert.equal(lista.length, 1);
  const a = await call('/api/plantillas', { method: 'POST', cookie: admin, cliente: 'clinica-sol', body: { op: 'aplicar', id: lista[0].id, nombre: 'Webinar Sol', mensajes: false, habituales: true } });
  assert.equal(a.status, 200);
  const emb = a.data.config.embudos.find((e) => e.id === a.data.embudo);
  assert.equal(emb.formato, 'v2');
  assert.equal(emb.base.precioPrograma, 997);
  assert.equal(emb.base.textos['clases-titulo'], 'Mira las clases');
  assert.ok(a.data.config.templates.cierre.includes('{producto}')); // mensajes: false → se quedan los suyos
  assert.equal((await call('/api/config', { cookie: admin })).data.config.embudos.some((e) => e.nombre === 'Webinar Sol'), false);

  // 2.1 / 2.3 · Panel de agencia (solo superadmin) con alta guiada
  assert.equal((await call('/api/agencia', { cookie: setter })).status, 403);
  const r = (await call('/api/agencia?fresh=1', { cookie: admin })).data;
  assert.deepEqual(r.clientes.map((c) => c.id), ['mldlm', 'clinica-sol']);
  const csol = r.clientes.find((c) => c.id === 'clinica-sol');
  assert.equal(csol.producto, 'Método Sol');
  assert.ok(csol.alta.pasos.find((p) => p.id === 'marca').ok);
  assert.equal(csol.alta.pasos.find((p) => p.id === 'paginas').ok, false);
  // Una visita de la página preclase marca «páginas con código»
  await call('/api/config', { method: 'POST', cookie: admin, cliente: 'clinica-sol', body: { ...a.data.config, launches: { sol: { name: 'Sol', registroTag: 'registro-sol', embudo: a.data.embudo, inicioCaptacion: '2026-10-01' } } } });
  assert.equal((await call('/api/page?l=sol&c=clinica-sol')).status, 200);
  const r2 = (await call('/api/agencia?fresh=1', { cookie: admin })).data;
  assert.equal(r2.clientes.find((c) => c.id === 'clinica-sol').alta.pasos.find((p) => p.id === 'paginas').ok, true);
  assert.ok(r2.clientes.find((c) => c.id === 'clinica-sol').lanzamiento.auditor.critico >= 1); // faltan fechas
  // 2.5 · Resumen de cada mañana: con la clave
  assert.equal((await call('/api/agencia?key=mala')).status, 401);
  const env = await call('/api/agencia?key=clave-larga-de-prueba-123');
  assert.equal(env.status, 200);
  assert.equal(typeof env.data.enviados, 'number');
  const { htmlResumen } = await import('../handlers/agencia.js');
  const h = htmlResumen(r2, 'https://dash.example/');
  assert.match(h.subject, /críticos hoy en 2 clientes/);
  assert.match(h.body, /\?c=clinica-sol/);
});

test('rol Cliente: solo ve su resumen (sin datos personales) y nada más', async () => {
  const admin = await login('admin');
  const nuevo = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Cliente Prueba', email: 'cliente@ejemplo.com', rol: 'cliente', enviar: false } });
  assert.equal(nuevo.status, 200);
  const cli = (await call('/api/login', { method: 'POST', body: { email: 'cliente@ejemplo.com', password: nuevo.data.password } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { ...cfg.launches, demo: { name: 'Demo', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', precioVip: 27, precioPrograma: 997, inversion: 3000, inicioCaptacion: '2026-10-05', fechaDirecto: '2026-12-20', objetivos: { ventas: 100 } } } } });
  const r = await call('/api/resumen?fresh=1', { cookie: cli });
  assert.equal(r.status, 200);
  const lanz = r.data.embudos.find((e) => e.tipo === 'lanzamiento' && e.code === 'demo');
  assert.ok(lanz.kpis.registros > 0 && lanz.kpis.ventas >= 0);
  assert.equal(lanz.kpis.inversion, 3000);
  assert.ok(lanz.objetivos.some((o) => o.label === 'Ventas de Raíces'));
  assert.ok(!JSON.stringify(r.data).includes('@')); // sin emails ni datos personales
  // Nada de la cocina interna
  for (const path of ['/api/tareas?l=demo', '/api/eventos?l=demo', '/api/leads?tag=registro-webinar-demo', '/api/meta?launch=demo', '/api/usuarios']) {
    assert.equal((await call(path, { cookie: cli })).status, 403, path);
  }
  assert.equal((await call('/api/me', { cookie: cli })).data.role, 'cliente');
  assert.equal((await call('/api/config', { cookie: cli })).status, 200); // solo nombres y fechas
  // El rol Cliente no se puede ampliar
  const roles = (await call('/api/roles', { cookie: admin })).data.roles;
  await call('/api/roles', { method: 'POST', cookie: admin, body: { roles: roles.map((x) => (x.id === 'cliente' ? { ...x, permisos: ['leads'] } : x)) } });
  assert.deepEqual((await call('/api/roles', { cookie: admin })).data.roles.find((x) => x.id === 'cliente').permisos, ['resumen']);
});

test('informe para el cliente: página, enlace firmado, envío y automático al cerrar el carrito', async () => {
  const admin = await login('admin');
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { ...cfg.launches, cerr: { name: 'Cerrado', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', precioVip: 27, precioPrograma: 997, inversion: 4000, inicioCaptacion: '2026-09-01', fechaDirecto: '2026-09-20', cierreCarrito: '2026-10-05T23:59', objetivos: { ventas: 80, registros: 3000 } } } } });
  // Sin sesión ni firma: no
  assert.equal((await route(new Request('http://localhost/api/informe?l=cerr'), ENV)).status, 401);
  const r = await route(new Request('http://localhost/api/informe?l=cerr', { headers: { cookie: admin } }), ENV);
  assert.equal(r.status, 200);
  const html = await r.text();
  for (const t of ['Resultados frente a objetivos', 'Embudo', 'Aprendizajes', 'Guardar en PDF']) assert.ok(html.includes(t), t);
  const { url } = (await call('/api/informe', { method: 'POST', cookie: admin, body: { op: 'enlace', l: 'cerr' } })).data;
  assert.equal((await route(new Request(url), ENV)).status, 200); // con el enlace firmado, sin sesión
  assert.equal((await route(new Request(url.replace('l=cerr', 'l=otro')), ENV)).status, 401); // la firma es de ese informe
  // Envío: a las personas con el rol Cliente (creada en el test anterior)
  const env = (await call('/api/informe', { method: 'POST', cookie: admin, body: { op: 'enviar', l: 'cerr' } })).data;
  assert.ok(env.destinatarios >= 1 && env.enviados === env.destinatarios);
  // Automático: con el resumen de cada mañana, una sola vez
  const cron = (await call('/api/agencia?key=clave-larga-de-prueba-123')).data;
  assert.ok(cron.informes.some((x) => x.code === 'cerr'));
  assert.ok((await call('/api/config', { cookie: admin })).data.config.launches.cerr.informeEnviado);
  const otra = (await call('/api/agencia?key=clave-larga-de-prueba-123')).data;
  assert.equal(otra.informes.some((x) => x.code === 'cerr'), false);
  // Semanal de la VSL
  const v = await route(new Request('http://localhost/api/informe?v=vsl', { headers: { cookie: admin } }), ENV);
  assert.match(await v.text(), /Informe semanal/);
});
