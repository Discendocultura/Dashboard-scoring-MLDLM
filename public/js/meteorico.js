// Meteóricos: ofertas flash (normalmente 12 horas) con unos días de calentamiento por email y WhatsApp.
// Pueden ir solos (embudo «⚡ Meteóricos», p. ej. Black Friday a la base de datos) o como downsell tras
// un lanzamiento (`lanzamiento`: su código). El público no se mide (grupos de WhatsApp, listas): se
// miden las ventas (etiqueta de compra), la facturación, las visitas a la página de la oferta y los tiempos.
// Lo usan el navegador, el servidor y la página de la oferta.
import { madridToEpoch } from './page.js';
import { conFraccionado, esSuscripcion, importeVenta, planDeTags, resumenPlanes, pendientesPago, enlacePago, planesActivos } from './pago.js';
import { addDays } from './tareas.js';

const DAY = 86_400_000;
export const FASES_METEORICO = {
  preparacion: { label: 'En preparación', tono: 'info' },
  calentamiento: { label: 'Calentando', tono: 'vip' },
  abierta: { label: 'Oferta abierta', tono: 'buy' },
  cerrada: { label: 'Cerrada', tono: '' },
};

// Momentos clave (epoch ms o null): inicio del calentamiento (00:00 de ese día), apertura y cierre.
export function tiemposMeteorico(m = {}) {
  const t = (v) => (v ? madridToEpoch(v) : null);
  return {
    calentamiento: m.calentamiento ? t(`${m.calentamiento}T00:00`) : null,
    apertura: t(m.apertura),
    cierre: t(m.cierre),
  };
}

// Fase en un momento dado y hasta cuándo dura (para la cuenta atrás).
export function faseMeteorico(m, now = Date.now()) {
  const T = tiemposMeteorico(m);
  if (T.cierre != null && now >= T.cierre) return { id: 'cerrada', hasta: null, T };
  if (T.apertura != null && now >= T.apertura) return { id: 'abierta', hasta: T.cierre, T };
  if (T.calentamiento != null && now >= T.calentamiento) return { id: 'calentamiento', hasta: T.apertura, T };
  return { id: 'preparacion', hasta: T.calentamiento ?? T.apertura, T };
}

// Horas que dura la oferta (para el título: «Oferta de 12 horas»).
export const horasOferta = (m) => {
  const T = tiemposMeteorico(m);
  return T.apertura != null && T.cierre != null && T.cierre > T.apertura ? Math.round((T.cierre - T.apertura) / 3_600_000) : null;
};

const dia = (v) => String(v || '').slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const tiene = (c, tag) => Boolean(tag) && (c.tags || []).some((x) => String(x).toLowerCase() === String(tag).toLowerCase());

// ¿Es una venta de ESTE meteórico? Con campo de fecha de compra: comprada entre el calentamiento y el día
// del cierre. Sin él: cualquiera con la etiqueta que no estuviera en la «foto» de antes de abrir.
export function esVentaMeteorico(c, m, previo = null) {
  if (!tiene(c, m.compraTag)) return false;
  const f = m.compraDateField ? dia(c.cf?.[m.compraDateField]) : '';
  if (m.compraDateField && f) {
    const desde = m.calentamiento || dia(m.apertura);
    const hasta = dia(m.cierre) || dia(m.apertura);
    return (!desde || f >= desde) && (!hasta || f <= hasta);
  }
  return !(previo && previo.has(c.id));
}

// Métricas del meteórico a partir de los contactos con la etiqueta de compra.
// `visitas`: { total, porDia } de la página de la oferta; `inversion`: Meta o manual.
export function metricasMeteorico(contactos, m, { previo = null, visitas = null, inversion = null } = {}) {
  const ventas = contactos.filter((c) => esVentaMeteorico(c, m, previo));
  const fraccionado = (c) => conFraccionado(m) && tiene(c, m.fraccionadoTag);
  const plan = (c) => planDeTags(c.tags, m);
  const importe = (c) => importeVenta({ fraccionado: fraccionado(c), plan: plan(c) }, m, { unico: m.precio, fraccionado: m.precioFraccionado });
  const facturacion = ventas.reduce((t, c) => t + importe(c), 0);
  const inv = inversion != null ? inversion : num(m.inversion) || null;
  const porDia = new Map();
  for (const c of ventas) {
    const d = (m.compraDateField && dia(c.cf?.[m.compraDateField])) || '';
    if (d) porDia.set(d, (porDia.get(d) || 0) + 1);
  }
  const vis = visitas?.total || 0;
  const objetivos = [
    ...(num(m.objetivoVentas) ? [{ label: 'Ventas', actual: ventas.length, meta: num(m.objetivoVentas), pct: ventas.length / num(m.objetivoVentas) }] : []),
    ...(num(m.objetivoFacturacion) ? [{ label: 'Facturación', actual: facturacion, meta: num(m.objetivoFacturacion), unit: 'eur', pct: facturacion / num(m.objetivoFacturacion) }] : []),
  ];
  return {
    ventas: ventas.length,
    compradores: ventas,
    fraccionado: ventas.filter(fraccionado).length,
    unico: ventas.filter((c) => !fraccionado(c)).length,
    facturacion,
    ticket: ventas.length ? facturacion / ventas.length : null,
    visitas: vis || null,
    conversion: vis ? ventas.length / vis : null,
    inversion: inv,
    cac: inv && ventas.length ? inv / ventas.length : null,
    roas: inv ? facturacion / inv : null,
    ventasPorDia: [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    objetivos,
    planes: esSuscripcion(m) ? resumenPlanes(ventas, m, plan) : null,
  };
}

// Días del calendario: calentamiento → apertura → cierre.
export function hitosMeteorico(m) {
  const out = [];
  if (m.calentamiento) out.push({ id: 'calentamiento', icon: '🔥', day: m.calentamiento, time: '', titulo: 'Empieza el calentamiento' });
  if (m.apertura) out.push({ id: 'apertura', icon: '⚡', day: dia(m.apertura), time: String(m.apertura).slice(11, 16), titulo: 'Abre la oferta' });
  if (m.cierre) out.push({ id: 'cierre', icon: '🔒', day: dia(m.cierre), time: String(m.cierre).slice(11, 16), titulo: 'Cierra la oferta' });
  return out;
}

// Franjas del calendario: calentamiento (hasta el día antes de abrir) y oferta abierta.
export function fasesMeteoricoCal(m) {
  const ap = dia(m.apertura);
  const ci = dia(m.cierre) || ap;
  const out = [];
  if (m.calentamiento && ap && m.calentamiento < ap) out.push({ id: 'calentamiento', label: 'Calentamiento', from: m.calentamiento, to: addDays(ap, -1) });
  if (ap) out.push({ id: 'oferta', label: 'Oferta abierta', from: ap, to: ci >= ap ? ci : ap });
  return out;
}

// Planificación del meteórico: sus tareas, adaptadas a su configuración (downsell o a la base de datos,
// pago único / a plazos / suscripción, grupo de WhatsApp, anuncios, foto de compradoras…) y con fecha
// relativa a sus hitos. Es una acción rápida: lo que ya debería estar hecho se pone para hoy (acciones
// inmediatas) y, sin fechas todavía, la preparación también es para hoy.
// Devuelve [{ clave, fase, titulo, notas, fecha, rol }].
export function tareasMeteorico(m, { hoy, lanzamiento = '' } = {}) {
  const H = { calentamiento: m.calentamiento || '', apertura: dia(m.apertura), cierre: dia(m.cierre) || dia(m.apertura) };
  const sus = esSuscripcion(m);
  const planes = planesActivos(m).map((p) => p.label.toLowerCase());
  const tag = m.compraTag ? `«${m.compraTag}»` : 'de compra de la oferta';
  const T = [];
  const add = (clave, fase, titulo, base, dias, rol, notas = '') => T.push({ clave, fase, titulo, base, dias, rol, notas });
  // --- Preparación (lo antes posible: el calentamiento dura pocos días)
  add('oferta', 'preparacion', `Cerrar la oferta: ${m.oferta || 'qué se ofrece'}${m.producto ? ` de ${m.producto}` : ''}, precio y condiciones`, 'calentamiento', -4, 'admin');
  if (!H.calentamiento || !H.apertura || !m.cierre) add('fechas', 'preparacion', 'Poner en el dashboard el día del calentamiento y la hora de apertura y cierre', 'calentamiento', -4, 'admin');
  if (lanzamiento) add('segmento', 'preparacion', `Segmentar el público: quien estuvo en «${lanzamiento}» y no compró (excluir a las compradoras)`, 'calentamiento', -3, 'tecnico');
  else add('segmento', 'preparacion', 'Elegir a quién va (listas y etiquetas de la base de datos, grupos de WhatsApp) y segmentarlo en GHL', 'calentamiento', -3, 'admin');
  if (sus) add('pago', 'preparacion', `Crear los planes de la suscripción${planes.length ? ` (${planes.join(', ')})` : ''} con su precio y enlace de pago`, 'calentamiento', -3, 'tecnico');
  else {
    add('pago', 'preparacion', `Crear el enlace de pago de la oferta${num(m.precio) ? ` (${num(m.precio)} €)` : ''}`, 'calentamiento', -3, 'tecnico');
    if (conFraccionado(m) && (m.fraccionadoTag || num(m.precioFraccionado) || m.pagoFraccionadoUrl)) add('pago-plazos', 'preparacion', 'Crear el enlace de pago a plazos de la oferta', 'calentamiento', -3, 'tecnico');
  }
  add('workflow', 'preparacion', `Workflow de compra: que ponga la etiqueta ${tag}${sus ? ' y la de cada plan' : ''}${m.compraDateField ? ' y guarde la fecha de compra' : ''}`, 'calentamiento', -2, 'tecnico');
  add('pagina', 'preparacion', 'Crear la página de la oferta y pegar el código de la cuenta atrás del dashboard', 'calentamiento', -2, 'tecnico');
  if (!m.cerradaUrl) add('pagina-cerrada', 'preparacion', 'Crear la página de «oferta cerrada» y ponerla en el dashboard', 'apertura', -1, 'tecnico');
  add('emails', 'preparacion', 'Escribir y programar los emails del calentamiento, la apertura y el último aviso', 'calentamiento', -2, 'tecnico');
  add('whatsapp', 'preparacion', m.whatsappUrl ? 'Preparar los mensajes y vídeos del grupo de WhatsApp' : 'Crear el grupo de WhatsApp (o elegir los grupos) y preparar los mensajes y vídeos', 'calentamiento', -2, 'admin');
  if (num(m.inversion) || m.metaFiltro) add('anuncios', 'preparacion', `Preparar los anuncios del meteórico${m.metaFiltro ? ` (campañas con «${m.metaFiltro}» en el nombre)` : ''}`, 'calentamiento', -1, 'admin');
  add('pruebas', 'preparacion', 'Probar en el móvil la página, la cuenta atrás y el pago (compra de prueba)', 'apertura', -1, 'tecnico');
  if (m.compraTag && !m.compraDateField) add('foto', 'preparacion', 'Hacer la «foto» de quién ya tenía la etiqueta de compra (botón en ⚡ Meteóricos)', 'apertura', -1, 'admin', 'Sin campo de fecha de compra, es la única forma de no contar como ventas a las clientas anteriores.');
  // --- Calentamiento
  add('cal-inicio', 'calentamiento', 'Empieza el calentamiento: primer email y mensaje de WhatsApp', 'calentamiento', 0, 'tecnico');
  add('cal-contenido', 'calentamiento', 'Contenido de calentamiento cada día (WhatsApp, emails, stories)', 'calentamiento', 1, 'admin');
  if (num(m.inversion) || m.metaFiltro) add('anuncios-on', 'calentamiento', 'Activar los anuncios y revisar el coste en el dashboard', 'calentamiento', 0, 'admin');
  add('cal-manana', 'calentamiento', 'Aviso: «mañana se abre la oferta» (email + WhatsApp)', 'apertura', -1, 'tecnico');
  // --- Oferta abierta
  add('apertura', 'oferta', 'Abrir la oferta: comprobar el botón de compra y enviar el email y el WhatsApp de apertura', 'apertura', 0, 'tecnico');
  add('seguimiento', 'oferta', 'Revisar ventas y visitas en el dashboard a mitad de la oferta y reforzar si hace falta', 'apertura', 0, 'admin');
  add('ultimo-aviso', 'oferta', 'Último aviso: quedan pocas horas (email + WhatsApp)', 'cierre', 0, 'tecnico');
  // --- Cierre
  add('cierre', 'cierre', 'Cerrar: comprobar que la página manda a «oferta cerrada» y que el pago ya no está accesible', 'cierre', 0, 'admin');
  add('analisis', 'cierre', 'Analizar el meteórico: ventas, conversión de la página, facturación y aprendizajes', 'cierre', 1, 'admin');
  return T.map((t) => {
    const base = H[t.base] || (t.base === 'calentamiento' ? H.apertura : '') || '';
    let fecha = base ? addDays(base, t.dias) : '';
    // Acciones inmediatas: lo que ya debería estar hecho (antes de un hito que aún no ha llegado) es para hoy.
    if (hoy && fecha && fecha < hoy && base >= hoy) fecha = hoy;
    if (hoy && !fecha && t.fase === 'preparacion') fecha = hoy;
    return { clave: `meteo:${t.clave}`, fase: t.fase, titulo: t.titulo, notas: t.notas, fecha, rol: t.rol };
  });
}

// Pasos para dejarlo listo (checklist del meteórico).
export function pendientesMeteorico(m) {
  const out = [];
  if (!m.apertura || !m.cierre) out.push('Pon la apertura y el cierre de la oferta (día y hora).');
  else if (tiemposMeteorico(m).cierre <= tiemposMeteorico(m).apertura) out.push('El cierre es anterior a la apertura.');
  if (!m.calentamiento) out.push('Pon el día en que empieza el calentamiento.');
  if (!m.compraTag) out.push('Elige la etiqueta de compra (la pone el workflow del pago de esta oferta).');
  if (esSuscripcion(m)) out.push(...pendientesPago(m));
  else if (!m.precio) out.push('Pon el precio de la oferta (para la facturación y el ROAS).');
  if (!enlacePago(m, m.pagoUrl)) out.push('Pon el enlace de pago de la oferta.');
  if (!m.ofertaUrl) out.push('Pon la URL de la página de la oferta (y su código de la cuenta atrás).');
  if (m.compraTag && !m.compraDateField) out.push('Sin campo de fecha de compra: antes de abrir, haz la «foto» de quién ya tenía la etiqueta de compra.');
  return out;
}
export const DIA = DAY;
