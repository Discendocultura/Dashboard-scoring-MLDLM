// Datos de la página de recursos / grabación de un lanzamiento (público, lo lee tracker.js).
//   GET /api/page?l=<código|auto>&cid=<id>&preview=<token>
// Devuelve la fase actual, la barra de urgencia, los vídeos (la URL solo cuando ya están
// desbloqueados), los enlaces y los textos con fechas. Con `cid` dice además si ya es VIP y si
// ya ha rellenado la encuesta (si el lanzamiento la exige, las clases 1 y 2 no se ven sin ella).
import { getConfig } from '../lib/config-store.js';
import { clienteActual } from '../lib/cliente.js';
import { getContact, countByTag } from '../lib/ghl.js';
import { currentLaunch } from '../lib/digest.js';
import { verifyToken, signToken, requireRole } from '../lib/auth.js';
import { marcarActividad } from '../lib/actividad.js';
import { json, errorResponse, CORS_HEADERS } from '../lib/http.js';
import { signalsFor, withContactId, tagFor } from '../public/js/scoring.js';
import { phaseAt, barFor, milestones, redirectFor, madridToEpoch, formatLong, formatDate, formatTime, googleCalendarUrl } from '../public/js/page.js';
import { videosDe, conVip, nClases } from '../public/js/videos.js';
import { conProducto, nombreProducto } from '../public/js/producto.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request, ctx) {
  try {
    const url = new URL(request.url);
    const config = await getConfig();
    const asked = url.searchParams.get('l') || 'auto';
    const code = asked === 'auto' ? currentLaunch(config) : asked;
    const launch = code && config.launches[code];
    if (!launch) return json({ error: 'Lanzamiento no encontrado' }, 404, CORS_HEADERS);
    // Para el alta guiada: las páginas de GHL ya llevan el código del dashboard.
    if (!url.searchParams.has('preview')) { const a = marcarActividad('pagina'); ctx?.waitUntil?.(a); }

    // Vista previa: el dashboard genera un enlace firmado para ver la página "como si fuera" otra fecha.
    let now = Date.now();
    let preview = false;
    const token = url.searchParams.get('preview');
    if (token) {
      const v = await verifyToken(token);
      if (v && /^\d{10,}$/.test(v)) { now = Number(v); preview = true; }
    }

    const cid = /^[A-Za-z0-9]{6,40}$/.test(url.searchParams.get('cid') || '') ? url.searchParams.get('cid') : '';
    const m = milestones(launch);
    const phase = phaseAt(launch, now);
    const vipOpen = conVip(launch) && Boolean(launch.vipUrl) && (m.directo == null || now < m.directo);
    const cq = clienteActual().principal ? '' : `&c=${encodeURIComponent(clienteActual().id)}`;
    const live = `${url.origin}/directo?l=${encodeURIComponent(code)}${cq}`;

    const links = {
      ...(launch.enlaces || {}),
      whatsapp: launch.whatsappUrl || '',
      vip: vipOpen ? withContactId(launch.vipUrl, cid) : '',
      directo: cid ? `${live}&cid=${cid}` : live,
      grabacion: withContactId(launch.replayUrl, cid),
      venta: withContactId(launch.raicesUrl, cid),
      pago: withContactId(launch.ventaUrl, cid),
      'pago-fraccionado': withContactId(launch.ventaFraccionadoUrl, cid),
      llamada: launch.llamadaUrl || '',
      recursos: launch.recursosUrl || '',
      // Añadir al calendario: el enlace configurado o, si no hay, uno de Google Calendar generado solo.
      calendario: launch.calendarioUrl || googleCalendarUrl({
        title: launch.name || 'Clase en directo', start: m.directo,
        details: `Entra al directo aquí: ${live}`,
      }),
      'calendario-ics': m.directo != null ? `${url.origin}/api/ics?l=${encodeURIComponent(code)}${cq}` : '',
      login: launch.loginUrl || '',
    };
    // Lanzamientos de varios vídeos: entrar al directo y ver cada vídeo (directo2, grabacion2…).
    const vids = videosDe(launch);
    for (const v of vids.slice(1)) {
      links[`directo${v.k}`] = `${live}&v=${v.k}${cid ? `&cid=${cid}` : ''}`;
      links[`grabacion${v.k}`] = withContactId(v.replayUrl, cid);
    }

    let contact = null;
    if (cid) {
      try {
        contact = await getContact(cid);
      } catch (e) {
        console.error(e);
      }
    }
    const sig = contact ? signalsFor(contact.tags, code, launch, contact) : null;
    const isVip = sig ? sig.vip : null;

    // Encuesta: si hay etiqueta configurada, las clases 1 y 2 solo se entregan a quien la tiene.
    // En la vista previa del dashboard (sin contacto) se muestran como si ya la hubiera rellenado.
    const encuestaRequired = Boolean(launch.encuestaTag);
    const encuestaDone = !encuestaRequired || (sig ? sig.encuesta : preview && !cid);
    links.encuesta = encuestaDone && encuestaRequired && !preview ? '' : encuestaUrl(launch.encuestaUrl, contact);

    const videoDe = (src, unlockAt, gated = false) => {
      const unlocked = Boolean(src) && (unlockAt == null || now >= unlockAt);
      const blocked = gated && !encuestaDone;
      return {
        unlockAt, unlockText: formatLong(unlockAt), unlocked, needsEncuesta: blocked,
        url: unlocked && !blocked ? src : '',
      };
    };
    const video = (urlKey, unlockAt, gated = false) => videoDe(launch[urlKey], unlockAt, gated);

    const bar = barFor(launch, phase.id);
    let vendidas = 0;
    try {
      vendidas = await vipVendidas(code, launch);
    } catch (e) {
      console.error(e);
    }
    const vipContador = (launch.vipContadorBase ?? 41) + vendidas;

    return json({
      code,
      name: launch.name,
      now,
      preview,
      phase: phase.id,
      countdownTo: phase.countdownTo,
      changesAt: phase.changesAt,
      redirectTo: redirectFor(launch, phase.id),
      bar: { text: conProducto(bar.text, nombreProducto(config)), button: bar.button && links[bar.button] ? { key: bar.button, label: bar.buttonLabel, href: links[bar.button] } : null },
      videos: {
        clase1: video('clase1Url', m.clase1, true),
        clase2: video('clase2Url', m.clase2, true),
        ...(nClases(launch) >= 3 ? { clase3: video('clase3Url', m.clase3, true) } : {}),
        replay: video('replayVideoUrl', m.replay),
        // <div data-lsd-video="replay2"> … : vídeos 2, 3 y 4 del lanzamiento
        ...Object.fromEntries(vids.slice(1).map((v) => [`replay${v.k}`, videoDe(v.replayVideoUrl, m.videos[v.k - 1].replay)])),
      },
      // Vídeos que se muestran tal cual (sin medir ni bloquear): <div data-lsd-embed="gracias">
      embeds: { gracias: launch.graciasVideoUrl || '' },
      links,
      encuesta: { required: encuestaRequired, done: encuestaDone },
      // Inicio de cada vídeo del lanzamiento (cuentas atrás data-lsd-countdown="directo2"…).
      directos: Object.fromEntries(m.videos.map((v) => [v.k === 1 ? 'directo' : `directo${v.k}`, v.inicio])),
      vip: { open: vipOpen, closesAt: m.directo, isVip, precio: launch.precioVip || 0, contador: vipContador },
      texts: {
        ...(launch.textos || {}),
        nombre: launch.name || '',
        fechaDirecto: formatDate(m.directo), horaDirecto: formatTime(m.directo), directo: formatLong(m.directo),
        clase1: formatLong(m.clase1), clase2: formatLong(m.clase2), clase3: formatLong(m.clase3), replay: formatLong(m.replay),
        cierreVip: formatLong(m.directo), cierreCarrito: formatLong(m.cierre),
        precioVip: euros(launch.precioVip),
        vipContador: String(vipContador),
        // Vídeos 2-4: fechaDirecto2, horaDirecto2, directo2, replay2…
        ...Object.fromEntries(m.videos.slice(1).flatMap((v) => [
          [`fechaDirecto${v.k}`, formatDate(v.inicio)], [`horaDirecto${v.k}`, formatTime(v.inicio)], [`directo${v.k}`, formatLong(v.inicio)], [`replay${v.k}`, formatLong(v.replay)],
        ])),
      },
    }, 200, { ...CORS_HEADERS, 'cache-control': 'no-store' });
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}

// Enlace a la encuesta con el email, nombre y teléfono ya rellenos (GHL rellena los campos
// del formulario/encuesta con esos parámetros de la URL), para que la etiqueta caiga en el mismo contacto.
function encuestaUrl(base, contact) {
  if (!base) return '';
  if (!contact) return base;
  try {
    const u = new URL(base);
    const set = (k, v) => { if (v && !u.searchParams.has(k)) u.searchParams.set(k, v); };
    set('email', contact.email);
    set('first_name', contact.firstName);
    set('last_name', contact.lastName);
    set('phone', contact.phone);
    return u.toString();
  } catch {
    return base;
  }
}

// 27 → "27 €", 27.5 → "27,50 €" (formato español).
export function euros(n) {
  if (!n) return '';
  return `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
}

// VIP vendidas en este lanzamiento = quien tiene la etiqueta VIP menos las que ya la tenían antes
// (la "foto" las marcó con <código>_vip_previo). Se guarda 1 minuto para no consultar GHL en cada visita.
const vipCache = new Map();
async function vipVendidas(code, launch) {
  if (!launch.vipTag) return 0;
  const key = `${clienteActual().id}:${code}`;
  const hit = vipCache.get(key);
  if (hit && hit.at > Date.now() - 60_000 && hit.tag === launch.vipTag) return hit.n;
  const [total, previas] = await Promise.all([countByTag(launch.vipTag), countByTag(tagFor(code, 'vip_previo'))]);
  const n = Math.max(0, total - previas);
  vipCache.set(key, { at: Date.now(), n, tag: launch.vipTag });
  return n;
}

// POST (admin): enlace firmado para ver la página como si fuera otra fecha/hora.
export async function POST(request) {
  try {
    await requireRole(request, { permiso: 'config' });
    const { at } = await request.json().catch(() => ({}));
    const epoch = madridToEpoch(at);
    if (epoch == null) return json({ error: 'Fecha no válida' }, 400);
    return json({ token: await signToken(String(epoch)) });
  } catch (e) {
    return errorResponse(e);
  }
}
