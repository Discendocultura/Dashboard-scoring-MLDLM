// Retención de vídeos: puntos de fuga, tramos que se saltan y picos de interés (grabación) y curva de Zoom (directo).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { analizarReplay, analizarDirecto, curvaDirecto, TRAMOS, mmss } from '../public/js/retencion.js';

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

// Grabación de 50 min vista por 200 personas: bajada suave, fuga brusca hacia el 30 %, un tramo que se saltan hacia
// el 60 % y un momento que se vuelve a ver hacia el 45 %.
function grabacionDePrueba() {
  const tramos = Array.from({ length: TRAMOS }, (_, i) => {
    let p = 200 - i * 0.3;
    if (i >= 60) p -= 50;                          // fuga: se van 50 personas en el tramo 58-60
    else if (i >= 58) p -= (i - 57) * 17;
    if (i >= 118 && i <= 124) p -= 60;               // se lo saltan
    const veces = i >= 88 && i <= 91 ? 1.9 : 1.05;   // vuelven a verlo
    return [Math.round(p), Math.round(p * veces)];
  });
  return { dur: 3000, tramos };
}

test('retención de la grabación: punto de fuga, tramo que se saltan y pico de interés, con qué hacer', () => {
  const an = analizarReplay(grabacionDePrueba());
  assert.ok(an.suficiente);
  assert.equal(an.base, 200);
  assert.equal(an.fugas.length, 1);
  assert.ok(an.fugas[0].desde >= 52 && an.fugas[0].hasta <= 66, JSON.stringify(an.fugas));
  assert.ok(an.fugas[0].caida >= 20);
  assert.equal(an.saltos.length, 1);
  assert.ok(an.saltos[0].desde >= 112 && an.saltos[0].hasta <= 130, JSON.stringify(an.saltos));
  assert.equal(an.picos.length, 1);
  assert.ok(an.picos[0].i >= 87 && an.picos[0].i <= 92);
  const tipos = an.sugerencias.map((s) => s.tipo);
  assert.ok(tipos.includes('fuga') && tipos.includes('salto') && tipos.includes('pico'));
  assert.match(an.sugerencias.find((s) => s.tipo === 'salto').accion, /cortar/);
  const fuga = an.sugerencias.find((s) => s.tipo === 'fuga');
  assert.match(`${mmss(fuga.t)}–${mmss(fuga.t1)}`, /^1[34]:..–15:..$/);
  assert.match(fuga.texto, /^Punto de fuga: se va el 2\d%/);
  // Pocos datos: solo la curva, sin conclusiones.
  const pocos = analizarReplay({ dur: 600, tramos: Array.from({ length: TRAMOS }, () => [5, 5]) });
  assert.equal(pocos.suficiente, false);
  assert.deepEqual(pocos.sugerencias, []);
  // Estable: nada que cortar.
  const estable = analizarReplay({ dur: 600, tramos: Array.from({ length: TRAMOS }, (_, i) => [100 - Math.round(i * 0.1), 100 - Math.round(i * 0.1)]) });
  assert.deepEqual(estable.sugerencias.map((s) => s.tipo), ['ok']);
  assert.equal(mmss(3725), '1:02:05');
});

test('retención del directo: curva de Zoom por minuto, llegadas tarde, máximo y punto de fuga', () => {
  const hora = Date.parse('2026-11-03T18:00:00Z');
  const ps = [];
  for (let i = 0; i < 100; i++) {
    const entra = hora + (i < 50 ? -5 : 12) * 60_000;            // la mitad llega 12 min tarde
    const sale = hora + (i < 30 ? 45 : 120) * 60_000;            // 30 se van en el minuto 45
    ps.push({ clave: `p${i}@x.com`, entra, sale });
  }
  ps.push({ clave: 'p0@x.com', entra: hora + 50 * 60_000, sale: hora + 60 * 60_000 }); // vuelve: no cuenta doble
  const curva = curvaDirecto(ps, hora);
  assert.equal(curva.inicio, hora);
  assert.equal(curva.desde, hora - 5 * 60_000);
  const an = analizarDirecto(curva);
  assert.equal(an.pico, 100);
  assert.equal(an.picoMin, 12);
  assert.equal(an.tarde, 12);
  assert.equal(an.fugas.length, 1);
  assert.ok(an.fugas[0].min0 >= 40 && an.fugas[0].min1 <= 50, JSON.stringify(an.fugas));
  assert.equal(an.fugas[0].personas, 30);
  const tipos = an.sugerencias.map((s) => s.tipo);
  assert.deepEqual(tipos.slice(0, 3), ['tarde', 'pico', 'fuga']);
});

test('retención: el tracker suma tramos (anónimo) y Métricas lo lee; Zoom guarda la curva del directo', async () => {
  const admin = (await call('/api/login', { method: 'POST', body: { password: 'admin' } })).res.headers.get('set-cookie').split(';')[0];
  const cfg = (await call('/api/config', { cookie: admin })).data.config;
  await call('/api/config', { method: 'POST', cookie: admin, body: { ...cfg, launches: { ...cfg.launches, 'ret-26': { name: 'Ret', registroTag: 'reg-ret', fechaDirecto: '2026-10-08', horaDirecto: '19:00', zoomMeetingId: '812 345 6789' } } } });
  // Dos personas: una ve los tramos 0-2 (el 1, dos veces); otra el 0 y el 1.
  assert.equal((await call('/api/retencion', { method: 'POST', body: { launch: 'ret-26', video: 'replay', dur: 3000, u: [0, 1, 2], v: { 0: 1, 1: 2, 2: 1 } } })).status, 200);
  await call('/api/retencion', { method: 'POST', body: { launch: 'ret-26', video: 'replay', u: [0, 1], v: { 0: 1, 1: 1 } } });
  // Basura: tramos fuera de rango, vídeos que no existen, lanzamientos que no existen.
  await call('/api/retencion', { method: 'POST', body: { launch: 'ret-26', video: 'replay', u: [999, -3, 'x'], v: { 500: 3, 1: 9999 } } });
  assert.equal((await call('/api/retencion', { method: 'POST', body: { launch: 'ret-26', video: 'otro', u: [0] } })).status, 400);
  assert.equal((await call('/api/retencion', { method: 'POST', body: { launch: 'no-existe', video: 'replay', u: [0] } })).status, 404);
  assert.equal((await call('/api/retencion?l=ret-26')).status, 401);
  const { videos } = (await call('/api/retencion?l=ret-26', { cookie: admin })).data;
  assert.equal(videos.replay.dur, 3000);
  assert.deepEqual(videos.replay.tramos.slice(0, 4), [[2, 2], [2, 23], [1, 1], [0, 0]]);
  // Zoom (simulado): al sincronizar se guarda la curva y Métricas la lee con lo guardado.
  const inf = await call('/api/zoom-report?launch=ret-26&v=1', { cookie: admin });
  assert.equal(inf.status, 200);
  assert.ok(inf.data.curva.valores.length > 60);
  const g = (await call('/api/zoom-report?launch=ret-26&v=1&guardado=1', { cookie: admin })).data;
  assert.deepEqual(g.curva, inf.data.curva);
  assert.ok(analizarDirecto(g.curva).pico > 0);
});

test('zoom: el informe del directo junta las instancias de la sala que empezaron cerca de la hora (no solo la última)', async () => {
  const { instanciasDelDirecto } = await import('../lib/zoom.js');
  const hora = Date.parse('2026-10-29T17:30:00Z');
  const inst = [
    { uuid: 'ayer', start_time: '2026-10-28T17:25:00Z' },
    { uuid: 'directo', start_time: '2026-10-29T17:20:00Z' },
    { uuid: 'se-cayo', start_time: '2026-10-29T18:40:00Z' },
    { uuid: 'reabierta', start_time: '2026-10-29T21:15:00Z' },
    { uuid: 'manana', start_time: '2026-10-30T17:25:00Z' },
  ];
  assert.deepEqual(instanciasDelDirecto(inst, hora).map((m) => m.uuid), ['directo', 'se-cayo', 'reabierta']);
  assert.deepEqual(instanciasDelDirecto(inst, null), []);
});
