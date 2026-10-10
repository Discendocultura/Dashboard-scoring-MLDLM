import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { limpiarRespuestas, sanitizeMarcaCliente, progresoTotal, contextoMarca, promptFicha, productoDeEmbudo, disenoTexto } from '../public/js/marca.js';

test('marca: limpia las respuestas según su pregunta', () => {
  const r = limpiarRespuestas({ nombre: ' MLDLM ', tono: ['Cercano', 'Inventado'], trato: 'De tú', emojis: 'Muchísimos', color1: '#AA00bb', logo: 'javascript:x', redes: 'https://a.com\nnada\nhttps://b.com', otra: 'x' });
  assert.deepEqual(r, { nombre: 'MLDLM', tono: ['Cercano'], trato: 'De tú', color1: '#aa00bb', redes: 'https://a.com\nhttps://b.com' });
  const m = sanitizeMarcaCliente({ productos: [{ id: 'pabc123', respuestas: { nombre: 'Raíces', precio: '497 €' } }, { id: 'pabc123' }], embudos: { lanz: 'pabc123', otro: 'pnoexiste' }, token: 'corto' });
  assert.equal(m.productos.length, 1);
  assert.deepEqual(m.embudos, { lanz: 'pabc123' });
  assert.equal(m.token, '');
  assert.equal(productoDeEmbudo(m, 'lanz').id, 'pabc123');
  assert.equal(productoDeEmbudo(m, 'cualquiera').id, 'pabc123'); // sin elegir: el primero
  assert.ok(progresoTotal(m).pct > 0);
});

test('marca: contexto de los prompts (ficha si la hay; si no, respuestas) y prompt de la ficha', () => {
  const m = sanitizeMarcaCliente({ respuestas: { nombre: 'MLDLM', tono: ['Cálido'], color1: '#860d0e' }, productos: [{ id: 'pabc123', respuestas: { nombre: 'Raíces', dolores: 'No duerme' } }], docs: [{ id: 'd1234', nombre: 'Encuesta', productoId: '' }, { id: 'd9999', nombre: 'Otro', productoId: 'pzzz999' }] });
  const p = m.productos[0];
  const ctx = contextoMarca(m, p);
  assert.match(ctx, /Nombre de la marca: MLDLM/);
  assert.match(ctx, /No duerme/);
  assert.doesNotMatch(ctx, /#860d0e/); // el diseño va aparte
  assert.match(disenoTexto(m), /#860d0e/);
  assert.equal(contextoMarca(m, { ...p, ficha: 'FICHA' }), 'FICHA');
  const pf = promptFicha(m, p, { d1234: 'Mamás que no duermen' });
  assert.match(pf, /<documento nombre="Encuesta">\nMamás que no duermen/);
  assert.match(pf, /FICHA DE MARCA Y AVATAR de «Raíces»/);
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
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('marca: equipo y cliente por su enlace, documentos y ficha', async () => {
  const login = async (password) => (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV)).headers.get('set-cookie').split(';')[0];
  const admin = await login('admin');
  const setter = await login('setter');
  assert.equal((await call('/api/marca')).status, 401);
  assert.equal((await call('/api/marca', { method: 'POST', cookie: setter, body: { op: 'campos', campos: { nombre: 'X' } } })).status, 403);
  let r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'campos', campos: { nombre: 'MLDLM', tono: ['Cercano'] } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.marca.respuestas.nombre, 'MLDLM');
  r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'producto-nuevo', nombre: 'Raíces' } });
  const pid = r.data.producto.id;
  // Enlace del cliente
  assert.equal((await call('/api/marca?t=loquesea')).status, 403); // sin enlace activo
  r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'enlace', activar: true } });
  const t = r.data.marca.token;
  assert.match(t, /^[A-Za-z0-9]{24,}$/);
  const pub = await call(`/api/marca?t=${t}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.token, undefined);
  assert.equal(pub.data.productos[0].ficha, undefined);
  // El cliente rellena (sin pisar lo del equipo) y sube un documento
  r = await call('/api/marca', { method: 'POST', body: { t, op: 'campos', ambito: 'producto', productoId: pid, campos: { dolores: 'No duerme nada', precio: '497 €' } } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call('/api/marca', { method: 'POST', body: { t, op: 'campos', campos: { historia: 'Empecé en 2015' } } });
  assert.equal(r.data.respuestas.nombre, 'MLDLM');
  assert.equal(r.data.respuestas.historia, 'Empecé en 2015');
  assert.equal((await call('/api/marca', { method: 'POST', body: { t, op: 'enlace', activar: false } })).status, 400); // el cliente no puede
  assert.equal((await call('/api/marca', { method: 'POST', body: { t, op: 'ficha', productoId: pid, ficha: 'x' } })).status, 400);
  r = await call('/api/marca', { method: 'POST', body: { t, op: 'doc-subir', nombre: 'Encuesta avatar.pdf', tipo: 'pdf', productoId: pid, texto: 'Las mamás dicen: «no puedo más, no duermo desde hace meses»' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const did = r.data.doc.id;
  assert.equal((await call('/api/marca', { method: 'POST', body: { t, op: 'doc-subir', nombre: 'vacío', texto: '  ' } })).status, 400);
  // El equipo lee los textos y guarda la ficha y el producto de un embudo
  const txt = (await call('/api/marca?textos=1', { cookie: admin })).data.textos;
  assert.match(txt[did], /no puedo más/);
  r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'ficha', productoId: pid, ficha: '# Ficha\nTono cálido' } });
  assert.equal(r.data.marca.productos[0].ficha, '# Ficha\nTono cálido');
  r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'embudo', embudo: 'lanzamientos', productoId: pid } });
  assert.equal(r.data.marca.embudos.lanzamientos, pid);
  // Borrar el documento y desactivar el enlace
  r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'doc-borrar', id: did } });
  assert.equal(r.data.marca.docs.length, 0);
  assert.equal((await call('/api/marca?textos=1', { cookie: admin })).data.textos[did], undefined);
  await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'enlace', activar: false } });
  assert.equal((await call(`/api/marca?t=${t}`)).status, 403);
});

test('páginas: cada página con sus códigos y el prompt con marca, estilo y formulario', async () => {
  const { paginasDe, codigosDePagina, promptPagina } = await import('../public/js/paginas.js');
  const todos = [['REGISTRO · visitas', '<div data-lsd-registro></div>'], ['VENTA · página', '<div data-lsd-venta></div>'], ['WHATSAPP · botón flotante abajo', '<a class="wa"></a>'], ['RECURSOS · vídeo', '<div data-lsd-video="clase1"></div>']];
  const reg = paginasDe('lanzamientos').find((p) => p.id === 'registro');
  assert.deepEqual(codigosDePagina(reg, todos).map(([t]) => t), ['REGISTRO · visitas']);
  const venta = paginasDe('lanzamientos').find((p) => p.id === 'venta');
  assert.equal(codigosDePagina(venta, todos).length, 2);
  const gracias = paginasDe('lanzamientos').find((p) => p.id === 'gracias');
  assert.match(codigosDePagina(gracias, todos, { script: '<script src="x"></script>' })[0][1], /data-lsd-page="gracias"/);
  // Directa: sin upsell no hay su página; VSL de lead magnet: sin gracias de llamada
  assert.equal(paginasDe('directa', { partes: { upsell: false, downsell: true } }).some((p) => p.id === 'upsell'), false);
  assert.equal(paginasDe('vsl', { sinLlamadas: true }).some((p) => p.id === 'gracias-llamada'), false);
  const p = promptPagina({ pagina: reg, nombreEmbudo: 'Octubre', marca: 'MLDLM', datos: ['- Lanzamiento: Octubre'], contexto: 'FICHA', diseno: '- Color principal: #860d0e', codigos: codigosDePagina(reg, todos), notas: 'Más corta', urls: { 'Página preclase': 'https://a.com' } });
  assert.match(p, /<marca>\nFICHA\n<\/marca>/);
  assert.match(p, /#860d0e/);
  assert.match(p, /<!-- REGISTRO · visitas -->\n<div data-lsd-registro><\/div>/);
  assert.match(p, /FORMULARIO DE REGISTRO DE GHL/);
  assert.match(p, /INDICACIONES PARA ESTA PÁGINA:\nMás corta/);
  assert.match(p, /- Página preclase: https:\/\/a\.com/);
});

test('asistente: pasos por importancia, obligatorias, terminar solo con todo y reabrir', async () => {
  const { pasosAsistente, faltanEnPaso, faltanObligatorias, sanitizeMarcaCliente } = await import('../public/js/marca.js');
  const m0 = sanitizeMarcaCliente({});
  const ids = pasosAsistente(m0).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 4), ['bienvenida', 'm1', 'm2', 'productos']);
  assert.equal(ids.at(-1), 'fin');
  assert.deepEqual(faltanEnPaso(m0, { tipo: 'productos' }).map((x) => x.id), ['productos']);
  const m1 = sanitizeMarcaCliente({ productos: [{ id: 'pabc123', respuestas: { nombre: 'Raíces' } }] });
  assert.ok(pasosAsistente(m1).some((p) => p.id === 'p:pabc123:1'));
  // Las opcionales no cuentan (bonus, garantía, testimonios…)
  assert.ok(!faltanObligatorias(m1).some((f) => /Bonus|Garantía/.test(f.label)));
  const paso4 = pasosAsistente(m1).find((p) => p.id === 'p:pabc123:4');
  assert.deepEqual(faltanEnPaso(m1, paso4).map((q) => q.id), ['formato']);

  const login = async (password) => (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password }) }), ENV)).headers.get('set-cookie').split(';')[0];
  const admin = await login('admin');
  let r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'enlace', activar: true } });
  const t = r.data.marca.token;
  r = await call('/api/marca', { method: 'POST', body: { t, op: 'paso', paso: 'm2' } });
  assert.equal(r.data.asistente.paso, 'm2');
  r = await call('/api/marca', { method: 'POST', body: { t, op: 'terminar' } });
  assert.equal(r.status, 400);
  assert.ok(r.data.faltan.length > 10);
  // Rellenar todo lo obligatorio y terminar
  const { SECCIONES_MARCA, SECCIONES_PRODUCTO } = await import('../public/js/marca.js');
  const llenar = (secs) => Object.fromEntries(secs.flatMap((s) => s.preguntas).filter((q) => !q.opcional).map((q) => [q.id, q.tipo === 'varias' ? [q.opciones[0]] : q.tipo === 'opciones' ? q.opciones[0] : q.tipo === 'color' ? '#123456' : q.tipo === 'url' ? 'https://a.com/x.png' : 'Algo']));
  await call('/api/marca', { method: 'POST', body: { t, op: 'campos', campos: llenar(SECCIONES_MARCA) } });
  const pid = (await call('/api/marca', { cookie: admin })).data.marca.productos[0]?.id
    || (await call('/api/marca', { method: 'POST', body: { t, op: 'producto-nuevo', nombre: 'Raíces' } })).data.productos[0].id;
  const m = (await call('/api/marca', { cookie: admin })).data.marca;
  for (const p of m.productos) await call('/api/marca', { method: 'POST', body: { t, op: 'campos', ambito: 'producto', productoId: p.id, campos: llenar(SECCIONES_PRODUCTO) } });
  r = await call('/api/marca', { method: 'POST', body: { t, op: 'terminar' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.ok(r.data.asistente.completado);
  assert.ok(pid);
  // El cliente no puede reabrir; el equipo sí
  assert.equal((await call('/api/marca', { method: 'POST', body: { t, op: 'reabrir' } })).status, 400);
  r = await call('/api/marca', { method: 'POST', cookie: admin, body: { op: 'reabrir' } });
  assert.equal(r.data.marca.asistente.completado, '');
  // El cliente con su acceso al dashboard: ve y rellena su cuestionario (sin token ni fichas), nada más
  const u = await call('/api/usuarios', { method: 'POST', cookie: admin, body: { op: 'crear', nombre: 'Cliente', email: 'cli-marca@ejemplo.com', rol: 'cliente', enviar: false } });
  const lres = await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ email: 'cli-marca@ejemplo.com', password: u.data.password }) }), ENV);
  const cli = lres.headers.get('set-cookie').split(';')[0];
  const v = await call('/api/marca', { cookie: cli });
  assert.equal(v.status, 200);
  assert.equal(v.data.token, undefined);
  assert.equal(v.data.marca, undefined);
  assert.equal(v.data.asistente.completado, '');
  r = await call('/api/marca', { method: 'POST', cookie: cli, body: { op: 'paso', paso: 't1' } });
  assert.equal(r.data.asistente.paso, 't1');
  assert.equal((await call('/api/marca', { method: 'POST', cookie: cli, body: { op: 'enlace', activar: false } })).status, 400);
  assert.equal((await call('/api/marca?textos=1', { cookie: cli })).data.textos, undefined);
  r = await call('/api/marca', { method: 'POST', cookie: cli, body: { op: 'terminar' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
