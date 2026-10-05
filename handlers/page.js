// Datos de la página de recursos / grabación de un lanzamiento (público, lo lee tracker.js).
//   GET /api/page?l=<código|auto>&cid=<id>&preview=<token>
// Devuelve la fase actual, la barra de urgencia, los vídeos (la URL solo cuando ya están
// desbloqueados), los enlaces y los textos con fechas. Con `cid` dice además si ya es VIP.
import { getConfig } from '../lib/config-store.js';
import { getContact } from '../lib/ghl.js';
import { currentLaunch } from '../lib/digest.js';
import { verifyToken, signToken, requireRole } from '../lib/auth.js';
import { json, errorResponse, CORS_HEADERS } from '../lib/http.js';
import { signalsFor, withContactId } from '../public/js/scoring.js';
import { phaseAt, barFor, milestones, madridToEpoch, formatLong, formatDate, formatTime } from '../public/js/page.js';

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
      llamada: launch.llamadaUrl || '',
      recursos: launch.recursosUrl || '',
      login: launch.loginUrl || '',
    };

    const video = (urlKey, unlockAt) => {
      const unlocked = Boolean(launch[urlKey]) && (unlockAt == null || now >= unlockAt);
      return { unlockAt, unlockText: formatLong(unlockAt), unlocked, url: unlocked ? launch[urlKey] : '' };
    };

    const bar = barFor(launch, phase.id);
    let isVip = null;
    if (cid) {
      try {
        const c = await getContact(cid);
        if (c) isVip = signalsFor(c.tags, code, launch, c).vip;
      } catch (e) {
        console.error(e);
      }
    }

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
        clase1: video('clase1Url', m.clase1),
        clase2: video('clase2Url', m.clase2),
        replay: video('replayVideoUrl', m.replay),
      },
      links,
      vip: { open: vipOpen, closesAt: m.directo, isVip, precio: launch.precioVip || 0 },
      texts: {
        fechaDirecto: formatDate(m.directo), horaDirecto: formatTime(m.directo), directo: formatLong(m.directo),
        clase1: formatLong(m.clase1), clase2: formatLong(m.clase2), replay: formatLong(m.replay),
        cierreVip: formatLong(m.directo), cierreCarrito: formatLong(m.cierre),
        precioVip: launch.precioVip ? `${launch.precioVip} €` : '',
      },
    }, 200, { ...CORS_HEADERS, 'cache-control': 'no-store' });
  } catch (e) {
    return errorResponse(e, CORS_HEADERS);
  }
}

// POST (admin): enlace firmado para ver la página como si fuera otra fecha/hora.
export async function POST(request) {
  try {
    await requireRole(request, { admin: true });
    const { at } = await request.json().catch(() => ({}));
    const epoch = madridToEpoch(at);
    if (epoch == null) return json({ error: 'Fecha no válida' }, 400);
    return json({ token: await signToken(String(epoch)) });
  } catch (e) {
    return errorResponse(e);
  }
}
