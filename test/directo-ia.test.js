// Análisis del directo con Claude: leer la transcripción (VTT de Zoom, SRT o texto con tiempos), alinearla con la
// curva, el prompt, limpiar la respuesta, la caché y el recorrido entero (/api/directo-ia) con Zoom simulado.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { leerTranscripcion, porMinuto, promptDirecto, limpiarAnalisis, firma, pedirAClaude, ESQUEMA, MODELO } from '../lib/directo-ia.js';
import { rolDirecto, compararDirectos } from '../public/js/directo-ia.js';

const ENV = { GHL_MOCK: '1', ADMIN_PASSWORD: 'admin', SETTER_PASSWORD: 'setter', SESSION_SECRET: 'test-secret-test-secret' };
let route;
let env;
before(async () => {
  ({ env } = await import('../lib/env.js'));
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

// Curva de 60 minutos: llegan hasta el 10, 100 personas estables y una caída fuerte del 40 al 45.
const curva = { inicio: 0, desde: 0, paso: 60_000, valores: Array.from({ length: 60 }, (_, i) => (i < 10 ? i * 10 : i < 40 ? 100 : i < 45 ? 100 - (i - 39) * 8 : 52)) };

test('transcripción: VTT de Zoom, SRT y texto con tiempos; sin tiempos no se puede alinear', () => {
  const vtt = 'WEBVTT\n\n1\n00:00:05.120 --> 00:00:09.000\nAna: ¡Bienvenidas!\n\n2\n00:12:34.000 --> 00:12:40.000\nAna: Ahora el precio:\n497 euros.\n';
  assert.deepEqual(leerTranscripcion(vtt), [{ seg: 5, texto: 'Ana: ¡Bienvenidas!' }, { seg: 754, texto: 'Ana: Ahora el precio: 497 euros.' }]);
  const srt = '1\r\n00:01:00,000 --> 00:01:04,000\r\nHola\r\n\r\n2\r\n01:00:00,500 --> 01:00:03,000\r\nAdiós\r\n';
  assert.deepEqual(leerTranscripcion(srt).map((x) => x.seg), [60, 3600]);
  const txt = '[00:02:10] Ana: Empezamos\nsigue la frase\n1:05:00 - Ana: Preguntas';
  assert.deepEqual(leerTranscripcion(txt), [{ seg: 130, texto: 'Ana: Empezamos sigue la frase' }, { seg: 3900, texto: 'Ana: Preguntas' }]);
  assert.deepEqual(leerTranscripcion('Hola sin tiempos\nNada'), []);
});

test('alineación con la curva: frases por minuto con el desfase de la grabación', () => {
  const segs = [{ seg: 5, texto: 'a' }, { seg: 50, texto: 'b' }, { seg: 125, texto: 'c' }];
  assert.deepEqual(porMinuto(segs), [[0, 'a b'], [2, 'c']]);
  assert.deepEqual(porMinuto(segs, 5), [[5, 'a b'], [7, 'c']]); // empezó a grabar 5 min tarde
  assert.deepEqual(porMinuto(segs, -1), [[-1, 'a b'], [1, 'c']]);
});

test('prompt: la curva minuto a minuto, la transcripción alineada, los tres tipos de punto y la oferta', () => {
  const p = promptDirecto(curva, [[12, 'Os cuento mi historia'], [41, 'El precio es de 497 euros']], { nombre: 'Directo', lanzamiento: 'Octubre', marca: 'Raíces' });
  assert.match(p, /«Directo» del lanzamiento «Octubre» de Raíces/);
  assert.match(p, /min 20: 100 \(100%\)/);
  assert.match(p, /\[min 41\] El precio es de 497 euros/);
  assert.match(p, /Caída fuerte entre el minuto \d+ y el \d+/);
  for (const t of ['«pico»', '«interes»', '«fuga»', 'momento de la oferta', 'cita LITERAL', 'recomendación concreta', 'español de España']) assert.ok(p.includes(t), t);
});

test('respuesta de Claude: dentro de la curva, tipos conocidos, textos acotados y en orden', () => {
  const r = limpiarAnalisis({
    resumen: { titular: 'x'.repeat(500), dondeSePierde: 'En la oferta', queEngancha: 'La historia', oferta: 'Quedaba el 52%', prioridades: ['a', '', 'b'] },
    puntos: [
      { min: 41, min1: 44, tipo: 'fuga', titulo: 'Precio', cita: 'El precio', porque: 'Sale el precio', recomendacion: 'Antes, el valor' },
      { min: 999, min1: 2, tipo: 'pico', titulo: 'Fuera', cita: '', porque: '', recomendacion: '' },
      { min: 12, tipo: 'raro' },
      { min: 'x', tipo: 'pico' },
    ],
  }, curva);
  assert.deepEqual(r.puntos.map((p) => [p.min, p.min1, p.tipo]), [[41, 44, 'fuga'], [59, 59, 'pico']]);
  assert.equal(r.resumen.titular.length, 200);
  assert.deepEqual(r.resumen.prioridades, ['a', 'b']);
  assert.deepEqual(limpiarAnalisis(null, curva).puntos, []);
});

test('caché: la huella cambia con la curva, la transcripción o el desfase', () => {
  const segs = [{ seg: 5, texto: 'a' }];
  const f = firma(curva, segs, 0);
  assert.equal(firma(curva, segs, 0), f);
  assert.notEqual(firma(curva, segs, 3), f);
  assert.notEqual(firma(curva, [{ seg: 5, texto: 'b' }], 0), f);
  assert.notEqual(firma({ ...curva, valores: [...curva.valores, 1] }, segs, 0), f);
});

test('llamada a Claude: modelo, salida con esquema, fallbacks y errores claros', async () => {
  const fetch0 = globalThis.fetch;
  let pedido;
  globalThis.fetch = async (url, opts) => {
    pedido = { url, opts, body: JSON.parse(opts.body) };
    return new Response(JSON.stringify({ model: MODELO, stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"resumen":{},"puntos":[]}' }] }));
  };
  try {
    const r = await pedirAClaude('hola', { clave: 'sk-prueba' });
    assert.deepEqual(r.json, { resumen: {}, puntos: [] });
    assert.equal(pedido.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(pedido.opts.headers['x-api-key'], 'sk-prueba');
    assert.equal(pedido.body.model, 'claude-opus-5-5');
    assert.equal(pedido.body.fallbacks, 'default');
    assert.deepEqual(pedido.body.output_config.format, { type: 'json_schema', schema: ESQUEMA });
    assert.equal(pedido.body.thinking, undefined);
    globalThis.fetch = async () => new Response('{"error":{}}', { status: 401 });
    await assert.rejects(pedirAClaude('hola', { clave: 'mala' }), (e) => /ANTHROPIC_API_KEY/.test(e.publicMessage));
    globalThis.fetch = async () => new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }));
    await assert.rejects(pedirAClaude('hola', { clave: 'x' }), (e) => /no ha querido/.test(e.publicMessage));
  } finally {
    globalThis.fetch = fetch0;
  }
});

test('/api/directo-ia: transcripción de Zoom, análisis guardado, pegar otra transcripción y sin Zoom', async () => {
  const admin = (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV)).headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  const launches = { ...cfg.launches,
    'dia-26': { name: 'Dia', registroTag: 'reg-dia', fechaDirecto: '2026-10-08', horaDirecto: '19:00', zoomMeetingId: '812 345 6789' },
    'dia-sin': { name: 'Sin Zoom', registroTag: 'reg-sin', fechaDirecto: '2026-10-08', horaDirecto: '19:00' } };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches } })).status, 200);

  assert.equal((await call('/api/directo-ia?launch=dia-26&k=1')).status, 401);
  // Sin curva todavía: hay que sincronizar Zoom antes.
  assert.equal((await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'dia-26', k: 1 } })).status, 400);
  assert.equal((await call('/api/zoom-report?launch=dia-26&v=1', { cookie: admin })).status, 200);
  const g0 = (await call('/api/directo-ia?launch=dia-26&k=1', { cookie: admin })).data;
  assert.deepEqual([g0.analisis, g0.transcripcion, g0.claude, g0.zoom], [null, null, true, true]);

  // Sin clave, en modo de prueba: transcripción de la grabación de Zoom (simulada) y análisis de prueba.
  const a1 = (await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'dia-26', k: 1 } })).data;
  assert.equal(a1.transcripcion.fuente, 'zoom');
  assert.equal(a1.transcripcion.desfase, 0);
  assert.ok(a1.transcripcion.frases > 300);
  assert.equal(a1.analisis.prueba, true);
  assert.ok(a1.analisis.puntos.some((p) => p.tipo === 'pico'));
  assert.ok(a1.analisis.puntos.every((p) => p.cita));
  // Otra vez: no se regenera (es lo guardado).
  const a2 = (await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'dia-26', k: 1 } })).data;
  assert.equal(a2.reutilizado, true);
  assert.equal(a2.analisis.en, a1.analisis.en);
  assert.deepEqual((await call('/api/directo-ia?launch=dia-26&k=1', { cookie: admin })).data.analisis.puntos, a1.analisis.puntos);

  // Con clave: se pide a Claude (simulado) con la transcripción pegada, y se guarda limpio.
  const fetch0 = globalThis.fetch;
  let prompt = '';
  globalThis.fetch = async (url, opts) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) return fetch0(url, opts);
    prompt = JSON.parse(opts.body).messages[0].content;
    return new Response(JSON.stringify({ model: MODELO, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ resumen: { titular: 'La oferta llega tarde', dondeSePierde: 'min 130', queEngancha: 'El caso real', oferta: 'Quedaba poca gente', prioridades: ['Adelantar la oferta'] }, puntos: [{ min: 30, min1: 30, tipo: 'interes', titulo: 'Caso real', cita: 'Primer error', porque: 'Historia concreta', recomendacion: 'Abrir con el caso' }] }) }] }));
  };
  env.ANTHROPIC_API_KEY = 'sk-prueba';
  try {
    assert.equal((await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'dia-26', k: 1, texto: 'sin tiempos' } })).status, 400);
    const a3 = (await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'dia-26', k: 1, texto: '00:00:10 Hola\n00:30:00 El primer error es la ovulación', desfase: 2 } })).data;
    assert.equal(a3.reutilizado, false);
    assert.deepEqual([a3.transcripcion.fuente, a3.transcripcion.desfase, a3.transcripcion.frases], ['pegada', 2, 2]);
    assert.equal(a3.analisis.prueba, false);
    assert.equal(a3.analisis.resumen.titular, 'La oferta llega tarde');
    assert.match(prompt, /\[min 32\] El primer error es la ovulación/);
    // «Volver a analizar» pide otro aunque no cambie nada.
    prompt = '';
    assert.equal((await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'dia-26', k: 1, regenerar: true } })).data.reutilizado, false);
    assert.ok(prompt);
  } finally {
    globalThis.fetch = fetch0;
    env.ANTHROPIC_API_KEY = '';
  }

  // Directo sin reunión de Zoom: pide pegar la transcripción.
  // (con la curva de dia-26 copiada: así no hace falta sincronizar un Zoom que no tiene)
  const { guardarJSON, leerJSON } = await import('../lib/store.js');
  const { runCliente, principal } = await import('../lib/cliente.js');
  await runCliente(principal(), async () => guardarJSON('lsd_zoom_min_dia-sin_1', await leerJSON('lsd_zoom_min_dia-26_1')));
  const s = (await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'dia-sin', k: 1 } })).data;
  assert.equal(s.sinTranscripcion, true);
  assert.match(s.motivo, /no tiene reunión de Zoom/);
});

// ---------- Cualquier embudo con directos: webinar, PLF, retos… (va ligado a «vídeo con curva de Zoom») ----------
const zoom = (id) => ({ fecha: '2026-10-08', hora: '19:00', zoomMeetingId: id });
const PLF = { name: 'PLF', registroTag: 'reg-plf', formato: 'plf', ...{ fechaDirecto: '2026-10-08', horaDirecto: '19:00', zoomMeetingId: '811 111 1111' }, videos: [zoom('822 222 2222'), zoom('833 333 3333'), zoom('844 444 4444')] };
const RETO5 = { name: 'Reto', registroTag: 'reg-reto', formato: 'reto5', fechaDirecto: '2026-10-08', horaDirecto: '19:00', zoomMeetingId: '851 111 1111', videos: [{}, {}, {}, zoom('855 555 5555')] };

test('papel de cada directo según el embudo: webinar, PLF (contenido y venta) y reto', () => {
  assert.deepEqual(rolDirecto({ name: 'W' }, 1), { k: 1, n: 1, nombre: 'Webinar en directo', formato: 'Webinar', venta: true, texto: 'Webinar en directo (webinar): un solo directo en el que se hace la venta' });
  const plc2 = rolDirecto(PLF, 2);
  assert.equal(plc2.nombre, 'PLC 2');
  assert.equal(plc2.venta, false);
  assert.match(plc2.texto, /el 2\.º de 4 vídeos de un plf \(4 plcs\); es de contenido/);
  assert.equal(rolDirecto(PLF, 4).venta, true);
  assert.match(rolDirecto(RETO5, 5).texto, /^Día 5, el 5\.º de 5 vídeos de un reto de 5 días; en este se hace la venta/);
});

test('prompt de un directo de contenido: sin oferta, cómo deja preparado el siguiente', () => {
  const p = promptDirecto(curva, [[1, 'Hola']], { nombre: 'PLC 2', rol: rolDirecto(PLF, 2) });
  assert.match(p, /«PLC 2»: PLC 2, el 2\.º de 4 vídeos de un plf \(4 plcs\); es de contenido: aquí no se vende/);
  assert.match(p, /cómo se invita a volver al siguiente vídeo/);
  assert.doesNotMatch(p, /Incluye siempre el momento de la oferta/);
  assert.match(promptDirecto(curva, [], { rol: rolDirecto(PLF, 4) }), /Incluye siempre el momento de la oferta/);
});

test('comparación entre directos: máximo, retención al final y la mayor fuga', () => {
  const escala = (f, cae = 0) => ({ ...curva, valores: curva.valores.map((n, i) => Math.round(n * f) - (i >= 50 ? cae : 0)) });
  const c = compararDirectos([
    { k: 2, nombre: 'PLC 2', curva: escala(0.8, 30), analisis: { resumen: { titular: 'Se cae al final' }, puntos: [] } },
    { k: 1, nombre: 'PLC 1', curva },
    { k: 3, nombre: 'PLC 3', curva: null },
  ]);
  assert.deepEqual(c.filas.map((f) => [f.k, f.pico, f.titular]), [[1, 100, ''], [2, 80, 'Se cae al final']]);
  assert.match(c.conclusiones[0], /Del PLC 1 al PLC 2 el máximo de personas a la vez baja un 20% \(de 100 a 80\)/);
  assert.match(c.conclusiones[1], /El que mejor retiene es el PLC 1 \(al final queda el 52% del máximo\); el que menos, el PLC 2 \(15%\)/);
  assert.ok(c.conclusiones.some((t) => /La mayor fuga está en el PLC 2/.test(t)));
  assert.deepEqual(compararDirectos([{ k: 1, curva }]), { filas: [], conclusiones: [] });
});

test('/api/directo-ia en un PLF y en un reto de 5 días: cada directo con su transcripción y su análisis', async () => {
  const admin = (await route(new Request('http://localhost/api/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: 'admin' }) }), ENV)).headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  // El formato (cuántos vídeos) es del embudo: un embudo PLF y otro de reto de 5 días.
  const base = cfg.embudos.find((e) => e.tipo === 'lanzamientos');
  const embudos = [...cfg.embudos, { ...base, id: 'emb-plf', nombre: 'PLF', formato: 'plf' }, { ...base, id: 'emb-reto', nombre: 'Reto', formato: 'reto5' }];
  const launches = { ...cfg.launches, 'plf-26': { ...PLF, embudo: 'emb-plf' }, 'reto-26': { ...RETO5, embudo: 'emb-reto' } };
  assert.equal((await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, embudos, launches } })).status, 200);
  for (const [code, k] of [['plf-26', 2], ['plf-26', 4], ['reto-26', 5]]) {
    assert.equal((await call(`/api/zoom-report?launch=${code}&v=${k}`, { cookie: admin })).status, 200);
    const a = (await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: code, k } })).data;
    assert.equal(a.transcripcion.fuente, 'zoom', `${code} ${k}`);
    assert.ok(a.analisis.puntos.length);
  }
  // Pegar otra transcripción en el PLC 2 no toca la del PLC 4.
  await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'plf-26', k: 2, texto: '00:01:00 Hola PLC 2' } });
  const g2 = (await call('/api/directo-ia?launch=plf-26&k=2', { cookie: admin })).data;
  const g4 = (await call('/api/directo-ia?launch=plf-26&k=4', { cookie: admin })).data;
  assert.equal(g2.transcripcion.fuente, 'pegada');
  assert.equal(g4.transcripcion.fuente, 'zoom');
  // El 5.º día del reto existe (hasta 5 vídeos); un vídeo sin curva pide sincronizar antes.
  assert.equal((await call('/api/directo-ia?launch=reto-26&k=5', { cookie: admin })).data.analisis.fuente, 'zoom');
  assert.equal((await call('/api/directo-ia', { method: 'POST', cookie: admin, body: { launch: 'plf-26', k: 3 } })).status, 400);
});
