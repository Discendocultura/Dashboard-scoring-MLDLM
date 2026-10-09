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
import { phaseAt, barFor, replayBarraDe, ventaBarraDe, textosPago, enlaceWhatsApp, milestones, redirectFor, madridToEpoch, formatLong, formatDate, formatTime, googleCalendarUrl } from '../public/js/page.js';
import { videosDe, conVip, nClases, esEnDirecto, sigReplay } from '../public/js/videos.js';
import { planesActivos, enlacePago } from '../public/js/pago.js';
import { conProducto, nombreProducto } from '../public/js/producto.js';
import { recursosDe, tieneRecurso, etapasPreclase, preguntasValidas, UMBRAL_DESBLOQUEO } from '../public/js/recursos.js';
import { votoDe, votosDe, resultadosVotos } from '../lib/votos.js';

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
      pago: withContactId(enlacePago(launch, launch.ventaUrl), cid),
      // Página de pago (ahí se elige pago único o fraccionado): la de los botones «Quiero inscribirme».
      // Sin ella, el pago único.
      'pagina-pago': withContactId(launch.paginaPagoUrl || enlacePago(launch, launch.ventaUrl), cid),
      'pago-fraccionado': withContactId(launch.ventaFraccionadoUrl, cid),
      ...Object.fromEntries(planesActivos(launch).map((p) => [`plan-${p.id}`, withContactId(p.url, cid)])),
      llamada: launch.llamadaUrl || '',
      // WhatsApp para resolver dudas (páginas de venta y de replay): tal cual, sin el ID de la lead.
      'whatsapp-dudas': launch.whatsappDudas?.numero ? enlaceWhatsApp(launch.whatsappDudas.numero, String(launch.whatsappDudas.mensaje || '').replaceAll('{producto}', nombreProducto(config))) : launch.whatsappDudasUrl || '',
      recursos: launch.recursosUrl || '',
      // Añadir al calendario: el enlace configurado o, si no hay, uno de Google Calendar generado solo.
      calendario: launch.calendarioUrl || googleCalendarUrl({
        title: launch.name || 'Clase en directo', start: m.directo,
        details: `Entra al directo aquí: ${live}`,
      }),
      'calendario-ics': m.directo != null ? `${url.origin}/api/ics?l=${encodeURIComponent(code)}${cq}` : '',
      login: launch.loginUrl || '',
    };
    // Con página de pago intermedia, los botones de pago de las demás páginas (venta, replay…) llevan a ella:
    // allí se elige pago único o fraccionado. Solo en la propia página de pago van al checkout.
    if (launch.paginaPagoUrl && url.searchParams.get('pagina') !== 'pago') {
      for (const k of ['pago', 'pago-fraccionado', ...planesActivos(launch).map((p) => `plan-${p.id}`)]) links[k] = links['pagina-pago'];
    }
    // Lanzamientos de varios vídeos: entrar al directo y ver cada vídeo (directo2, grabacion2…).
    const vids = videosDe(launch);
    for (const v of vids.slice(1)) {
      // Solo los vídeos en directo tienen sala de Zoom (un estreno grabado va a su página, no al directo).
      if (esEnDirecto(v)) links[`directo${v.k}`] = `${live}&v=${v.k}${cid ? `&cid=${cid}` : ''}`;
      links[`grabacion${v.k}`] = withContactId(v.replayUrl, cid);
    }

    // Página de venta: solo su barra fija (sin llamar a GHL: la visitan muchas a la vez al abrir el carrito).
    // La de pago, igual: su barra, los textos y precios de los cajetines y los enlaces.
    const ligera = url.searchParams.get('pagina');
    // Gracias por agendar la llamada: el vídeo de confirmación y los enlaces (sin llamar a GHL).
    if (ligera === 'llamada') {
      const enlaces = Object.fromEntries(['llamada', 'whatsapp-dudas', 'whatsapp'].map((k) => [k, links[k] || '']));
      return json({ code, now, preview, links: enlaces, texts: {}, embeds: { llamada: launch.llamadaVideoUrl || '' } }, 200, CORS_HEADERS);
    }
    if (ligera === 'venta' || ligera === 'pago') {
      const vb = ventaBarraDe(ligera === 'pago' ? { ventaBarra: launch.paginaPago?.barra } : launch, links);
      const producto = nombreProducto(config);
      // Enlaces de los botones de la página de venta (pago, llamada, WhatsApp de dudas), con el ID de la lead.
      const enlacesVenta = Object.fromEntries(['pagina-pago', 'pago', 'pago-fraccionado', 'llamada', 'whatsapp-dudas', 'whatsapp'].map((k) => [k, links[k] || '']));
      for (const p of planesActivos(launch)) enlacesVenta[`plan-${p.id}`] = links[`plan-${p.id}`] || '';
      const texts = Object.fromEntries(Object.entries(textosPago(launch, { unico: euros(launch.precioPrograma), fraccionado: euros(launch.precioFraccionado) })).map(([k, v]) => [k, conProducto(v, producto)]));
      return json({ code, now, preview, links: enlacesVenta, texts, ventaBarra: vb && { ...vb, tramos: vb.tramos.map((t) => ({ ...t, text: conProducto(t.text, producto), boton: t.boton && { ...t.boton, label: conProducto(t.boton.label, producto) } })) } }, 200, CORS_HEADERS);
    }

    // A la hora del directo la preclase solo necesita saber adónde ir: se contesta sin llamar a GHL
    // (entran cientos a la vez y GHL admite ~100 peticiones cada 10 s).
    const destino = redirectFor(launch, phase.id);
    if (url.searchParams.get('pagina') === 'recursos' && !preview && /^directo\d?$/.test(destino) && links[destino]) {
      const v = vids[(Number(destino.slice(7)) || 1) - 1];
      const zoom = v?.zoomMeetingId ? { [destino]: String(v.zoomMeetingId).replace(/\D/g, '') } : {};
      return json({ code, name: launch.name, now, preview, phase: phase.id, redirectTo: destino, links: { [destino]: links[destino] }, zoom }, 200, CORS_HEADERS);
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
    // Quien ya la rellenó en un lanzamiento anterior (misma encuesta y etiqueta) no tiene que repetirla.
    const encuestaDone = !encuestaRequired || (sig ? sig.encuesta || sig.encuesta_anterior : preview && !cid);
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

    // Recursos de la preclase (música, test, votación, descargable) y estado de cada etapa.
    const { recursos, etapas } = await recursosPagina(code, launch, { now, sig, contact, encuestaDone, preview, m });
    if (recursos.test?.url) links.test = recursos.test.url;
    if (recursos.descargable?.url) links.descargable = recursos.descargable.url;

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
      // Página de replay con el carrito abierto: barra fija con cuenta atrás que al llegar a cero lleva a la venta.
      // `video`: solo la página de la grabación del vídeo de venta (en los de varios vídeos, el último).
      replayBarra: (() => {
        const rb = phase.id === 'replay' && links.venta ? replayBarraDe(launch) : null;
        return rb ? { ...rb, text: conProducto(rb.text, nombreProducto(config)), boton: conProducto(rb.boton, nombreProducto(config)), video: sigReplay(vids.length || 1) } : null;
      })(),
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
      embeds: { gracias: launch.graciasVideoUrl || '', llamada: launch.llamadaVideoUrl || '' },
      // Pantalla de espera antes del directo: si está activa y su vídeo (opcional).
      espera: { activa: launch.espera?.activa !== false, video: launch.espera?.video || '' },
      // Imagen de cada etapa (Configuración → Preclase): <img data-lsd-img="clase1|test|clase2…">
      imagenes: launch.imagenes || {},
      links,
      encuesta: { required: encuestaRequired, done: encuestaDone },
      recursos,
      etapas,
      // Inicio de cada vídeo del lanzamiento (cuentas atrás data-lsd-countdown="directo2"…).
      directos: Object.fromEntries(m.videos.map((v) => [v.k === 1 ? 'directo' : `directo${v.k}`, v.inicio])),
      // Reunión de Zoom de cada directo: el navegador descarta un enlace guardado de una reunión anterior.
      zoom: Object.fromEntries(vids.filter((v) => v.zoomMeetingId && (v.k === 1 || esEnDirecto(v))).map((v) => [v.k === 1 ? 'directo' : `directo${v.k}`, String(v.zoomMeetingId).replace(/\D/g, '')])),
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

// Recursos de la preclase para la página y el estado de cada etapa (bloqueada | disponible | hecha).
//   música: la URL llega en cuanto su clase está disponible; la página la deja escuchar al ver el 75 %
//           de la clase (lo sabe la propia página mientras se ve, o por la etiqueta <código>_claseN_75).
//   test: la URL (con el email ya puesto) desde su fecha y con la encuesta rellenada; hecho = tiene su etiqueta de GHL.
//   votación: la pregunta, las opciones, el voto de la lead y, si ya votó, los resultados.
async function recursosPagina(code, launch, { now, sig, contact, encuestaDone, preview, m }) {
  const r = recursosDe(launch);
  const vistaClase = (k) => Boolean(sig?.[`${k}_${UMBRAL_DESBLOQUEO}`] || sig?.[`${k}_90`]);
  const claseDisponible = (k) => Boolean(launch[`${k}Url`]) && encuestaDone && (m[k] == null || now >= m[k]);
  const recursos = {};
  if (tieneRecurso(launch, 'musica')) {
    const k = r.musica.tras;
    recursos.musica = { nombre: r.musica.nombre, texto: r.musica.texto, tras: k, umbral: UMBRAL_DESBLOQUEO, claseDisponible: claseDisponible(k), claseVista: vistaClase(k) || (preview && !contact), url: claseDisponible(k) ? r.musica.url : '', escuchada: Boolean(sig?.musica_play) };
  }
  if (tieneRecurso(launch, 'test')) {
    const at = madridToEpoch(r.test.at);
    const unlocked = at == null || now >= at;
    // Además de su fecha, hace falta haber rellenado la encuesta (etapa 1) si el lanzamiento la tiene.
    const faltaEncuesta = !encuestaDone;
    recursos.test = { nombre: r.test.nombre, unlockAt: at, unlockText: formatLong(at), unlocked, faltaEncuesta, done: Boolean(sig?.test), url: unlocked && !faltaEncuesta ? encuestaUrl(r.test.url, contact) : '' };
  }
  if (tieneRecurso(launch, 'votacion')) {
    const k = r.votacion.tras;
    const preguntas = preguntasValidas(r.votacion);
    const misRespuestas = contact ? await votoDe(code, contact.id).catch(() => ({})) : {};
    const respondida = Object.keys(misRespuestas).length > 0;
    recursos.votacion = {
      preguntas, tras: k, umbral: UMBRAL_DESBLOQUEO,
      claseDisponible: claseDisponible(k), claseVista: vistaClase(k) || (preview && !contact), misRespuestas, respondida,
      resultados: respondida || (preview && !contact) ? resultadosVotos(await votosDe(code).catch(() => ({})), preguntas) : null,
    };
  }
  if (tieneRecurso(launch, 'descargable')) {
    const at = madridToEpoch(r.descargable.at);
    const unlocked = at == null || now >= at;
    recursos.descargable = { nombre: r.descargable.nombre, unlockAt: at, unlockText: formatLong(at), unlocked, abierto: Boolean(sig?.descarga), url: unlocked ? r.descargable.url : '' };
  }
  const enDirecto = m.directo != null && now >= m.directo - 30 * 60_000;
  const etapas = etapasPreclase(launch, nClases(launch)).map((e) => {
    let estado = 'disponible';
    if (e.tipo === 'encuesta') estado = encuestaDone ? 'hecha' : 'disponible';
    else if (e.tipo === 'clase') estado = !claseDisponible(e.id) ? 'bloqueada' : vistaClase(e.id) ? 'hecha' : 'disponible';
    else if (e.tipo === 'test') estado = !recursos.test.unlocked || recursos.test.faltaEncuesta ? 'bloqueada' : recursos.test.done ? 'hecha' : 'disponible';
    else if (e.tipo === 'descargable') estado = !recursos.descargable.unlocked ? 'bloqueada' : recursos.descargable.abierto ? 'hecha' : 'disponible';
    else if (e.tipo === 'directo') estado = sig?.directo_asistio ? 'hecha' : enDirecto ? 'disponible' : 'bloqueada';
    const at = e.tipo === 'directo' ? m.directo : e.at;
    return { n: e.n, id: e.id, tipo: e.tipo, label: e.label, estado, unlockAt: at ?? null, unlockText: formatLong(at) };
  });
  return { recursos, etapas };
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
