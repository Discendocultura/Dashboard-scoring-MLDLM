// Retención de las grabaciones (Métricas → Consumo de vídeos):
//   POST /api/retencion (público, desde tracker.js) { launch, video, dur, u: [tramos vistos por primera vez],
//       v: { tramo: veces } } → suma a cada tramo sus personas y sus vistas. Anónimo: no lleva quién es.
//   GET  /api/retencion?l=<código> (Métricas) → { videos: { clase1: { dur, tramos: [[personas, vistas], …] }, … } }
// Con D1, en la tabla retencion_video; sin D1 (desarrollo local), en memoria.
import { requireSession } from '../lib/auth.js';
import { db, esquema } from '../lib/store.js';
import { clienteActual } from '../lib/cliente.js';
import { getConfig } from '../lib/config-store.js';
import { dentroDelLimite } from '../lib/intentos.js';
import { json, readBody, errorResponse, CORS_HEADERS } from '../lib/http.js';
import { VIDEOS } from '../public/js/scoring.js';
import { TRAMOS } from '../public/js/retencion.js';

const enMemoria = new Map(); // `${cliente}|${launch}|${video}` → Map(tramo → [personas, vistas])

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Lo que manda el navegador, limpio: tramos 0…TRAMOS-1, como mucho 20 vistas de un tramo por envío.
export function limpiarEnvio({ u, v, dur }) {
  const tramo = (x) => { const n = Number(x); return Number.isInteger(n) && n >= 0 && n < TRAMOS ? n : null; };
  const unicos = new Set((Array.isArray(u) ? u : []).slice(0, TRAMOS).map(tramo).filter((n) => n != null));
  const vistas = new Map();
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v).slice(0, TRAMOS)) {
      const t = tramo(k);
      const c = Math.min(20, Math.floor(Number(n)));
      if (t != null && c > 0) vistas.set(t, c);
    }
  }
  for (const t of unicos) if (!vistas.has(t)) vistas.set(t, 1); // la primera vez también es una vista
  const d = Math.round(Number(dur));
  return { unicos, vistas, dur: d > 0 && d <= 6 * 3600 ? d : 0 };
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (!(await dentroDelLimite(request, 'retencion', 600))) return json({ ok: true }, 200, CORS_HEADERS);
    const { launch, video } = body;
    if (!VIDEOS.includes(video)) return json({ error: 'Datos no válidos' }, 400, CORS_HEADERS);
    if (!Object.hasOwn((await getConfig()).launches, launch)) return json({ error: 'Lanzamiento desconocido' }, 404, CORS_HEADERS);
    const { unicos, vistas, dur } = limpiarEnvio(body);
    if (!vistas.size && !dur) return json({ ok: true }, 200, CORS_HEADERS);
    const cli = clienteActual().id;
    const d = db();
    if (!d) {
      const k = `${cli}|${launch}|${video}`;
      const m = enMemoria.get(k) || new Map();
      for (const [t, n] of vistas) { const x = m.get(t) || [0, 0]; m.set(t, [x[0] + (unicos.has(t) ? 1 : 0), x[1] + n]); }
      if (dur) m.set(-1, [0, Math.max(dur, m.get(-1)?.[1] || 0)]);
      enMemoria.set(k, m);
      return json({ ok: true }, 200, CORS_HEADERS);
    }
    await esquema(d);
    const sumar = d.prepare('INSERT INTO retencion_video (cliente, lanzamiento, video, tramo, personas, vistas) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (cliente, lanzamiento, video, tramo) DO UPDATE SET personas = retencion_video.personas + excluded.personas, vistas = retencion_video.vistas + excluded.vistas');
    const ops = [...vistas].map(([t, n]) => sumar.bind(cli, launch, video, t, unicos.has(t) ? 1 : 0, n));
    if (dur) ops.push(d.prepare('INSERT INTO retencion_video (cliente, lanzamiento, video, tramo, personas, vistas) VALUES (?, ?, ?, -1, 0, ?) ON CONFLICT (cliente, lanzamiento, video, tramo) DO UPDATE SET vistas = MAX(retencion_video.vistas, excluded.vistas)').bind(cli, launch, video, dur));
    await d.batch(ops);
    return json({ ok: true }, 200, CORS_HEADERS);
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: ['metricas'] });
    const code = new URL(request.url).searchParams.get('l') || '';
    const cli = clienteActual().id;
    const filas = [];
    const d = db();
    if (!d) {
      for (const [k, m] of enMemoria) {
        const [c, l, video] = k.split('|');
        if (c === cli && l === code) for (const [tramo, [personas, vistas]] of m) filas.push({ video, tramo, personas, vistas });
      }
    } else {
      await esquema(d);
      filas.push(...((await d.prepare('SELECT video, tramo, personas, vistas FROM retencion_video WHERE cliente = ? AND lanzamiento = ?').bind(cli, code).all()).results || []));
    }
    const videos = {};
    for (const f of filas) {
      const v = videos[f.video] ||= { dur: 0, tramos: Array.from({ length: TRAMOS }, () => [0, 0]) };
      if (f.tramo === -1) v.dur = f.vistas;
      else if (f.tramo >= 0 && f.tramo < TRAMOS) v.tramos[f.tramo] = [f.personas, f.vistas];
    }
    return json({ videos });
  } catch (e) {
    return errorResponse(e);
  }
}
