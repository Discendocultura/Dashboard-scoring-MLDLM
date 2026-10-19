import { test, before } from 'node:test';
import assert from 'node:assert/strict';

// Sin GHL_MOCK: el ejemplo tiene que funcionar igual (usa los datos inventados aunque el resto vaya contra GHL).
const ENV = { ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
});
async function call(path, { method = 'GET', body, cookie, cliente } = {}) {
  const headers = { ...(cookie ? { cookie } : {}), ...(cliente ? { 'x-cliente': cliente } : {}), 'content-type': 'text/plain' };
  const res = await route(new Request(`http://localhost${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const login = async (password) => (await call('/api/login', { method: 'POST', body: { password } })).res.headers.get('set-cookie').split(';')[0];

test('embudo de ejemplo: datos inventados para mirar, como admin, sin poder guardar nada', async () => {
  const admin = await login('admin');
  const me = (await call('/api/me', { cookie: admin, cliente: 'ejemplo' })).data;
  assert.equal(me.ejemplo, true);
  assert.equal(me.role, 'admin');
  assert.equal(me.crm, true); // el ejemplo siempre tiene «CRM» (inventado)
  const cfg = (await call('/api/config', { cookie: admin, cliente: 'ejemplo' })).data.config;
  assert.deepEqual(cfg.embudos.map((e) => e.id), ['lanz', 'vsl', 'meteo']);
  assert.equal(cfg.launches.ejemplo.name, 'Lanzamiento de ejemplo');
  // Leads inventados aunque no haya GHL_MOCK (nunca toca un GHL de verdad)
  const leads = await call('/api/leads?tag=registro-webinar-demo', { cookie: admin, cliente: 'ejemplo' });
  assert.equal(leads.status, 200, JSON.stringify(leads.data).slice(0, 300));
  assert.ok(leads.data.contacts.length > 0);
  // No se guarda nada…
  const r = await call('/api/config', { method: 'POST', cookie: admin, cliente: 'ejemplo', body: { ...cfg } });
  assert.equal(r.status, 403);
  assert.equal(r.data.ejemplo, true);
  assert.equal((await call('/api/usuarios', { method: 'POST', cookie: admin, cliente: 'ejemplo', body: { op: 'crear', nombre: 'X', email: 'x@x.es', rol: 'admin' } })).status, 403);
  // …y el equipo de verdad no se ve desde el ejemplo
  const eq = await call('/api/usuarios', { cookie: admin, cliente: 'ejemplo' });
  assert.deepEqual(eq.data.users || [], []);
  assert.equal(eq.data.todos, undefined); // ni siquiera el superadmin ve a nadie desde aquí
  // Nada de lo común de la agencia ni de credenciales reales desde el ejemplo (todos entran como admin)
  assert.equal((await call('/api/usuarios?agencia', { cookie: admin, cliente: 'ejemplo' })).data.equipo, undefined);
  for (const ruta of ['/api/seguridad', '/api/sendflow?op=probar', '/api/historial', '/api/clientes', '/api/roles']) {
    assert.equal((await call(ruta, { cookie: admin, cliente: 'ejemplo' })).status, 403, ruta);
  }
  // Fuera del ejemplo, el cliente de siempre sin GHL conectado lo dice
  const me2 = (await call('/api/me', { cookie: admin })).data;
  assert.equal(me2.crm, false);
  assert.equal(me2.ejemplo, undefined);
});

test('mostrar poco a poco: el primer día solo lo básico; lo demás se desbloquea cuando tiene sentido', async () => {
  const { desbloqueos, filtrarVistas, desbloqueoDeVista } = await import('../public/js/primeros-pasos.js');
  const vistas = ['hoy', 'leads', 'metricas', 'llamadas', 'publicidad', 'anuncios', 'paginas', 'tareas', 'calendario', 'comparar', 'labia', 'endirecto'];
  // Día 1, sin nada configurado: Hoy, Leads, Métricas (y LabIA y En directo, que no se esconden)
  let d = desbloqueos({}, { dias: 0 });
  assert.deepEqual(filtrarVistas(vistas, d.todos), ['hoy', 'leads', 'metricas', 'labia', 'endirecto']);
  // Embudo configurado: aparecen Plan y Crear; con leads, Anuncios; con calendario, Llamadas
  d = desbloqueos({}, { dias: 0, configurado: true, leads: true, calendario: true });
  assert.deepEqual(d.nuevos.sort(), ['anuncios', 'crear', 'herramientas', 'llamadas', 'plan']);
  assert.ok(filtrarVistas(vistas, d.todos).includes('paginas'));
  assert.ok(!filtrarVistas(vistas, d.todos).includes('comparar'));
  // Lo ya desbloqueado (guardado) no vuelve a ser «nuevo»
  d = desbloqueos({ 'u-plan': '2026-10-19' }, { dias: 1 });
  assert.ok(d.ya.has('plan'));
  assert.ok(!d.nuevos.includes('plan'));
  // Con el tiempo, aunque no haga nada, todo acaba apareciendo
  assert.equal(desbloqueos({}, { dias: 7 }).todos.size, 7);
  assert.equal(desbloqueoDeVista('comparar'), 'analisis');
  assert.equal(desbloqueoDeVista('leads'), '');
});

test('tu siguiente paso, tipo de embudo recomendado, buscador, avisos dosificados y atascados', async () => {
  const { siguientePaso, recomendarTipo, buscar, dosificar, atascados } = await import('../public/js/primeros-pasos.js');
  const base = { crm: true, implementa: false, embudos: 1, configurado: true, nombreEmbudo: 'Webinar', marca: true, leads: true, crear: true };
  assert.equal(siguientePaso({ ...base, crm: false }).accion, 'ejemplo');
  assert.equal(siguientePaso({ ...base, embudos: 0 }).accion, 'crear');
  assert.equal(siguientePaso({ ...base, embudos: 0, implementa: true }).id, 'montando');
  assert.match(siguientePaso({ ...base, configurado: false }).titulo, /Termina de configurar «Webinar»/);
  assert.match(siguientePaso({ ...base, configurado: false, implementa: true }).titulo, /Revisa/);
  assert.equal(siguientePaso({ ...base, marca: false }).accion, 'marca');
  assert.equal(siguientePaso({ ...base, leads: false }).accion, 'leads');
  assert.equal(siguientePaso(base), null); // todo hecho
  // 2 preguntas → tipo
  assert.equal(recomendarTipo({ fecha: 'si', venta: 'directa' }).tipo, 'webinar');
  assert.equal(recomendarTipo({ fecha: 'no', venta: 'llamada' }).tipo, 'llamadas');
  assert.equal(recomendarTipo({ fecha: 'no', venta: 'directa' }).tipo, 'vsl');
  assert.equal(recomendarTipo({}), null);
  // Buscador: por palabras, sin tildes ni mayúsculas, lo del título primero
  const indice = [
    { id: 'metricas', titulo: 'Métricas', sub: 'Lanzamiento', claves: 'ventas facturación roas cómo va' },
    { id: 'config', titulo: 'Configuración del embudo', sub: '', claves: 'cambiar el precio fechas etiquetas' },
    { id: 'hoy', titulo: 'Setting hoy', sub: 'Hoy', claves: 'llamar escribir whatsapp leads a quién' },
    { id: 'leads', titulo: 'Leads', sub: '', claves: 'registrados personas' },
  ];
  assert.equal(buscar(indice, 'ver mis ventas')[0].id, 'metricas');
  assert.equal(buscar(indice, 'CAMBIAR EL PRECIO')[0].id, 'config');
  assert.deepEqual(buscar(indice, 'llamar a leads').map((x) => x.id).slice(0, 2), ['hoy', 'leads']);
  assert.equal(buscar(indice, 'metricas')[0].id, 'metricas');
  assert.deepEqual(buscar(indice, 'zzz'), []);
  assert.deepEqual(buscar(indice, '  '), []);
  // Primera semana: solo lo urgente y como mucho 2
  const items = [{ tipo: 'comentario' }, { tipo: 'mencion' }, { tipo: 'pronto' }, { tipo: 'vencida' }, { tipo: 'vencida' }, { tipo: 'equipo' }];
  assert.deepEqual(dosificar(items, { nuevo: true, dias: 2 }).map((n) => n.tipo), ['mencion', 'vencida']);
  assert.equal(dosificar(items, { nuevo: true, dias: 8 }).length, 6);
  assert.equal(dosificar(items, { nuevo: false, dias: 0 }).length, 6);
  // Atascados: sin avanzar 3 días o más, o sin entrar desde que se le dio acceso
  const ahora = Date.parse('2026-10-20T10:00:00Z');
  const us = [
    { id: 'a', nombre: 'Marta', onboarding: { inicio: '2026-10-10T10:00:00Z', pasos: { recorrido: '2026-10-15T10:00:00Z', 'u-plan': '2026-10-15T10:00:00Z' }, tours: {} }, lastLogin: '2026-10-15T10:00:00Z' },
    { id: 'b', nombre: 'Luis', onboarding: { inicio: '2026-10-19T10:00:00Z', pasos: {}, tours: {} }, lastLogin: '2026-10-19T10:00:00Z' },
    { id: 'c', nombre: 'Eva', onboarding: { inicio: '2026-10-12T10:00:00Z', pasos: {}, tours: {} }, accesoEnviado: '2026-10-12T10:00:00Z' },
    { id: 'd', nombre: 'Ya', onboarding: { hecho: true } },
    { id: 'e', nombre: 'Fin', onboarding: { inicio: '2026-10-01T10:00:00Z', pasos: { fiesta: '2026-10-02T10:00:00Z' }, tours: {} } },
  ];
  const at = atascados(us, ahora);
  assert.deepEqual(at.map((x) => [x.nombre, x.dias, x.sinEntrar, x.hechos]), [['Eva', 8, true, 0], ['Marta', 5, false, 1]]);
});
