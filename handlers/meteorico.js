// Meteóricos (ofertas flash).
//   GET  /api/meteorico?m=<código>               → métricas (ventas, facturación, visitas, compradoras…) — equipo
//   GET  /api/meteorico?m=<código>&estado=1      → fase y horas (pública: la usa la página de la oferta)
//   POST { op: 'visita', m }                       → cuenta una visita a la página de la oferta (pública)
//   POST { op: 'foto', m }                         → «foto» de quién ya tenía la etiqueta de compra (antes de abrir)
// El público no se mide (grupos de WhatsApp, listas): las ventas salen de la etiqueta de compra con su
// fecha (campo de fecha de compra) o, sin ella, de quien no estaba en la foto.
import { requireSession } from '../lib/auth.js';
import { getConfig } from '../lib/config-store.js';
import { leerJSON, guardarJSON, reintentando } from '../lib/store.js';
import { todosLosLeads } from '../lib/resumen.js';
import { adSpend, metaConfigured } from '../lib/meta.js';
import { metricasMeteorico, faseMeteorico, tiemposMeteorico } from '../public/js/meteorico.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { enlacePago, planesActivos, planDeTags } from '../public/js/pago.js';
import { json, readBody, errorResponse, CORS_HEADERS } from '../lib/http.js';

// La página de la oferta está en el dominio de GHL: sus llamadas (estado y visita) necesitan CORS.
export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const claveVisitas = (code) => `lsd_meteo_visitas_${code}`;
const claveFoto = (code) => `lsd_meteo_previo_${code}`;

async function meteoricoDe(code) {
  const config = await getConfig();
  const m = config.meteoricos?.[code];
  if (!m) throw bad('Meteórico no encontrado', 404);
  return { config, m };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('m') || '';
    // Pública: la página de la oferta pregunta en qué fase está (cuenta atrás, abrir o cerrar).
    if (url.searchParams.has('estado')) {
      const { m } = await meteoricoDe(code);
      const f = faseMeteorico(m);
      const T = tiemposMeteorico(m);
      return json({ fase: f.id, ahora: Date.now(), ...T, textos: m.textos || {}, cerradaUrl: m.cerradaUrl || '', pagoUrl: enlacePago(m, m.pagoUrl), nombre: m.name,
        // Suscripción: un botón por plan.
        planes: planesActivos(m).filter((p) => p.url).map((p) => ({ label: p.label, precio: p.precio, periodo: p.periodo, url: p.url })) }, 200, CORS_HEADERS);
    }
    await requireSession(request, { permiso: ['metricas', 'leads', 'hoy'] });
    const { m } = await meteoricoDe(code);
    const [contactos, visitas, foto] = await Promise.all([
      m.compraTag ? todosLosLeads(m.compraTag, [m.compraDateField].filter(Boolean)) : [],
      leerJSON(claveVisitas(code), () => ({ total: 0, porDia: {} })),
      leerJSON(claveFoto(code), () => null),
    ]);
    let inversion = null;
    let metaError = '';
    if (metaConfigured() && (m.metaFiltro || m.calentamiento)) {
      try {
        const desde = m.calentamiento || String(m.apertura).slice(0, 10);
        const hasta = String(m.cierre || m.apertura).slice(0, 10) || dayInMadrid(new Date().toISOString());
        if (desde && hasta >= desde) inversion = (await adSpend({ since: desde, until: hasta, filter: m.metaFiltro || code })).total || null;
      } catch (e) { metaError = e.publicMessage || e.message; }
    }
    const r = metricasMeteorico(contactos, m, { previo: foto ? new Set(foto.ids) : null, visitas, inversion });
    return json({
      ...r,
      compradores: r.compradores.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, fecha: m.compraDateField ? String(c.cf?.[m.compraDateField] || '').slice(0, 10) : '', fraccionado: (c.tags || []).some((t) => String(t).toLowerCase() === m.fraccionadoTag), plan: planDeTags(c.tags, m) })),
      visitasPorDia: visitas?.porDia || {},
      foto: foto ? { at: foto.at, n: foto.ids.length } : null,
      inversionFuente: inversion != null ? 'meta' : m.inversion ? 'manual' : '', metaError,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    const code = String(body.m || '');
    if (body.op === 'visita') {
      const { m } = await meteoricoDe(code);
      // Solo cuenta mientras tiene sentido (calentamiento, abierta y el día del cierre).
      if (faseMeteorico(m).id === 'preparacion') return json({ ok: true }, 200, CORS_HEADERS);
      const dia = dayInMadrid(new Date().toISOString());
      await reintentando(async () => {
        const v = await leerJSON(claveVisitas(code), () => ({ total: 0, porDia: {} }));
        v.total = (v.total || 0) + 1;
        v.porDia = { ...(v.porDia || {}), [dia]: (v.porDia?.[dia] || 0) + 1 };
        await guardarJSON(claveVisitas(code), v);
      });
      return json({ ok: true }, 200, CORS_HEADERS);
    }
    if (body.op === 'foto') {
      await requireSession(request, { permiso: 'config' });
      const { m } = await meteoricoDe(code);
      if (!m.compraTag) throw bad('Pon antes la etiqueta de compra del meteórico');
      const ids = (await todosLosLeads(m.compraTag)).map((c) => c.id);
      const foto = { at: new Date().toISOString(), ids };
      await guardarJSON(claveFoto(code), foto, { version: null, motivo: `foto de compradoras previas del meteórico ${code}` });
      return json({ ok: true, foto: { at: foto.at, n: ids.length } });
    }
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
