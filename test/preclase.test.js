// Página preclase con recursos: música (desbloqueo al 75 % de la clase), test de GHL, votación propia.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
let ghl;
before(async () => {
  const { setEnv } = await import('../lib/env.js');
  const { crearD1Local } = await import('../lib/d1-local.js');
  ENV.DB = crearD1Local();
  setEnv(ENV);
  ({ route } = await import('../lib/router.js'));
  ghl = await import('../lib/ghl.js');
});
async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await route(new Request(`http://localhost${path}`, { method, headers: { ...(cookie ? { cookie } : {}), 'content-type': 'text/plain' }, body: body ? JSON.stringify(body) : undefined }), ENV);
  return { status: res.status, data: await res.json().catch(() => null), res };
}
const local = (d) => { const x = new Date(Date.now() + d * 86_400_000); return x.toISOString().slice(0, 10); };

test('preclase: recursos y etapas en la página, votación con resultados y medición de la música', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  const launch = {
    name: 'Preclase', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-10), fechaDirecto: local(5), horaDirecto: '19:00',
    clase1Url: 'https://vimeo.com/1', clase1At: `${local(-2)}T10:00`, clase2Url: 'https://vimeo.com/2', clase2At: `${local(1)}T10:00`,
    recursosPre: {
      musica: { activo: true, url: 'https://ghl.com/musica.mp3', tras: 'clase1' },
      test: { activo: true, nombre: 'Autodiagnóstico', url: 'https://ghl.com/test', tag: 'autodiagnostico-hecho', at: `${local(-1)}T10:00` },
      votacion: { activo: true, pregunta: '¿Qué tema?', opciones: 'Ciclo\nAnalíticas', tras: 'clase1' },
    },
  };
  const r = await call('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, _version: cur.version, launches: { ...cur.config.launches, 'pre-26': launch } } });
  assert.equal(r.status, 200);
  const cid = 'mock00001';
  let p = (await call(`/api/page?l=pre-26&cid=${cid}`)).data;
  assert.deepEqual(p.etapas.map((e) => `${e.n}:${e.id}:${e.estado}`), ['1:clase1:disponible', '2:test:disponible', '3:clase2:bloqueada', '4:directo:bloqueada']);
  assert.equal(p.recursos.musica.url, 'https://ghl.com/musica.mp3'); // la clase 1 está disponible
  assert.equal(p.recursos.musica.claseVista, false); // aún no ha visto el 75 %
  assert.match(p.links.test, /^https:\/\/ghl\.com\/test\?email=/);
  assert.equal(p.recursos.votacion.resultados, null);
  // Ve el 75 % de la clase 1 y reproduce la música
  assert.equal((await call('/api/track', { method: 'POST', body: { launch: 'pre-26', video: 'clase1', pct: 75, cid } })).status, 200);
  assert.equal((await call('/api/track', { method: 'POST', body: { launch: 'pre-26', video: 'musica', pct: 50, cid } })).status, 200);
  assert.equal((await call('/api/track', { method: 'POST', body: { launch: 'pre-26', video: 'musica', pct: 33, cid } })).status, 400);
  const tags = (await ghl.getContact(cid)).tags;
  assert.ok(tags.includes('pre-26_musica_play') && tags.includes('pre-26_musica_50'));
  p = (await call(`/api/page?l=pre-26&cid=${cid}`)).data;
  assert.equal(p.recursos.musica.claseVista, true);
  assert.equal(p.etapas[0].estado, 'hecha');
  // Vota: resultados y etiqueta
  assert.equal((await call('/api/votacion', { method: 'POST', body: { launch: 'pre-26', cid, opcion: 'zz' } })).status, 400);
  const v = (await call('/api/votacion', { method: 'POST', body: { launch: 'pre-26', cid, opcion: 'o2' } })).data;
  assert.deepEqual(v.misRespuestas, { p1: 'o2' }); // formato antiguo { opcion } = la pregunta p1
  assert.equal(v.resultados.total, 1);
  assert.equal(v.resultados.preguntas.p1.opciones[1].pct, 1);
  await call('/api/votacion', { method: 'POST', body: { launch: 'pre-26', cid: 'mock00002', opcion: 'o1' } });
  assert.ok((await ghl.getContact(cid)).tags.includes('pre-26_voto'));
  p = (await call(`/api/page?l=pre-26&cid=${cid}`)).data;
  assert.deepEqual(p.recursos.votacion.misRespuestas, { p1: 'o2' });
  assert.equal(p.recursos.votacion.respondida, true);
  assert.equal(p.recursos.votacion.resultados.total, 2);
  // Dashboard: votos de cada contacto
  const d = (await call('/api/votacion?l=pre-26', { cookie: admin })).data;
  assert.deepEqual(d.votos[cid], { p1: 'o2' });
  assert.equal((await call('/api/votacion?l=pre-26')).status, 401);
  // Ficha del lead (y de la llamada del closer): su voto y los % de todas
  const f = (await call(`/api/ficha?cid=${cid}&l=pre-26`, { cookie: admin })).data;
  assert.equal(f.votacion.preguntas[0].pregunta, '¿Qué tema?');
  assert.equal(f.votacion.preguntas[0].respuesta, 'Analíticas');
  assert.equal(f.votacion.preguntas[0].resultados.total, 2);
  assert.equal((await call(`/api/ficha?cid=${cid}`, { cookie: admin })).data.votacion, null);
  // Test hecho: su etiqueta de GHL
  await ghl.addTags(cid, ['autodiagnostico-hecho']);
  p = (await call(`/api/page?l=pre-26&cid=${cid}`)).data;
  assert.equal(p.etapas.find((e) => e.id === 'test').estado, 'hecha');
});

test('preclase: el test pide haber rellenado antes la encuesta (etapa 1)', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  const launch = {
    name: 'Con encuesta', registroTag: 'registro-webinar-demo', encuestaTag: 'enc-test-26', inicioCaptacion: local(-10), fechaDirecto: local(5), horaDirecto: '19:00',
    clase1Url: 'https://vimeo.com/1', clase1At: `${local(-2)}T10:00`, clase2Url: 'https://vimeo.com/2', clase2At: `${local(1)}T10:00`,
    recursosPre: { test: { activo: true, nombre: 'Autodiagnóstico', url: 'https://ghl.com/test', tag: 'autodiag-hecho', at: `${local(-1)}T10:00` } },
    imagenes: { clase1: 'https://assets.ghl.com/c1.jpg', test: 'http://inseguro.com/t.jpg', otra: 'https://x.com/y.jpg' },
  };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, _version: cur.version, launches: { ...cur.config.launches, 'enc-26': launch } } })).status, 200);
  const cid = 'mock00009';
  let p = (await call(`/api/page?l=enc-26&cid=${cid}`)).data;
  assert.deepEqual(p.imagenes, { clase1: 'https://assets.ghl.com/c1.jpg' }); // solo https y de las etapas
  assert.equal(p.recursos.test.unlocked, true); // ya es su fecha…
  assert.equal(p.recursos.test.faltaEncuesta, true); // …pero falta la encuesta
  assert.equal(p.recursos.test.url, '');
  assert.equal(p.links.test, undefined);
  assert.equal(p.etapas.find((e) => e.id === 'test').estado, 'bloqueada');
  await ghl.addTags(cid, ['enc-test-26']);
  p = (await call(`/api/page?l=enc-26&cid=${cid}`)).data;
  assert.equal(p.recursos.test.faltaEncuesta, false);
  assert.match(p.recursos.test.url, /^https:\/\/ghl\.com\/test\?/);
  assert.equal(p.etapas.find((e) => e.id === 'test').estado, 'disponible');
});

test('preclase: votación con varias preguntas, tipo test y de respuesta libre', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  const launch = {
    name: 'Varias', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-10), fechaDirecto: local(5), horaDirecto: '19:00',
    clase1Url: 'https://vimeo.com/1', clase1At: `${local(-2)}T10:00`, clase2Url: 'https://vimeo.com/2', clase2At: `${local(-1)}T10:00`,
    recursosPre: { votacion: { activo: true, tras: 'clase2', preguntas: [
      { tipo: 'opciones', pregunta: '¿Qué tema?', opciones: 'Ciclo\nAnalíticas\nEstrés' },
      { tipo: 'libre', pregunta: '¿Qué te llevas de la clase?' },
    ] } },
  };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, _version: cur.version, launches: { ...cur.config.launches, 'var-26': launch } } })).status, 200);
  const votar = (cid, respuestas) => call('/api/votacion', { method: 'POST', body: { launch: 'var-26', cid, respuestas } });
  // La tipo test es obligatoria; la libre, opcional
  assert.equal((await votar('mock00021', { p2: 'Mucho' })).status, 400);
  assert.equal((await votar('mock00021', { p1: 'o9' })).status, 400);
  const r = (await votar('mock00021', { p1: 'o3', p2: '  Que puedo empezar hoy  ' })).data;
  assert.deepEqual(r.misRespuestas, { p1: 'o3', p2: 'Que puedo empezar hoy' });
  assert.equal(r.resultados.preguntas.p1.opciones[2].pct, 1);
  assert.deepEqual(r.resultados.preguntas.p2, { tipo: 'libre', total: 1, opciones: [] }); // los textos no se enseñan a las demás
  assert.equal((await votar('mock00022', { p1: 'o1' })).status, 200);
  const p = (await call('/api/page?l=var-26&cid=mock00022')).data;
  assert.deepEqual(p.recursos.votacion.preguntas.map((q) => q.tipo), ['opciones', 'libre']);
  assert.equal(p.recursos.votacion.resultados.total, 2);
  assert.equal(JSON.stringify(p).includes('Que puedo empezar hoy'), false);
  // Dashboard y ficha: las respuestas libres sí
  const d = (await call('/api/votacion?l=var-26', { cookie: admin })).data;
  assert.equal(d.votos.mock00021.p2, 'Que puedo empezar hoy');
  const f = (await call('/api/ficha?cid=mock00021&l=var-26', { cookie: admin })).data;
  assert.deepEqual(f.votacion.preguntas.map((q) => q.respuesta), ['Estrés', 'Que puedo empezar hoy']);
});
