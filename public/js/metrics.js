// Métricas de un lanzamiento a partir de sus leads ya enriquecidos. Lo usan el dashboard
// (pestaña Métricas y Comparar) y el resumen diario del servidor.
import {
  signalsFor, score, estadoFor, nextStepFor, waPhone, watched, ESTADOS, OUTCOMES, SNAPSHOT_TAGS,
} from './scoring.js';

// Inicio de captación del lanzamiento siguiente: ahí terminan las ventas de este.
export function nextLaunchStart(config, code) {
  const start = config.launches[code]?.inicioCaptacion;
  if (!start) return '';
  return Object.values(config.launches).map((l) => l.inicioCaptacion).filter((d) => d && d > start).sort()[0] || '';
}

export function enrichLead(contact, code, config) {
  const launch = config.launches[code];
  const s = signalsFor(contact.tags, code, { ...launch, finVentas: nextLaunchStart(config, code) }, contact);
  const pts = score(s);
  return {
    ...contact,
    s,
    score: pts,
    estado: estadoFor(pts),
    step: nextStepFor(s),
    outcome: OUTCOMES.find((o) => s[`res_${o.id}`])?.id || '',
    phoneWa: waPhone(contact.phone, config.defaultCountryCode),
    search: `${contact.name} ${contact.email} ${contact.phone}`.toLowerCase(),
  };
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Importe de una compra de Raíces: precio fraccionado si pagó a plazos (y hay precio), si no el único.
export function importeCompra(l, launch) {
  return l.s.fraccionado && num(launch?.precioFraccionado) ? num(launch.precioFraccionado) : num(launch?.precioPrograma);
}

export function computeMetrics(leads, launch, { metaSpend = null } = {}) {
  const c = (fn) => leads.filter(fn).length;
  const viewedReplay = (l) => watched(l.s, 'replay') >= 25;
  const m = {
    total: leads.length,
    encuestaActiva: Boolean(launch?.encuestaTag),
    encuesta: c((l) => l.s.encuesta),
    compraEncuesta: c((l) => l.s.compra && l.s.encuesta),
    clase1: c((l) => watched(l.s, 'clase1') >= 25),
    clase2: c((l) => watched(l.s, 'clase2') >= 25),
    vip: c((l) => l.s.vip),
    click: c((l) => l.s.directo_click || l.s.directo_asistio),
    live: c((l) => l.s.directo_asistio),
    liveFinal: c((l) => l.s.directo_final),
    replay: c(viewedReplay),
    llamada: c((l) => l.s.llamada),
    compraLlamada: c((l) => l.s.compra && l.s.llamada),
    compra: c((l) => l.s.compra),
    compraFraccionado: c((l) => l.s.fraccionado),
    compraUnico: c((l) => l.s.unico),
    compraVip: c((l) => l.s.compra && l.s.vip),
    noVip: c((l) => !l.s.vip),
    compraNoVip: c((l) => l.s.compra && !l.s.vip),
    vipLive: c((l) => l.s.vip && l.s.directo_asistio),
    compraLive: c((l) => l.s.compra && l.s.directo_asistio),
    compraFinal: c((l) => l.s.compra && l.s.directo_final),
    soloReplay: c((l) => !l.s.directo_asistio && viewedReplay(l)),
    compraSoloReplay: c((l) => l.s.compra && !l.s.directo_asistio && viewedReplay(l)),
    nada: c((l) => !l.s.directo_asistio && !viewedReplay(l)),
    compraNada: c((l) => l.s.compra && !l.s.directo_asistio && !viewedReplay(l)),
    compraDirecto: c((l) => l.s.compra_directo),
    compraDirectoAsist: c((l) => l.s.compra_directo && l.s.directo_asistio),
    vipAnterior: c((l) => l.s.vip_anterior),
    clientaAnterior: c((l) => l.s.clienta_anterior),
    frio: c((l) => l.s.trafico === 'frio'),
    templado: c((l) => l.s.trafico === 'templado'),
    compraFrio: c((l) => l.s.compra && l.s.trafico === 'frio'),
    compraTemplado: c((l) => l.s.compra && l.s.trafico === 'templado'),
    estados: ESTADOS.map((e) => {
      const inE = leads.filter((l) => l.estado.id === e.id);
      return { ...e, leads: inE.length, compras: inE.filter((l) => l.s.compra).length };
    }),
  };

  // Setter: contactadas por WhatsApp y qué pasó.
  const contacted = leads.filter((l) => l.s.wa_enviado);
  m.setter = {
    contactadas: contacted.length,
    compraContactadas: contacted.filter((l) => l.s.compra).length,
    noContactadas: leads.length - contacted.length,
    compraNoContactadas: leads.filter((l) => !l.s.wa_enviado && l.s.compra).length,
    resultados: OUTCOMES.map((o) => {
      const inO = leads.filter((l) => l.outcome === o.id);
      return { ...o, leads: inO.length, compras: inO.filter((l) => l.s.compra).length };
    }),
  };

  // Economía del lanzamiento.
  const inversion = metaSpend != null ? metaSpend : num(launch.inversion);
  const facturacionPrograma = leads.filter((l) => l.s.compra).reduce((t, l) => t + importeCompra(l, launch), 0);
  const facturacion = m.vip * num(launch.precioVip) + facturacionPrograma;
  m.eco = {
    inversion,
    inversionFuente: metaSpend != null ? 'meta' : 'manual',
    facturacion,
    facturacionVip: m.vip * num(launch.precioVip),
    facturacionPrograma,
    beneficio: facturacion - inversion,
    roas: inversion ? facturacion / inversion : null,
    // CPL de pago: solo cuenta el tráfico frío (los templados ya estaban en tu base de datos).
    cpl: inversion && m.total ? inversion / m.total : null,
    cplFrio: inversion && m.frio ? inversion / m.frio : null,
    cpVip: inversion && m.vip ? inversion / m.vip : null,
    // CAC: lo que cuesta conseguir cada clienta nueva de Raíces en este lanzamiento.
    cac: inversion && m.compra ? inversion / m.compra : null,
  };

  // Origen de los leads (etiquetas de publicidad / orgánico): suma 100% con los que no llevan ninguna.
  const origenDe = (fn) => {
    const ls = leads.filter(fn);
    const buys = ls.filter((l) => l.s.compra);
    return {
      leads: ls.length, vip: ls.filter((l) => l.s.vip).length, compras: buys.length,
      importe: buys.reduce((t, l) => t + importeCompra(l, launch), 0),
    };
  };
  m.origen = {
    publi: origenDe((l) => l.s.origen === 'publi'),
    organico: origenDe((l) => l.s.origen === 'organico'),
    sinEtiqueta: origenDe((l) => !l.s.origen),
    total: origenDe(() => true),
  };

  // Rentabilidad solo de publicidad: la inversión en anuncios frente a lo que traen los leads de publicidad.
  if (launch?.publiTag) {
    const p = m.origen.publi;
    const facturacionPubli = p.vip * num(launch.precioVip) + p.importe;
    m.eco.publi = {
      leads: p.leads, vip: p.vip, compras: p.compras, facturacion: facturacionPubli,
      cpl: inversion && p.leads ? inversion / p.leads : null,
      cpVip: inversion && p.vip ? inversion / p.vip : null,
      cac: inversion && p.compras ? inversion / p.compras : null,
      roas: inversion ? facturacionPubli / inversion : null,
    };
  }

  // Objetivos del lanzamiento y cuánto se ha alcanzado.
  const obj = launch?.objetivos || {};
  m.objetivos = [
    ['Registros', m.total, num(obj.registros)],
    ['Entradas VIP', m.vip, num(obj.vip)],
    ['Ventas de Raíces', m.compra, num(obj.ventas)],
    ['Facturación', facturacion, num(obj.facturacion), 'eur'],
  ].filter(([, , meta]) => meta > 0).map(([label, actual, meta, unit]) => ({ label, actual, meta, unit, pct: actual / meta }));

  // Reparto de las ventas de Raíces por tipo de pago (suma 100% con las que no llevan ninguna etiqueta).
  const pagoDe = (fn) => {
    const ls = leads.filter((l) => l.s.compra && fn(l));
    return { n: ls.length, importe: ls.reduce((t, l) => t + importeCompra(l, launch), 0) };
  };
  m.pago = {
    unico: pagoDe((l) => l.s.unico),
    fraccionado: pagoDe((l) => l.s.fraccionado),
    sinEtiqueta: pagoDe((l) => !l.s.unico && !l.s.fraccionado),
    total: { n: m.compra, importe: facturacionPrograma },
  };

  // Qué señales predicen la compra: conversión con la señal frente a sin ella.
  const SIGNAL_TESTS = [
    ...(m.encuestaActiva ? [['Rellenó la encuesta', (l) => l.s.encuesta]] : []),
    ['Vio ≥50% de la clase 1', (l) => watched(l.s, 'clase1') >= 50],
    ['Vio ≥50% de la clase 2', (l) => watched(l.s, 'clase2') >= 50],
    ['Compró la VIP', (l) => l.s.vip],
    ['Pulsó el enlace del directo', (l) => l.s.directo_click || l.s.directo_asistio],
    ['Asistió al directo', (l) => l.s.directo_asistio],
    ['Más de 60 min en el directo', (l) => l.s.directo_60],
    ['Directo hasta el final', (l) => l.s.directo_final],
    ['Vio ≥50% de la grabación', (l) => watched(l.s, 'replay') >= 50],
    ['Tráfico templado', (l) => l.s.trafico === 'templado'],
    ['Contactada por WhatsApp', (l) => l.s.wa_enviado],
    ['Agendó llamada', (l) => l.s.llamada],
  ];
  m.lift = SIGNAL_TESTS.map(([label, fn]) => {
    const yes = leads.filter(fn);
    const no = leads.filter((l) => !fn(l));
    const cy = yes.length ? yes.filter((l) => l.s.compra).length / yes.length : 0;
    const cn = no.length ? no.filter((l) => l.s.compra).length / no.length : 0;
    return { label, con: yes.length, convCon: cy, sin: no.length, convSin: cn, veces: yes.length && cn ? cy / cn : null };
  });
  return m;
}

// Ventas según la respuesta a una pregunta de la encuesta (campo de GHL). Si la respuesta es
// de opción múltiple, la lead cuenta en cada opción que marcó.
export function porRespuesta(leads, fieldId) {
  const groups = new Map();
  const add = (key, l) => {
    const g = groups.get(key) || { respuesta: key, leads: 0, vip: 0, compras: 0 };
    g.leads++;
    if (l.s.vip) g.vip++;
    if (l.s.compra) g.compras++;
    groups.set(key, g);
  };
  for (const l of leads) {
    const v = l.cf?.[fieldId];
    const vals = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? '').trim()).filter(Boolean);
    if (!vals.length) add('', l);
    else for (const x of new Set(vals)) add(x, l);
  }
  return [...groups.values()].sort((a, b) => (a.respuesta === '') - (b.respuesta === '') || b.leads - a.leads);
}

// Avisos de configuración y de datos: cosas que hacen que las métricas salgan mal.
export function avisosLanzamiento(leads, launch, m) {
  const out = [];
  if (!launch) return out;
  const falta = [
    [launch.fechaDirecto, 'el día del directo'], [launch.horaDirecto, 'la hora del directo'],
    [launch.compraTag, 'la etiqueta de compra de Raíces'], [launch.compraDateField, 'el campo de fecha de compra'],
    [launch.precioPrograma, 'el precio de Raíces'], [launch.precioVip, 'el precio de la VIP'],
    [launch.whatsappUrl, 'el enlace del grupo de WhatsApp'], [launch.cierreCarrito, 'el cierre del carrito'],
  ].filter(([v]) => !v).map(([, t]) => t);
  if (falta.length) out.push(`Falta en Configuración: ${falta.join(', ')}.`);
  const sinFoto = SNAPSHOT_TAGS.filter((f) => launch[f.field] && launch.snapshot?.tags?.[f.field] !== launch[f.field]);
  if (sinFoto.length) out.push(`Falta la «foto» de ${sinFoto.map((f) => f.label).join(', ')}: quien ya la tenía de lanzamientos anteriores cuenta como de este.`);
  if ((launch.unicoTag || launch.fraccionadoTag) && m.pago.sinEtiqueta.n) out.push(`${m.pago.sinEtiqueta.n} ventas de Raíces sin etiqueta de pago único ni fraccionado: revisa los workflows de compra.`);
  if (!launch.unicoTag && !launch.fraccionadoTag && m.compra) out.push('Elige las etiquetas de pago único y fraccionado para separar las ventas y su facturación.');
  if ((launch.publiTag || launch.organicoTag) && m.origen.sinEtiqueta.leads) out.push(`${m.origen.sinEtiqueta.leads} leads sin etiqueta de publicidad ni orgánico: revisa los formularios de registro.`);
  if (launch.compraDateField) {
    const sinFecha = leads.filter((l) => l.s.compra && !l.s.fecha_compra).length;
    if (sinFecha) out.push(`${sinFecha} ventas de Raíces sin fecha de compra: no salen en las ventas por día ni en las del directo.`);
  }
  return out;
}

// Ventas de Raíces por día del carrito (del día del directo al cierre), según la fecha de compra.
// Las que caen antes, después o sin fecha van aparte para que el total cuadre.
const addDay = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export function ventasPorDia(leads, launch) {
  const start = launch?.fechaDirecto;
  if (!start || !launch.compraDateField) return null;
  const buys = leads.filter((l) => l.s.compra);
  const daysWithSales = buys.map((l) => l.s.fecha_compra).filter(Boolean).sort();
  const end = (launch.cierreCarrito || '').slice(0, 10) || [start, ...daysWithSales].sort().at(-1);
  const days = [];
  let importe = 0;
  for (let d = start, i = 0; d <= end && i < 60; d = addDay(d, 1), i++) days.push({ day: d, n: 0, unico: 0, fracc: 0, importe: 0 });
  let antes = 0; let despues = 0; let sinFecha = 0;
  for (const l of buys) {
    const d = l.s.fecha_compra;
    importe += importeCompra(l, launch);
    if (!d) sinFecha++;
    else if (d < start) antes++;
    else if (d > end) despues++;
    else {
      const x = days.find((y) => y.day === d);
      x.n++;
      if (l.s.fraccionado) x.fracc++;
      if (l.s.unico) x.unico++;
      x.importe += importeCompra(l, launch);
    }
  }
  return { days, antes, despues, sinFecha, total: buys.length, importe };
}

// Agrupa los leads por su origen (campaña o anuncio de Meta según las UTM de GHL).
export function bySource(leads, level = 'campaign', names = {}) {
  const groups = new Map();
  for (const l of leads) {
    const src = l.src || {};
    if (level === 'source') {
      const key = (src.source || '').toLowerCase() || '__sin';
      const g = groups.get(key) || { key, label: src.source || 'Sin canal (sin utm_source)', leads: 0, frio: 0, vip: 0, compras: 0 };
      g.leads++;
      if (l.s.trafico === 'frio') g.frio++;
      if (l.s.vip) g.vip++;
      if (l.s.compra) g.compras++;
      groups.set(key, g);
      continue;
    }
    const id = level === 'ad' ? src.content : level === 'adset' ? src.term : src.campaign;
    const key = id || (src.source ? `__${src.source}` : '__sin');
    const g = groups.get(key) || {
      key,
      label: id ? (names[id] || id) : src.source ? `Sin campaña (${src.source})` : 'Sin origen (orgánico / directo)',
      leads: 0, frio: 0, vip: 0, compras: 0,
    };
    g.leads++;
    if (l.s.trafico === 'frio') g.frio++;
    if (l.s.vip) g.vip++;
    if (l.s.compra) g.compras++;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.leads - a.leads);
}
