// Formatos de lanzamiento: cuántos vídeos tiene el lanzamiento (aparte de la preclase con las
// clases 1 y 2 grabadas, que es del prelanzamiento y la tienen todos).
//   webinar: 1 vídeo (el webinar en directo) · v2 / v3: 2 o 3 vídeos · plf: 4 vídeos (PLC 1-4)
//   reto3 / reto4 / reto5: reto de 3, 4 o 5 días (un vídeo por día, «Día 1»…; la venta, el último día)
// En el último vídeo se hace la venta (se abre el carrito).
// Cada vídeo tiene las mismas casillas que el webinar: día y hora, Zoom (si es en directo),
// página y vídeo de la grabación y desde cuándo se ve. El vídeo 1 usa los campos de siempre
// (fechaDirecto, horaDirecto, zoomMeetingId, zoomJoinUrl, replayUrl, replayVideoUrl, replayAt)
// y sus señales de siempre (directo_*, replay_*); los vídeos 2-4 van en `launch.videos[]`
// y sus señales llevan el número (directo2_asistio, replay3_50…).

export const FORMATOS = {
  webinar: { n: 1, label: 'Webinar', desc: 'Un solo vídeo: el webinar en directo, su grabación y el carrito' },
  v2: { n: 2, label: 'Lanzamiento de 2 vídeos', desc: 'Dos vídeos; en el 2º se hace la venta' },
  v3: { n: 3, label: 'Lanzamiento de 3 vídeos', desc: 'Tres vídeos; en el 3º se hace la venta' },
  plf: { n: 4, label: 'PLF (4 PLCs)', desc: 'Product Launch Formula: PLC 1, 2 y 3 de contenido y el PLC 4 de venta' },
  reto3: { n: 3, label: 'Reto de 3 días', desc: 'Un vídeo (directo o grabado) cada día; el último día se hace la venta', reto: true },
  reto4: { n: 4, label: 'Reto de 4 días', desc: 'Un vídeo cada día; el 4º día se hace la venta', reto: true },
  reto5: { n: 5, label: 'Reto de 5 días', desc: 'Un vídeo cada día; el 5º día se hace la venta', reto: true },
};
export const esReto = (f) => Boolean(FORMATOS[f]?.reto);
export const FORMATO_IDS = Object.keys(FORMATOS);
export const MAX_VIDEOS = 5;
export const formatoValido = (f) => (FORMATO_IDS.includes(f) ? f : 'webinar');
export const nVideos = (launchOrFormato) => FORMATOS[formatoValido(typeof launchOrFormato === 'string' ? launchOrFormato : launchOrFormato?.formato)].n;

// Nombre de cada vídeo según el formato.
export function nombreVideo(formato, k) {
  const f = formatoValido(formato);
  if (f === 'webinar') return 'Webinar en directo';
  if (f === 'plf') return `PLC ${k}`;
  if (FORMATOS[f].reto) return `Día ${k}`;
  return `Vídeo ${k}`;
}

// Señales de cada vídeo: el 1 sin número (las de siempre), el resto con él.
export const sigDirecto = (k) => (k === 1 ? 'directo' : `directo${k}`);
export const sigReplay = (k) => (k === 1 ? 'replay' : `replay${k}`);

export const CAMPOS_VIDEO = ['fecha', 'hora', 'zoomMeetingId', 'zoomJoinUrl', 'replayUrl', 'replayVideoUrl', 'replayAt'];
const LEGADO = { fecha: 'fechaDirecto', hora: 'horaDirecto', zoomMeetingId: 'zoomMeetingId', zoomJoinUrl: 'zoomJoinUrl', replayUrl: 'replayUrl', replayVideoUrl: 'replayVideoUrl', replayAt: 'replayAt' };

// Los vídeos del lanzamiento, todos con la misma forma:
// { k, nombre, fecha, hora, zoomMeetingId, zoomJoinUrl, replayUrl, replayVideoUrl, replayAt, directo, replay, venta }
export function videosDe(launch) {
  if (!launch) return [];
  const n = nVideos(launch);
  const out = [];
  for (let k = 1; k <= n; k++) {
    const src = k === 1 ? Object.fromEntries(CAMPOS_VIDEO.map((c) => [c, launch[LEGADO[c]] || ''])) : (launch.videos?.[k - 2] || {});
    const v = { k, nombre: nombreVideo(launch.formato, k), directo: sigDirecto(k), replay: sigReplay(k), venta: k === n };
    for (const c of CAMPOS_VIDEO) v[c] = src[c] || '';
    out.push(v);
  }
  return out;
}
export const videoVenta = (launch) => videosDe(launch).at(-1) || null;
// ¿Es en directo? (tiene Zoom). Si no, es un vídeo grabado que se publica a su hora.
export const esEnDirecto = (v) => Boolean(v?.zoomMeetingId || v?.zoomJoinUrl);

// ---- Prelanzamiento: clases grabadas de la página preclase (1, 2 o 3) y entrada VIP (sí o no) ----
// Van en el embudo (como el formato) y se copian a cada lanzamiento: launch.nClases y launch.vip.
export const MAX_CLASES = 3;
export const nClases = (l) => ([1, 2, 3].includes(Number(l?.nClases)) ? Number(l.nClases) : 2);
export const clasesDe = (l) => Array.from({ length: nClases(l) }, (_, i) => `clase${i + 1}`);
export const conVip = (l) => l?.vip !== false;
