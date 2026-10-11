// Narrativa del lanzamiento: prompt para Claude, lo que se pega, el bloque en los prompts y su guardado.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { promptNarrativa, bloqueNarrativa, extraerNarrativa, sanitizeNarrativa, tituloDe, INICIO, FIN } from '../public/js/narrativa.js';
import { objetivosDe, PROMPTS_ANUNCIOS } from '../public/js/anuncios.js';
import { promptPagina } from '../public/js/paginas.js';
import { promptCalentamiento } from '../public/js/calentamiento.js';

const NARR = `TÍTULO: «El Camino hacia tu embarazo natural»
IDEA CENTRAL: cada clase es una etapa del Camino de Santiago.
SÍMBOLOS Y RITUALES: credencial con sellos, flechas amarillas, la concha.`;

test('prompt: ficha, datos del lanzamiento, etapas del embudo y formato de la respuesta', () => {
  const p = promptNarrativa({ producto: 'Raíces', contexto: 'FICHA DEL AVATAR', diseno: '- Color: #860d0e', lanzamiento: 'Noviembre', formato: 'Webinar', fechas: 'Directo: mar 17 nov', oferta: 'programa 997 €', preclase: true, vip: true, anterior: 'El Camino', notas: 'algo más emocional' });
  assert.match(p, /FICHA DEL AVATAR/);
  assert.match(p, /Camino de Santiago/); // el ejemplo de referencia
  assert.match(p, /no la repitas\): El Camino/);
  assert.match(p, /Preclase: clases grabadas/);
  assert.match(p, /Entrada VIP/);
  assert.match(p, /PASO 1 · Propón 5 narrativas/);
  assert.ok(p.includes(INICIO) && p.includes(FIN));
  for (const k of ['EL VIAJE · ETAPA A ETAPA', 'DIRECCIÓN VISUAL', 'GANCHOS PARA ANUNCIOS', 'VOCABULARIO', 'NOMBRES']) assert.ok(p.includes(k), k);
  assert.doesNotMatch(promptNarrativa({ preclase: false }), /Preclase: clases/);
  assert.match(promptNarrativa({}), /sin ficha/);
});

test('lo que se pega: lo de dentro de las marcas y el título', () => {
  const x = extraerNarrativa(`Aquí la tienes:\n${INICIO}\n${NARR}\n${FIN}\n¿Quieres cambios?`);
  assert.equal(x.texto, NARR);
  assert.equal(x.titulo, 'El Camino hacia tu embarazo natural');
  assert.equal(extraerNarrativa(NARR).texto, NARR); // sin marcas: todo
  assert.equal(tituloDe('**TÍTULO:** «La Vuelta al mundo»'), 'La Vuelta al mundo');
  assert.equal(sanitizeNarrativa({ titulo: '', texto: '  ' }), null);
  assert.equal(sanitizeNarrativa({ texto: NARR }).titulo, 'El Camino hacia tu embarazo natural');
  assert.equal(sanitizeNarrativa({ texto: 'x'.repeat(20000) }).texto.length, 12000);
});

test('el bloque entra en los prompts de anuncios, páginas y WhatsApp, con instrucciones de cada canal', () => {
  const n = { titulo: 'El Camino hacia tu embarazo natural', texto: NARR };
  assert.equal(bloqueNarrativa(null), '');
  const an = bloqueNarrativa(n, 'anuncios');
  assert.match(an, /NARRATIVA DEL LANZAMIENTO: «El Camino hacia tu embarazo natural» — OBLIGATORIA/);
  assert.match(an, /DIRECCIÓN VISUAL y sus ESCENAS/);
  const ctx = { objetivo: objetivosDe('lanzamientos')[0], tipoTexto: 'Lanzamiento', datos: [], urls: {}, contexto: 'FICHA', diseno: '', ganadores: '', notas: '', narrativa: an };
  for (const p of PROMPTS_ANUNCIOS) assert.ok(p.fn(ctx).includes('credencial con sellos'), p.id);
  const pg = promptPagina({ pagina: { id: 'registro', nombre: 'Registro', objetivo: 'Registrarse', secciones: ['Hero'] }, narrativa: bloqueNarrativa(n, 'pagina') });
  assert.match(pg, /Titulares, subtítulos y nombres de secciones salen de su vocabulario/);
  assert.ok(pg.includes('flechas amarillas'));
  const wa = promptCalentamiento({ name: 'Noviembre', fechaDirecto: '2026-11-17' }, { narrativa: bloqueNarrativa(n, 'whatsapp') });
  assert.match(wa, /Cada mensaje es un momento del viaje/);
  assert.ok(!promptCalentamiento({ name: 'X' }, {}).includes('NARRATIVA DEL LANZAMIENTO'));
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

test('se guarda con el lanzamiento (op narrativa), se quita y se copia al siguiente', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { ...cfg.launches, oct: { name: 'Octubre', fechaDirecto: '2026-10-20', registroTag: 'registro-oct' } } } });
  const g = await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'narrativa', l: 'oct', narrativa: { titulo: 'El Camino', texto: NARR, hack: 1 } } });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  assert.deepEqual(g.data.config.launches.oct.narrativa, { titulo: 'El Camino', texto: NARR });
  // Se mantiene al guardar la configuración entera.
  const c2 = (await call('/api/config', { cookie: admin })).data.config;
  const g2 = await call('/api/config', { method: 'POST', cookie: admin, body: c2 });
  assert.equal(g2.data.config.launches.oct.narrativa.titulo, 'El Camino');
  const { nuevoLanzamiento } = await import('../public/js/lanzamiento-rapido.js');
  assert.equal(nuevoLanzamiento({ code: 'nov', fecha: '2026-11-17', hora: '19:00', prev: g2.data.config.launches.oct, prevCode: 'oct' }).launch.narrativa.titulo, 'El Camino');
  const q = await call('/api/config', { method: 'POST', cookie: admin, body: { op: 'narrativa', l: 'oct', narrativa: null } });
  assert.equal(q.data.config.launches.oct.narrativa, undefined);
  const setter = (await call('/api/login', { method: 'POST', body: { password: 'setter' } })).res.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/config', { method: 'POST', cookie: setter, body: { op: 'narrativa', l: 'oct', narrativa: { texto: 'x' } } })).status, 403);
});
