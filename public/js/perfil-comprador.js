// Perfil del lead comprador de un lanzamiento (para el análisis con Claude y el conector): en qué se diferencia quien
// compró de quien no, con datos y sin nombres ni emails.
//   · comportamiento: % de compradoras y de no compradoras que hicieron cada cosa (clases, directo, 75 %, final, VIP,
//     página de pago, llamada…) y cuántas veces más probable es comprar si lo hizo («lift»)
//   · encuesta: las respuestas que más pesan entre las compradoras frente al total
//   · origen: campañas, conjuntos y anuncios (UTM del registro) con sus registros, compradoras, conversión y calidad
import { watched } from './scoring.js';
import { videosDe, clasesDe } from './videos.js';

const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Las conductas que se comparan (las que no aplican a este lanzamiento se quitan solas: nadie las tiene).
function conductas(launch) {
  const vs = videosDe(launch);
  const algun = (s, k) => vs.some((v) => s[`${v.directo}_${k}`]);
  return [
    ...clasesDe(launch).map((c, i) => [`Vio la clase ${i + 1} (50 % o más)`, (s) => watched(s, c) >= 50]),
    ['Entró al directo', (s) => algun(s, 'asistio')],
    ['Estuvo el 75 % del directo o más', (s) => algun(s, '75')],
    ['Se quedó hasta la oferta', (s) => algun(s, 'final')],
    ['Vio la grabación (50 % o más)', (s) => vs.some((v) => watched(s, v.replay) >= 50)],
    ['Compró la entrada VIP', (s) => Boolean(s.vip)],
    ['Añadió un bump offer', (s) => Boolean(s.bumps?.length)],
    ['Respondió la encuesta', (s) => Boolean(s.encuesta)],
    ['Visitó la página de venta', (s) => Boolean(s.venta_visita)],
    ['Llegó a la página de pago', (s) => Boolean(s.inicio_pago)],
    ['Tuvo llamada de venta', (s) => Boolean(s.llamada)],
    ['Agendó con el setter IA', (s) => Boolean(s.setter?.cita)],
    ['Ya estaba en tu base (tráfico templado)', (s) => s.trafico === 'templado'],
    ['Ya era clienta de antes', (s) => Boolean(s.clienta_anterior)],
  ];
}

// leads: los del lanzamiento, enriquecidos (s, score, src). preguntas: resumenEncuesta(leads, preguntas).preguntas
export function perfilComprador(leads = [], launch = {}, { encuesta = [], topOrigen = 12 } = {}) {
  const comp = leads.filter((l) => l.s?.compra);
  const resto = leads.filter((l) => !l.s?.compra);
  const pct = (lista, f) => (lista.length ? lista.filter((l) => f(l.s || {})).length / lista.length : null);
  const comportamiento = conductas(launch).map(([que, f]) => {
    const enComp = pct(comp, f);
    const enResto = pct(resto, f);
    const conElla = leads.filter((l) => f(l.s || {}));
    const conv = conElla.length ? conElla.filter((l) => l.s.compra).length / conElla.length : null;
    const sinElla = leads.length - conElla.length ? (comp.length - conElla.filter((l) => l.s.compra).length) / (leads.length - conElla.length) : null;
    return { que, compradoras: r1(enComp), noCompradoras: r1(enResto), conversionSiLoHizo: r1(conv), conversionSiNo: r1(sinElla), lift: conv != null && sinElla ? r1(conv / sinElla) : null, n: conElla.length };
  }).filter((x) => x.n > 0).sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));

  // Encuesta: respuestas sobrerrepresentadas entre las compradoras.
  const enc = encuesta.map((q) => {
    const totalComp = q.opciones.reduce((t, o) => t + (o.compras || 0), 0);
    const opciones = q.opciones.map((o) => {
      const pTodas = q.respondieron ? o.n / q.respondieron : 0;
      const pComp = totalComp ? (o.compras || 0) / totalComp : 0;
      return { respuesta: o.respuesta, todas: r1(pTodas), compradoras: r1(pComp), sobrerrepresentacion: pTodas ? r1(pComp / pTodas) : null, n: o.n, compras: o.compras || 0 };
    }).filter((o) => o.n >= 3).sort((a, b) => (b.sobrerrepresentacion ?? 0) - (a.sobrerrepresentacion ?? 0)).slice(0, 8);
    return { pregunta: q.p?.name || q.p?.id || '', respondieron: q.respondieron, opciones };
  }).filter((q) => q.opciones.length);

  // Origen del registro (UTM que guarda GHL): por campaña, conjunto y anuncio.
  const grupo = (clave) => {
    const g = new Map();
    for (const l of leads) {
      const k = String(l.src?.[clave] || '').trim();
      if (!k) continue;
      const x = g.get(k) || { nombre: k, registros: 0, compradoras: 0, puntos: [] };
      x.registros++; if (l.s?.compra) x.compradoras++; x.puntos.push(Number(l.score) || 0);
      g.set(k, x);
    }
    return [...g.values()].map((x) => ({ nombre: x.nombre, registros: x.registros, compradoras: x.compradoras, conversion: r1(x.compradoras / x.registros), puntuacionMedia: Math.round(media(x.puntos)) }))
      .sort((a, b) => b.compradoras - a.compradoras || b.conversion - a.conversion).slice(0, topOrigen);
  };
  const conUtm = leads.filter((l) => l.src?.campaign || l.src?.content || l.src?.term).length;
  return {
    registros: leads.length, compradoras: comp.length, conversion: leads.length ? r1(comp.length / leads.length) : null,
    puntuacionMediaCompradoras: Math.round(media(comp.map((l) => Number(l.score) || 0)) ?? 0), puntuacionMediaResto: Math.round(media(resto.map((l) => Number(l.score) || 0)) ?? 0),
    comportamiento, encuesta: enc,
    origen: { conUtm, campanas: grupo('campaign'), conjuntos: grupo('term'), anuncios: grupo('content') },
    nota: 'lift = conversión de quien lo hizo ÷ conversión de quien no. sobrerrepresentación = % entre compradoras ÷ % entre todas (más de 1 = es más típico de quien compra). Muestras de menos de 20 personas: orientativas.',
  };
}

// Anuncios y conjuntos con ventas reales (del árbol de Publicidad ya cruzado con ventasEnArbol): ranking para escalar.
//   decisión: 'escalar' (ROAS real ≥ 2 y 2+ ventas) · 'mantener' (≥ 1) · 'revisar' (con gasto y ROAS < 1) · 'sin datos'
export function rankingAnuncios(arbol, { minGasto = 30 } = {}) {
  const filas = [];
  for (const c of arbol?.campanas || []) {
    for (const s of c.hijos || []) {
      filas.push({ nivel: 'conjunto', campana: c.nombre, nombre: s.nombre, n: s });
      for (const a of s.hijos || []) filas.push({ nivel: 'anuncio', campana: c.nombre, conjunto: s.nombre, nombre: a.nombre, n: a });
    }
    filas.push({ nivel: 'campaña', nombre: c.nombre, n: c });
  }
  const dec = (r, g) => (!g || g < minGasto ? 'sin datos' : r.roas >= 2 && r.ventas >= 2 ? 'escalar' : r.roas >= 1 ? 'mantener' : 'revisar');
  return filas.map(({ n, ...x }) => {
    const r = n.real || {};
    const g = n.m?.gasto || 0;
    return { ...x, gasto: Math.round(g), ventasReales: r.ventas || 0, ingresosReales: Math.round(r.ingresos || 0), directos: Math.round(r.directos || 0), indirectos: Math.round(r.indirectos || 0), roasReal: r1(r.roas), costePorVenta: r.cpa ? Math.round(r.cpa) : null, roasMeta: r1(n.m?.roas), ctr: r1(n.m?.ctrEnlace), cpm: n.m?.cpm ? Math.round(n.m.cpm * 100) / 100 : null, frecuencia: r1(n.m?.frecuencia), decision: dec(r, g) };
  }).sort((a, b) => (b.ingresosReales - a.ingresosReales) || (b.gasto - a.gasto));
}
