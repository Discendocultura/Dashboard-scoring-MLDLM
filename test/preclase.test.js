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

test('pantalla de espera: se elige en el embudo, el lanzamiento la puede cambiar y lleva vídeo opcional', async () => {
  const { sanitizeConfig } = await import('../lib/config-store.js');
  const base = { embudos: [{ id: 'lz', tipo: 'lanzamientos', nombre: 'L', espera: false }, { id: 'lz2', tipo: 'lanzamientos', nombre: 'L2' }] };
  const cfg = sanitizeConfig({ ...base, launches: {
    'la-a': { name: 'A', embudo: 'lz' }, // sin elegir: la del embudo (no)
    'la-b': { name: 'B', embudo: 'lz2' }, // embudo sin elegir: sí (como hasta ahora)
    'la-c': { name: 'C', embudo: 'lz', espera: { activa: true, video: 'https://vimeo.com/123' } },
    'la-d': { name: 'D', embudo: 'lz2', espera: { activa: true, video: 'javascript:alert(1)' } },
  } });
  assert.equal(cfg.embudos[0].espera, false);
  assert.deepEqual(cfg.launches['la-a'].espera, { activa: false, video: '' });
  assert.deepEqual(cfg.launches['la-b'].espera, { activa: true, video: '' });
  assert.deepEqual(cfg.launches['la-c'].espera, { activa: true, video: 'https://vimeo.com/123' });
  assert.equal(cfg.launches['la-d'].espera.video, '');
});

test('auditoría: votación guardada con el formato antiguo, códigos reservados y cookie dañada', async () => {
  const { tieneRecurso, recursosDe } = await import('../public/js/recursos.js');
  // Una votación de una sola pregunta guardada antes del cambio sigue funcionando al leerla.
  const viejo = { recursosPre: { votacion: { activo: true, pregunta: '¿Tema?', opciones: [{ id: 'o1', texto: 'A' }, { id: 'o2', texto: 'B' }] } } };
  assert.equal(tieneRecurso(viejo, 'votacion'), true);
  assert.deepEqual(recursosDe(viejo).votacion.preguntas.map((q) => q.id), ['p1']);
  // «constructor» no es un lanzamiento.
  assert.equal((await call('/api/page?l=constructor')).status, 404);
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cur.config, _version: cur.version, launches: { ...cur.config.launches, constructor: { name: 'X' } } } })).status, 400);
  // Cookie de /directo estropeada: se pide el email (no un error 500).
  const res = await route(new Request('http://localhost/directo?l=pre-26', { headers: { cookie: 'lsd_who=%E0%A4%A' } }), ENV);
  assert.equal(res.status, 200);
});

test('directo sin atascos: inscripción mientras espera, entrada directa y preclase ligera a la hora', async () => {
  const madrid = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)).replace(' ', 'T');
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  const guardar = async (enMin) => {
    const t = madrid(Date.now() + enMin * 60_000);
    const launch = { name: 'Directo', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-10), fechaDirecto: t.slice(0, 10), horaDirecto: t.slice(11), zoomMeetingId: '81234567890', zoomJoinUrl: 'https://zoom.us/j/1' };
    const { data: c } = await call('/api/config', { cookie: admin });
    assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { ...c.config.launches, 'dir-26': launch } } })).status, 200);
  };
  void cur;
  const zoomOp = (body) => call('/api/directo-zoom', { method: 'POST', body: { launch: 'dir-26', k: 1, ...body } });
  // Faltan 3 horas: todavía no se inscribe a nadie.
  await guardar(180);
  assert.equal((await zoomOp({ op: 'prep', cid: 'mock00031' })).data.motivo, 'fuera de hora');
  // Faltan 30 min (pantalla de espera): se inscribe y devuelve su enlace personal; la segunda vez, el mismo.
  await guardar(30);
  const r = (await zoomOp({ op: 'prep', cid: 'mock00031' })).data;
  assert.match(r.joinUrl, /^https:\/\/zoom\.us\/w\/81234567890/);
  assert.equal((await zoomOp({ op: 'prep', cid: 'mock00031' })).data.joinUrl, r.joinUrl);
  assert.equal((await zoomOp({ op: 'prep', cid: 'xx' })).status, 400);
  // A la hora: entra directa y se apunta (la etiqueta «clic» llega al sincronizar Zoom).
  assert.equal((await zoomOp({ op: 'click', cid: 'mock00031' })).data.ok, true);
  const rep = (await call('/api/zoom-report?launch=dir-26', { cookie: admin })).data;
  assert.ok(rep.entraron.includes('mock00031'));
  // Ya empezado: la preclase recibe solo adónde ir (sin datos de la lead ni llamadas a GHL).
  await guardar(-5);
  const p = (await call('/api/page?l=dir-26&cid=mock00032&pagina=recursos')).data;
  assert.equal(p.redirectTo, 'directo');
  assert.match(p.links.directo, /\/directo\?l=dir-26&cid=mock00032$/);
  assert.equal(p.recursos, undefined);
  // Sin «pagina=recursos» (otras páginas) sigue la respuesta completa.
  assert.ok((await call('/api/page?l=dir-26&cid=mock00032')).data.recursos);
});

test('página de venta y panel «En directo»: visitas, espera, entradas y ventas', async () => {
  const madrid = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ms)).replace(' ', 'T');
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const t = madrid(Date.now() + 20 * 60_000);
  const { data: c } = await call('/api/config', { cookie: admin });
  const launch = { name: 'Vivo', registroTag: 'registro-webinar-demo', vipTag: 'compra-vip-demo', compraTag: 'clienta-raices', inicioCaptacion: local(-10), fechaDirecto: t.slice(0, 10), horaDirecto: t.slice(11), zoomMeetingId: '81234567890' };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { ...c.config.launches, 'viv-26': launch } } })).status, 200);
  // Página de venta: dos visitas de la misma lead y una de otra (sin llamar a GHL).
  const visita = (cid) => call('/api/visita', { method: 'POST', body: { launch: 'viv-26', cid } });
  assert.equal((await visita('mock00041')).status, 200);
  await visita('mock00041');
  await visita('mock00042');
  assert.equal((await visita('x')).status, 400);
  assert.equal((await call('/api/visita', { method: 'POST', body: { launch: 'no-existe', cid: 'mock00041' } })).status, 404);
  const v = (await call('/api/visita?l=viv-26', { cookie: admin })).data.visitas;
  assert.equal(v.mock00041.veces, 2);
  assert.equal(v.mock00042.veces, 1);
  assert.equal((await call('/api/visita?l=viv-26')).status, 401);
  // Pantalla de espera y entradas
  const z = (op, cid) => call('/api/directo-zoom', { method: 'POST', body: { op, launch: 'viv-26', k: 1, cid } });
  await z('espera', 'mock00041'); await z('espera', 'mock00041'); await z('espera', 'mock00043');
  await z('prep', 'mock00041');
  await z('click', 'mock00041');
  const d = (await call('/api/endirecto?l=viv-26', { cookie: admin })).data;
  assert.equal(d.esperando, 2);
  assert.equal(d.inscritas, 1);
  assert.equal(d.entraron, 1);
  assert.equal(d.entradas.length, 1);
  assert.deepEqual(d.visitas, { total: 2, recientes: 2 });
  assert.equal(typeof d.vip, 'number');
  assert.equal(typeof d.ventas, 'number');
  assert.equal((await call('/api/endirecto?l=viv-26')).status, 401);
});

test('página de replay: barra fija con cuenta atrás que lleva a la página de venta', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: cur } = await call('/api/config', { cookie: admin });
  const base = { name: 'Replay', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-10), fechaDirecto: local(-2), horaDirecto: '19:00', cierreCarrito: `${local(3)}T23:59`, raicesUrl: 'https://ghl.com/venta' };
  const guardar = async (launch) => {
    const { data: c } = await call('/api/config', { cookie: admin });
    return call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { ...c.config.launches, 'rep-26': launch } } });
  };
  // Sin activar: no hay barra
  assert.equal((await guardar(base)).status, 200);
  assert.equal((await call('/api/page?l=rep-26&pagina=grabacion&cid=mock00001')).data.replayBarra, null);
  // Fecha fija
  await guardar({ ...base, replayBarra: { activa: true, texto: 'Se retira en {cuenta}', modo: 'fecha', at: `${local(1)}T20:00`, conBoton: true, boton: 'Quiero unirme', color: '#123ABC' } });
  let p = (await call('/api/page?l=rep-26&pagina=grabacion&cid=mock00001')).data;
  assert.equal(p.phase, 'replay');
  assert.equal(p.replayBarra.text, 'Se retira en {cuenta}');
  assert.equal(p.replayBarra.boton, 'Quiero unirme');
  assert.equal(p.replayBarra.color, '#123abc');
  assert.equal(p.replayBarra.video, 'replay');
  assert.equal(p.replayBarra.minutos, null);
  assert.ok(p.replayBarra.at > Date.now());
  assert.match(p.links.venta, /^https:\/\/ghl\.com\/venta\?cid=mock00001/);
  // Minutos por lead (texto por defecto si se deja vacío); fecha mal escrita o minutos sin poner → sin barra
  await guardar({ ...base, replayBarra: { activa: true, modo: 'minutos', minutos: 90 } });
  p = (await call('/api/page?l=rep-26&pagina=grabacion')).data;
  assert.equal(p.replayBarra.minutos, 90);
  assert.equal(p.replayBarra.boton, ''); // sin elegir botón: solo informativa
  assert.equal(p.replayBarra.at, null);
  assert.match(p.replayBarra.text, /\{cuenta\}/);
  await guardar({ ...base, replayBarra: { activa: true, modo: 'minutos', minutos: 90, conBoton: false, boton: 'Ver la oferta' } });
  assert.equal((await call('/api/page?l=rep-26&pagina=grabacion')).data.replayBarra.boton, '');
  // Barras por fase: «sin botón» se guarda y la página no lo enseña
  await guardar({ ...base, barra: { replay: { text: 'Últimas horas', button: '' } } });
  p = (await call('/api/page?l=rep-26&pagina=grabacion')).data;
  assert.equal(p.bar.text, 'Últimas horas');
  assert.equal(p.bar.button, null);
  await guardar({ ...base, replayBarra: { activa: true, modo: 'fecha', at: 'mañana' } });
  assert.equal((await call('/api/page?l=rep-26&pagina=grabacion')).data.replayBarra, null);
  // Sin página de venta, no hay adónde llevarla
  await guardar({ ...base, raicesUrl: '', replayBarra: { activa: true, modo: 'minutos', minutos: 30 } });
  assert.equal((await call('/api/page?l=rep-26&pagina=grabacion')).data.replayBarra, null);
});

test('página de venta: barra fija por tramos (sin GHL) y fin de cada bonus en el calendario', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: c } = await call('/api/config', { cookie: admin });
  const launch = {
    name: 'Venta', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-10), fechaDirecto: local(-1), horaDirecto: '19:00',
    aperturaCarrito: `${local(-1)}T21:00`, cierreCarrito: `${local(4)}T23:59`, raicesUrl: 'https://ghl.com/venta', ventaUrl: 'https://pay.com/raices', whatsappDudasUrl: 'https://wa.me/34600000000?text=Hola',
    oferta: { bonus: [{ id: 'b48', tipo: 'bar_48h', nombre: 'Guía del ciclo' }, { id: 'bt', tipo: 'bonus', nombre: 'Comunidad' }] },
    ventaBarra: { activa: true, color: '#00AA00', tramos: [
      { texto: '⏳ Último día para entrar · {cuenta}', hasta: `${local(4)}T23:59`, conBoton: true, destino: 'pago', boton: 'Entrar' },
      { texto: '🎁 Último día para llevarte el bonus · {cuenta}', hasta: `${local(1)}T21:00`, conBoton: false },
      { texto: 'Ya pasó', hasta: `${local(-3)}T10:00` },
      { texto: 'Sin fecha' },
    ] },
  };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { ...c.config.launches, 'ven-26': launch } } })).status, 200);
  const antes = ghl.mockStats ? ghl.mockStats().getContact : null;
  const p = (await call('/api/page?l=ven-26&pagina=venta&cid=mock00001')).data;
  if (antes != null) assert.equal(ghl.mockStats().getContact, antes); // la página de venta no llama a GHL
  assert.equal(p.ventaBarra.color, '#00aa00');
  // Ordenados por fecha; el de sin fecha no sale (el que ya pasó lo salta la página)
  assert.deepEqual(p.ventaBarra.tramos.map((t) => t.text), ['Ya pasó', '🎁 Último día para llevarte el bonus · {cuenta}', '⏳ Último día para entrar · {cuenta}']);
  assert.equal(p.ventaBarra.tramos[1].boton, null);
  assert.deepEqual(p.ventaBarra.tramos[2].boton, { label: 'Entrar', href: 'https://pay.com/raices?cid=mock00001' });
  assert.equal(p.videos, undefined); // respuesta ligera
  // Botones de la página de venta: pago con el ID de la lead; el WhatsApp de dudas, tal cual; sin llamada configurada, vacío
  assert.equal(p.links.pago, 'https://pay.com/raices?cid=mock00001');
  assert.equal(p.links['pagina-pago'], 'https://pay.com/raices?cid=mock00001'); // sin página de pago: el pago único
  assert.equal(p.links['whatsapp-dudas'], 'https://wa.me/34600000000?text=Hola');
  assert.equal(p.links.llamada, '');
  // Y en la página de replay, también
  assert.equal((await call('/api/page?l=ven-26&pagina=grabacion&cid=mock00001')).data.links['whatsapp-dudas'], 'https://wa.me/34600000000?text=Hola');
  // Con página de pago, los botones «Quiero inscribirme» van ahí (con el ID de la lead)
  const { data: c2 } = await call('/api/config', { cookie: admin });
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c2.config, _version: c2.version, launches: { ...c2.config.launches, 'ven-26': { ...c2.config.launches['ven-26'], paginaPagoUrl: 'https://ghl.com/pago-raices' } } } });
  assert.equal((await call('/api/page?l=ven-26&pagina=venta&cid=mock00001')).data.links['pagina-pago'], 'https://ghl.com/pago-raices?cid=mock00001');
  assert.equal((await call('/api/page?l=ven-26&pagina=grabacion&cid=mock00001')).data.links['pagina-pago'], 'https://ghl.com/pago-raices?cid=mock00001');
  // …y también los botones de pago de siempre (data-lsd-link="pago" / "pago-fraccionado") de las páginas de venta y de replay
  for (const pag of ['venta', 'grabacion']) {
    const l = (await call(`/api/page?l=ven-26&pagina=${pag}&cid=mock00001`)).data.links;
    assert.equal(l.pago, 'https://ghl.com/pago-raices?cid=mock00001');
  }
  // En la página de pago, los cajetines siguen yendo al checkout
  assert.equal((await call('/api/page?l=ven-26&pagina=pago&cid=mock00001')).data.links.pago, 'https://pay.com/raices?cid=mock00001');
  // Calendario: el BAR 48 h acaba dos días después de abrir el carrito (el bonus de todo el carrito ya lo dice el cierre)
  const { hitosLanzamiento } = await import('../public/js/calendario.js');
  const h = hitosLanzamiento((await call('/api/config', { cookie: admin })).data.config.launches['ven-26']).filter((x) => x.id.startsWith('bonus-'));
  assert.equal(h.length, 1);
  assert.equal(h[0].day, local(1));
  assert.equal(h[0].time, '21:00');
  assert.match(h[0].titulo, /^Último día · Bonus de acción rápida 48 h: Guía del ciclo/);
});

test('página de pago: copy y precios de los cajetines, enlaces y barra por tramos (sin GHL)', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: c } = await call('/api/config', { cookie: admin });
  const launch = {
    name: 'Pago', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-10), fechaDirecto: local(-1), horaDirecto: '19:00', cierreCarrito: `${local(4)}T23:59`,
    ventaUrl: 'https://pay.com/unico', ventaFraccionadoUrl: 'https://pay.com/plazos', precioPrograma: 997, precioFraccionado: 1164,
    paginaPago: {
      unico: { titulo: 'Un solo pago', texto: 'Acceso completo a {producto}', boton: '' },
      fraccionado: { precio: '3 pagos de 388 €' },
      barra: { activa: true, tramos: [{ texto: 'Último día · {cuenta}', hasta: `${local(4)}T23:59`, conBoton: true, destino: 'whatsapp-dudas', boton: 'Dudas' }] },
    },
  };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { ...c.config.launches, 'pag-26': launch } } })).status, 200);
  const p = (await call('/api/page?l=pag-26&pagina=pago&cid=mock00001')).data;
  assert.equal(p.texts['pago-unico-titulo'], 'Un solo pago');
  assert.equal(p.texts['pago-unico-precio'], '997 €');
  assert.match(p.texts['pago-unico-texto'], /^Acceso completo a /);
  assert.equal(p.texts['pago-unico-boton'], 'Quiero entrar en un solo pago');
  assert.equal(p.texts['pago-fraccionado-titulo'], 'Pago fraccionado');
  assert.equal(p.texts['pago-fraccionado-precio'], '3 pagos de 388 €');
  assert.equal(p.links.pago, 'https://pay.com/unico?cid=mock00001');
  assert.equal(p.links['pago-fraccionado'], 'https://pay.com/plazos?cid=mock00001');
  assert.equal(p.ventaBarra.tramos.length, 1);
  assert.equal(p.ventaBarra.tramos[0].boton, null); // sin WhatsApp de dudas configurado, el botón no sale
  // La página de venta sigue con su propia barra (aquí, ninguna)
  assert.equal((await call('/api/page?l=pag-26&pagina=venta')).data.ventaBarra, null);
});

test('WhatsApp para dudas: el enlace se genera con el número y el mensaje', async () => {
  const { numeroWhatsApp, enlaceWhatsApp, leerEnlaceWhatsApp } = await import('../public/js/page.js');
  assert.equal(numeroWhatsApp('+34 600 00 00 00'), '34600000000');
  assert.equal(numeroWhatsApp('600 000 000'), '34600000000'); // móvil español sin prefijo
  assert.equal(numeroWhatsApp('0052 55 1234 5678'), '525512345678');
  assert.equal(numeroWhatsApp('123'), '');
  assert.equal(enlaceWhatsApp('34600000000', 'Hola, tengo una duda'), 'https://wa.me/34600000000?text=Hola%2C%20tengo%20una%20duda');
  assert.equal(enlaceWhatsApp('34600000000'), 'https://wa.me/34600000000');
  assert.deepEqual(leerEnlaceWhatsApp('https://wa.me/34600000000?text=Hola%20t%C3%BA'), { numero: '34600000000', mensaje: 'Hola tú' });
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const guardar = async (extra) => {
    const { data: c } = await call('/api/config', { cookie: admin });
    await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { ...c.config.launches, 'wa-26': { name: 'WA', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-5), fechaDirecto: local(2), horaDirecto: '19:00', ...extra } } } });
    return (await call('/api/config', { cookie: admin })).data.config.launches['wa-26'];
  };
  let l = await guardar({ whatsappDudas: { numero: '600 000 000', mensaje: 'Tengo una duda sobre {producto}' } });
  assert.deepEqual(l.whatsappDudas, { numero: '34600000000', mensaje: 'Tengo una duda sobre {producto}' });
  assert.match(l.whatsappDudasUrl, /^https:\/\/wa\.me\/34600000000\?text=/);
  const link = (await call('/api/page?l=wa-26&pagina=venta')).data.links['whatsapp-dudas'];
  assert.match(decodeURIComponent(link), /^https:\/\/wa\.me\/34600000000\?text=Tengo una duda sobre /);
  assert.doesNotMatch(decodeURIComponent(link), /\{producto\}/);
  // Sin número, no hay enlace (aunque hubiera uno de antes)
  l = await guardar({ whatsappDudas: { numero: '', mensaje: 'x' }, whatsappDudasUrl: 'https://wa.me/34611111111' });
  assert.equal(l.whatsappDudasUrl, '');
  // Los de antes (solo enlace) se convierten a número y mensaje
  l = await guardar({ whatsappDudasUrl: 'https://wa.me/34622222222?text=Hola' });
  assert.deepEqual(l.whatsappDudas, { numero: '34622222222', mensaje: 'Hola' });
});

test('iniciar el pago (llegar a la página de pago): se apunta aparte y sube la puntuación a muy caliente', async () => {
  const { score, estadoFor } = await import('../public/js/scoring.js');
  const base = { clases: ['clase1', 'clase2'], clase1_25: true };
  const sin = score(base);
  const con = score({ ...base, inicio_pago: { ultima: Date.now(), veces: 1 } });
  assert.ok(sin < 70);
  assert.ok(con >= 70 && con >= sin + 15);
  assert.equal(estadoFor(con).id, 'muy-caliente');
  // Si ya compró, no cambia
  assert.equal(score({ ...base, compra: true, inicio_pago: { ultima: 1, veces: 1 } }), score({ ...base, compra: true }));
  // La visita a la página de pago se guarda aparte de la de venta
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const { data: c } = await call('/api/config', { cookie: admin });
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...c.config, _version: c.version, launches: { ...c.config.launches, 'ip-26': { name: 'IP', registroTag: 'registro-webinar-demo', inicioCaptacion: local(-5), fechaDirecto: local(-1), horaDirecto: '19:00' } } } });
  assert.equal((await call('/api/visita', { method: 'POST', body: { launch: 'ip-26', cid: 'mock00007', pagina: 'pago' } })).status, 200);
  await call('/api/visita', { method: 'POST', body: { launch: 'ip-26', cid: 'mock00007', pagina: 'pago' } });
  await call('/api/visita', { method: 'POST', body: { launch: 'ip-26', cid: 'mock00008' } });
  const v = (await call('/api/visita?l=ip-26', { cookie: admin })).data;
  assert.equal(v.pago.mock00007.veces, 2);
  assert.equal(v.pago.mock00008, undefined);
  assert.equal(v.visitas.mock00008.veces, 1);
  assert.equal(v.visitas.mock00007, undefined);
});
