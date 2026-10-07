// Métricas de un lanzamiento a partir de sus leads ya enriquecidos. Lo usan el dashboard
// (pestaña Métricas y Comparar) y el resumen diario del servidor.
import {
  signalsFor, score, estadoFor, nextStepFor, waPhone, watched, ESTADOS, OUTCOMES, SNAPSHOT_TAGS,
} from './scoring.js';
import { tramoEdad, ORDEN_EDAD } from './encuesta.js';
import { videosDe, videoVenta, clasesDe, conVip } from './videos.js';

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
    clase3: c((l) => watched(l.s, 'clase3') >= 25),
    clases: clasesDe(launch), conVip: conVip(launch),
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
    ...(conVip(launch) ? [['Entradas VIP', m.vip, num(obj.vip)]] : []),
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

  // Lanzamientos de varios vídeos: cuánta gente ve cada vídeo (en directo o grabado) y cuántas compran.
  const vids = videosDe(launch);
  const vioVideo = (l, v) => l.s[`${v.directo}_asistio`] || watched(l.s, v.replay) >= 25;
  m.videos = vids.map((v) => ({
    k: v.k, nombre: v.nombre, venta: v.venta,
    asistio: c((l) => l.s[`${v.directo}_asistio`]),
    final: c((l) => l.s[`${v.directo}_final`]),
    grabacion: c((l) => watched(l.s, v.replay) >= 25),
    vieron: c((l) => vioVideo(l, v)),
    compraron: c((l) => l.s.compra && vioVideo(l, v)),
  }));
  const pruebasVideos = vids.length <= 1 ? [
    ['Pulsó el enlace del directo', (l) => l.s.directo_click || l.s.directo_asistio],
    ['Asistió al directo', (l) => l.s.directo_asistio],
    ['Más de 60 min en el directo', (l) => l.s.directo_60],
    ['Directo hasta el final', (l) => l.s.directo_final],
    ['Vio ≥50% de la grabación', (l) => watched(l.s, 'replay') >= 50],
  ] : vids.flatMap((v) => [
    [`Vio el ${v.nombre}`, (l) => vioVideo(l, v)],
    [`Vio ≥50% del ${v.nombre} (directo hasta el final o grabación)`, (l) => l.s[`${v.directo}_final`] || watched(l.s, v.replay) >= 50],
  ]);

  // Qué señales predicen la compra: conversión con la señal frente a sin ella.
  const SIGNAL_TESTS = [
    ...(m.encuestaActiva ? [['Rellenó la encuesta', (l) => l.s.encuesta]] : []),
    ...clasesDe(launch).map((cl, i) => [`Vio ≥50% de la clase ${i + 1}`, (l) => watched(l.s, cl) >= 50]),
    ...(conVip(launch) ? [['Compró la VIP', (l) => l.s.vip]] : []),
    ...pruebasVideos,
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
// de opción múltiple, la lead cuenta en cada opción que marcó. La edad se agrupa por tramos y las
// respuestas de texto libre se juntan sin distinguir mayúsculas (las 12 más repetidas + «Otras»).
export function porRespuesta(leads, pregunta) {
  const fieldId = typeof pregunta === 'string' ? pregunta : pregunta.id;
  const tipo = typeof pregunta === 'string' ? 'opciones' : pregunta.tipo;
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
    let vals = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean);
    if (tipo === 'edad') vals = vals.map(tramoEdad).filter(Boolean);
    if (tipo === 'texto') vals = vals.map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase().replace(/[.\s]+$/, ''));
    if (!vals.length) add('', l);
    else for (const x of new Set(vals)) add(x, l);
  }
  let rows = [...groups.values()];
  const sinRespuesta = rows.filter((r) => r.respuesta === '');
  rows = rows.filter((r) => r.respuesta !== '');
  if (tipo === 'edad') rows.sort((a, b) => ORDEN_EDAD.indexOf(a.respuesta) - ORDEN_EDAD.indexOf(b.respuesta));
  else rows.sort((a, b) => b.leads - a.leads);
  if (tipo === 'texto' && rows.length > 13) {
    const resto = rows.slice(12);
    const otras = { respuesta: `Otras respuestas (${resto.length} distintas)`, otras: true, leads: 0, vip: 0, compras: 0 };
    for (const r of resto) { otras.leads += r.leads; otras.vip += r.vip; otras.compras += r.compras; }
    rows = [...rows.slice(0, 12), otras];
  }
  return [...rows, ...sinRespuesta];
}

// Respuestas de una lead a una pregunta, ya normalizadas (como en porRespuesta).
function respuestasDe(l, p) {
  const v = l.cf?.[p.id];
  let vals = (Array.isArray(v) ? v : [v]).map((x) => String(x ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (p.tipo === 'edad') vals = vals.map(tramoEdad).filter(Boolean);
  if (p.tipo === 'texto') vals = vals.map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase().replace(/[.\s]+$/, ''));
  return [...new Set(vals)];
}

// Perfiles de compradoras a partir de la encuesta. `objetivo`: 'compra' (Raíces) o 'vip'.
// - Por pregunta: cada respuesta con su conversión, cuántas veces la media («índice») y su peso
//   entre las leads frente a entre las compradoras.
// - Avatares: las combinaciones de 2-3 respuestas que más compran (con un mínimo de leads y de
//   ventas para que no sea casualidad), elegidas para que no se repitan entre sí.
export function perfilesCompradoras(leads, preguntas, objetivo = 'compra') {
  const buys = (l) => (objetivo === 'vip' ? l.s.vip : l.s.compra);
  const answered = leads.filter((l) => preguntas.some((p) => respuestasDe(l, p).length));
  const N = answered.length;
  const K = answered.filter(buys).length;
  const base = N ? K / N : 0;
  const res = { objetivo, leads: N, compras: K, conv: base, preguntas: [], avatares: [], anti: null };
  if (!N) return res;
  const minN = Math.max(8, Math.ceil(N * 0.02));
  const minK = Math.max(3, Math.ceil(K * 0.05));

  const answersOf = new Map(answered.map((l) => [l, Object.fromEntries(preguntas.map((p) => [p.id, respuestasDe(l, p)]))]));
  for (const p of preguntas) {
    const g = new Map();
    for (const l of answered) {
      for (const r of answersOf.get(l)[p.id]) {
        const x = g.get(r) || { respuesta: r, leads: 0, compras: 0 };
        x.leads++;
        if (buys(l)) x.compras++;
        g.set(r, x);
      }
    }
    let rows = [...g.values()].map((x) => ({
      ...x, conv: x.compras / x.leads, indice: base ? x.compras / x.leads / base : null,
      pesoLeads: x.leads / N, pesoCompras: K ? x.compras / K : 0, pocos: x.leads < minN,
    }));
    if (p.tipo === 'edad') rows.sort((a, b) => ORDEN_EDAD.indexOf(a.respuesta) - ORDEN_EDAD.indexOf(b.respuesta));
    else rows.sort((a, b) => b.leads - a.leads);
    if (p.tipo === 'texto') rows = rows.slice(0, 8);
    res.preguntas.push({ p, rows });
  }

  // Combinaciones de 2 y 3 preguntas (y, si faltan avatares, de 1).
  const ids = preguntas.map((p) => p.id);
  const combos = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    combos.push([ids[i], ids[j]]);
    for (let k = j + 1; k < ids.length; k++) combos.push([ids[i], ids[j], ids[k]]);
  }
  const segs = new Map();
  const addSeg = (traits, l) => {
    const key = traits.map(([id, r]) => `${id}=${r}`).join('|');
    const x = segs.get(key) || { traits, leads: 0, compras: 0, vip: 0 };
    x.leads++;
    if (buys(l)) x.compras++;
    if (l.s.vip) x.vip++;
    segs.set(key, x);
  };
  for (const l of answered) {
    const a = answersOf.get(l);
    const expand = (combo) => combo.reduce((acc, id) => acc.flatMap((t) => a[id].map((r) => [...t, [id, r]])), [[]]).filter((t) => t.length === combo.length);
    for (const c of [...combos, ...ids.map((id) => [id])]) for (const t of expand(c)) addSeg(t, l);
  }
  const cands = [...segs.values()]
    .filter((x) => x.leads >= minN && x.compras >= minK)
    .map((x) => ({ ...x, conv: x.compras / x.leads, indice: base ? x.compras / x.leads / base : 0, pesoCompras: K ? x.compras / K : 0, pesoLeads: x.leads / N }));
  const score = (x) => x.compras * Math.log(Math.max(x.indice, 1e-6)) * (x.traits.length === 1 ? 0.6 : 1);
  const buenos = cands.filter((x) => x.indice >= 1.15).sort((a, b) => score(b) - score(a));
  const solapa = (a, b) => a.traits.filter(([id, r]) => b.traits.some(([id2, r2]) => id === id2 && r === r2)).length;
  // Primero perfiles sin ningún rasgo en común; si faltan, se permite compartir uno.
  for (const max of [0, 1]) {
    for (const c of buenos) {
      if (res.avatares.length >= 3) break;
      if (res.avatares.includes(c) || res.avatares.some((x) => solapa(x, c) > max || solapa(x, c) >= c.traits.length)) continue;
      res.avatares.push(c);
    }
  }
  res.avatares.sort((a, b) => score(b) - score(a));
  const malos = cands.filter((x) => x.leads >= minN * 2 && x.indice <= 0.7 && x.traits.length <= 2)
    .sort((a, b) => a.indice - b.indice || b.leads - a.leads);
  res.anti = malos[0] || null;
  res.minN = minN;
  res.minK = minK;
  return res;
}

// Primer avatar con el que encaja una lead (todas sus respuestas coinciden) o -1.
export function avatarDeLead(l, avatares, preguntas) {
  return avatares.findIndex((a) => a.traits.every(([id, r]) => {
    const p = preguntas.find((q) => q.id === id);
    return p && respuestasDe(l, p).includes(r);
  }));
}

// Frase que describe un avatar a partir de sus respuestas.
export function describirAvatar(traits, preguntas) {
  const parts = traits.map(([id, r]) => {
    const p = preguntas.find((q) => q.id === id);
    const v = r.charAt(0).toLowerCase() + r.slice(1);
    if (p?.tipo === 'edad') return `tiene ${v}`;
    if (/tiempo/i.test(p?.name || '')) return /todav/i.test(r) ? 'todavía no ha empezado a buscar' : `lleva ${v} buscando embarazo`;
    if (/bloque|retras|frena/i.test(p?.name || '')) return `cree que lo que la frena es «${v}»`;
    if (/probado/i.test(p?.name || '')) return `ha probado «${v}»`;
    return `${p?.name || id}: ${r}`;
  });
  const frase = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0];
  return frase.charAt(0).toUpperCase() + frase.slice(1) + '.';
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
  const start = (videoVenta(launch)?.fecha || '') || launch?.fechaDirecto; // el carrito empieza con el vídeo de venta
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
      const g = groups.get(key) || { key, label: src.source === 'formulario-meta' ? 'Formulario instantáneo (Meta)' : src.source || 'Sin canal (sin utm_source)', leads: 0, frio: 0, vip: 0, compras: 0 };
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

// Ranking de anuncios (o conjuntos / campañas) por ventas de Raíces que traen.
// level: 'ad' (utm_content) | 'adset' (utm_term) | 'campaign' (utm_campaign).
export function rankingGanadores(leads, launch, level = 'ad', names = {}, spendBy = {}) {
  const field = { ad: 'content', adset: 'term', campaign: 'campaign' }[level] || 'content';
  const groups = new Map();
  const moda = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  for (const l of leads) {
    const id = l.src?.[field];
    if (!id) continue;
    const g = groups.get(id) || { id, label: names[id] || id, leads: 0, vip: 0, compras: 0, ingresos: 0, camp: new Map(), set: new Map() };
    g.leads++;
    if (l.s.vip) { g.vip++; g.ingresos += num(launch?.precioVip); }
    if (l.s.compra) { g.compras++; g.ingresos += importeCompra(l, launch); }
    if (l.src.campaign) g.camp.set(l.src.campaign, (g.camp.get(l.src.campaign) || 0) + 1);
    if (l.src.term) g.set.set(l.src.term, (g.set.get(l.src.term) || 0) + 1);
    groups.set(id, g);
  }
  return [...groups.values()].map((g) => {
    const campaign = moda(g.camp);
    const adset = moda(g.set);
    const spend = num(spendBy[g.id]) || null;
    return {
      id: g.id, label: g.label, leads: g.leads, vip: g.vip, compras: g.compras, ingresos: g.ingresos,
      conversion: g.leads ? g.compras / g.leads : 0,
      campaign: level !== 'campaign' && campaign ? names[campaign] || campaign : '',
      adset: level === 'ad' && adset ? names[adset] || adset : '',
      spend, cac: spend && g.compras ? spend / g.compras : null, roas: spend ? g.ingresos / spend : null,
    };
  }).sort((a, b) => (b.compras - a.compras) || (b.ingresos - a.ingresos) || (b.conversion - a.conversion) || (b.leads - a.leads));
}

// Asistencia por tipo de tráfico: cada paso del embudo en global, frío (nuevo en GHL) y templado
// (ya estaba en GHL antes de la captación), con su % sobre los registros de ese grupo.
// → { grupos: [{ id, label, total }], pasos: [{ label, n: { global, frio, templado } }] }
export function asistenciaPorTrafico(leads, launch) {
  const grupos = [
    { id: 'global', label: 'Global', leads },
    { id: 'frio', label: 'Frío', leads: leads.filter((l) => l.s.trafico === 'frio') },
    { id: 'templado', label: 'Templado', leads: leads.filter((l) => l.s.trafico === 'templado') },
  ];
  const ms = Object.fromEntries(grupos.map((g) => [g.id, computeMetrics(g.leads, launch)]));
  const varios = videosDe(launch).length > 1;
  const def = [
    ...clasesDe(launch).map((c, i) => [`Clase ${i + 1} (≥25% vista)`, (m) => m[c]]),
    ...(conVip(launch) ? [['Entrada VIP', (m) => m.vip]] : []),
    ...(varios
      ? (ms.global.videos || []).flatMap((v, i) => [
        [`${v.nombre} en directo`, (m) => m.videos[i].asistio],
        [`${v.nombre} (directo o grabación)`, (m) => m.videos[i].vieron],
      ])
      : [
        ['Pulsaron el enlace del directo', (m) => m.click],
        ['Asistieron al directo', (m) => m.live],
        ['Directo hasta el final', (m) => m.liveFinal],
        ['Vieron la grabación (≥25%)', (m) => m.replay],
        ['Directo o grabación', (m) => m.live + m.soloReplay],
      ]),
    ['Compraron', (m) => m.compra],
  ];
  return {
    grupos: grupos.map(({ id, label }) => ({ id, label, total: ms[id].total })),
    pasos: def.map(([label, fn]) => ({ label, n: Object.fromEntries(grupos.map((g) => [g.id, fn(ms[g.id])])) })),
  };
}
