// Datos de la página de recursos / grabación de un lanzamiento (público, lo lee tracker.js).
//   GET /api/page?l=<código|auto>&cid=<id>&preview=<token>
// Devuelve la fase actual, la barra de urgencia, los vídeos (la URL solo cuando ya están
// desbloqueados), los enlaces y los textos con fechas. Con `cid` dice además si ya es VIP y si
// ya ha rellenado la encuesta (si el lanzamiento la exige, las clases 1 y 2 no se ven sin ella).
import { getConfig } from '../lib/config-store.js';
import { getContact, countByTag } from '../lib/ghl.js';
import { currentLaunch } from '../lib/digest.js';
import { verifyToken, signToken, requireRole } from '../lib/auth.js';
import { json, errorResponse, CORS_HEADERS } from '../lib/http.js';
import { signalsFor, withContactId, tagFor } from '../public/js/scoring.js';
import { phaseAt, barFor, milestones, madridToEpoch, formatLong, formatDate, formatTime, googleCalendarUrl } from '../public/js/page.js';

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const config = await getConfig();
    const asked = url.searchParams.get('l') || 'auto';
    const code = asked === 'auto' ? currentLaunch(config) : asked;
    const launch = code && config.launches[code];
    if (!launch) return json({ error: 'Lanzamiento no encontrado' }, 404, CORS_HEADERS);

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
    const vipOpen = Boolean(launch.vipUrl) && (m.directo == null || now < m.directo);
    const live = `${url.origin}/directo?l=${encodeURIComponent(code)}`;

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
      'calendario-ics': m.directo != null ? `${url.origin}/api/ics?l=${encodeURIComponent(code)}` : '',
      login: launch.loginUrl || '',
    };

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

    const video = (urlKey, unlockAt, gated = false) => {
      const unlocked = Boolean(launch[urlKey]) && (unlockAt == null || now >= unlockAt);
      const blocked = gated && !encuestaDone;
      return {
        unlockAt, unlockText: formatLong(unlockAt), unlocked, needsEncuesta: blocked,
        url: unlocked && !blocked ? launch[urlKey] : '',
      };
    };

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
      redirectTo: phase.id === 'en_directo' ? 'directo' : (phase.id === 'replay' || phase.id === 'cerrado') ? 'grabacion' : '',
      bar: { text: bar.text, button: bar.button && links[bar.button] ? { key: bar.button, label: bar.buttonLabel, href: links[bar.button] } : null },
      videos: {
        clase1: video('clase1Url', m.clase1, true),
        clase2: video('clase2Url', m.clase2, true),
        replay: video('replayVideoUrl', m.replay),
      },
      // Vídeos que se muestran tal cual (sin medir ni bloquear): <div data-lsd-embed="gracias">
      embeds: { gracias: launch.graciasVideoUrl || '' },
      links,
      encuesta: { required: encuestaRequired, done: encuestaDone },
      vip: { open: vipOpen, closesAt: m.directo, isVip, precio: launch.precioVip || 0, contador: vipContador },
      texts: {
        ...(launch.textos || {}),
        nombre: launch.name || '',
        fechaDirecto: formatDate(m.directo), horaDirecto: formatTime(m.directo), directo: formatLong(m.directo),
        clase1: formatLong(m.clase1), clase2: formatLong(m.clase2), replay: formatLong(m.replay),
        cierreVip: formatLong(m.directo), cierreCarrito: formatLong(m.cierre),
        precioVip: euros(launch.precioVip),
        vipContador: String(vipContador),
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
  const hit = vipCache.get(code);
  if (hit && hit.at > Date.now() - 60_000 && hit.tag === launch.vipTag) return hit.n;
  const [total, previas] = await Promise.all([countByTag(launch.vipTag), countByTag(tagFor(code, 'vip_previo'))]);
  const n = Math.max(0, total - previas);
  vipCache.set(code, { at: Date.now(), n, tag: launch.vipTag });
  return n;
}

// POST (admin): enlace firmado para ver la página como si fuera otra fecha/hora.
export async function POST(request) {
  try {
    await requireRole(request, { tecnico: true });
    const { at } = await request.json().catch(() => ({}));
    const epoch = madridToEpoch(at);
    if (epoch == null) return json({ error: 'Fecha no válida' }, 400);
    return json({ token: await signToken(String(epoch)) });
  } catch (e) {
    return errorResponse(e);
  }
}
