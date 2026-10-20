// Anuncios → UTMs: qué tipo de lead trae cada campaña, conjunto y anuncio (por sus UTM), paso a paso del embudo, para
// saber qué anuncios traen un avatar más cerca de la compra. Sin pantalla: la usan public/js/app.js y las pruebas.
//   · Lanzamientos: Leads → Encuesta → Clases → Entrada VIP → Directo → Compra del producto.
//   · VSL: Leads → Vio el vídeo → Vio el 75% → Llamada → Compra.
//   · Venta directa: Compras → Con extras (bump/upsell) → Producto principal.
import { watched } from './scoring.js';
import { videosDe, clasesDe, conVip } from './videos.js';
import { respuestasDe } from './metrics.js';

// ---------- Calidad del lead por su encuesta (semáforo) ----------
// Con los perfiles de compradoras (perfilesCompradoras: cada respuesta con su «índice» = cuántas veces más compra
// quien la da que la media), cada lead recibe la media de los índices de lo que ha respondido:
//   🟢 se parece a quien compra (≥ 1,25) · 🟡 en la media (0,8-1,25) · 🔴 se parece a quien no compra (< 0,8).
// Sin encuesta (o sin compras de las que aprender): sin color.
export const UMBRALES_SEMAFORO = { verde: 1.25, ambar: 0.8 };
export const colorSemaforo = (x) => (x == null ? null : x >= UMBRALES_SEMAFORO.verde ? 'verde' : x >= UMBRALES_SEMAFORO.ambar ? 'ambar' : 'rojo');
export function puntuadorEncuesta(perfiles) {
  if (!perfiles?.compras || !perfiles.preguntas?.length) return null;
  const indices = perfiles.preguntas.map(({ p, rows }) => ({ p, idx: new Map(rows.filter((r) => !r.pocos && r.indice != null).map((r) => [r.respuesta, r.indice])) }));
  return (lead) => {
    const vals = indices.flatMap(({ p, idx }) => respuestasDe(lead, p).filter((r) => idx.has(r)).map((r) => idx.get(r)));
    return vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : null;
  };
}

// Las UTM de cada lead: GHL las guarda como { campaign, term (conjunto), content (anuncio) }; la venta directa, como
// { campaign, adset, ad }.
export const utmDe = (x) => {
  const s = x?.src || {};
  return { campaign: String(s.campaign || ''), adset: String(s.adset ?? s.term ?? ''), ad: String(s.ad ?? s.content ?? '') };
};

// Los pasos del embudo, en orden (el último es la compra). fn(lead) → sí / no.
// preguntas: las de la encuesta (sin etiqueta de encuesta, cuenta quien ha respondido alguna).
export function pasosUtms(tipo, cfg = {}, { producto = 'el producto', preguntas = [] } = {}) {
  const respondio = (l) => Boolean(l.s?.encuesta || l.s?.encuesta_anterior) || preguntas.some((p) => respuestasDe(l, p).length > 0);
  if (tipo === 'vsl') {
    return [
      { id: 'leads', label: 'Leads', ico: '👥', fn: () => true },
      { id: 'vio', label: 'Vio el vídeo', ico: '▶️', fn: (l) => Boolean(l.s?.vio) },
      { id: 'vio75', label: 'Vio el 75%', ico: '🎬', fn: (l) => (l.s?.pct || 0) >= 75 },
      ...(cfg.llamadaTag || cfg.llamadaUrl ? [{ id: 'llamada', label: 'Agendó llamada', ico: '📞', fn: (l) => Boolean(l.s?.llamada) }] : []),
      { id: 'compra', label: `Compró ${producto}`, ico: '✅', fn: (l) => Boolean(l.s?.compra) },
    ];
  }
  if (tipo === 'directa') {
    return [
      { id: 'leads', label: 'Compras', ico: '🛒', fn: () => true },
      { id: 'extras', label: 'Con extras (bump / upsell)', ico: '➕', fn: (c) => (c.extras || []).length > 0 },
      ...(cfg.upsellPrincipal?.tags?.length ? [{ id: 'compra', label: `Compró ${producto}`, ico: '✅', fn: (c) => Boolean(c.principal) }] : []),
    ];
  }
  const clases = clasesDe(cfg);
  const videos = videosDe(cfg);
  return [
    { id: 'leads', label: 'Leads', ico: '👥', fn: () => true },
    { id: 'encuesta', label: 'Rellenó la encuesta', ico: '📋', fn: respondio },
    ...(clases.length ? [{ id: 'clases', label: clases.length > 1 ? 'Vio alguna clase' : 'Vio la clase', ico: '🎓', fn: (l) => clases.some((c) => watched(l.s || {}, c) >= 25) }] : []),
    ...(conVip(cfg) ? [{ id: 'vip', label: 'Entrada VIP', ico: '⭐', fn: (l) => Boolean(l.s?.vip) }] : []),
    { id: 'directo', label: videos.length > 1 ? 'Fue a algún directo' : 'Fue al directo', ico: '🔴', fn: (l) => videos.some((v) => l.s?.[`${v.directo}_asistio`]) },
    { id: 'compra', label: `Compró ${producto}`, ico: '✅', fn: (l) => Boolean(l.s?.compra) },
  ];
}

// Calidad (0-100): lo cerca de la compra que está lo que trae. Cada paso pesa más cuanto más cerca de la compra
// (1, 2, 3…), sobre el % de leads que lo hacen. Con menos de `minimo` leads, es orientativo (`pocos`).
export function calidad(fila, pasos) {
  const resto = pasos.slice(1);
  if (!fila.leads || !resto.length) return 0;
  let suma = 0;
  let pesos = 0;
  resto.forEach((p, i) => { suma += (i + 1) * (fila.n[p.id] / fila.leads); pesos += i + 1; });
  return Math.round((suma / pesos) * 100);
}

const nueva = (key, label, pasos) => ({ key, label, leads: 0, n: Object.fromEntries(pasos.map((p) => [p.id, 0])), sem: { verde: 0, ambar: 0, rojo: 0, suma: 0, n: 0 } });
let puntuar = null; // el de la encuesta, mientras se monta el árbol
const sumar = (g, x, pasos) => {
  g.leads++;
  for (const p of pasos) if (p.fn(x)) g.n[p.id]++;
  const v = puntuar ? puntuar(x) : null;
  if (v != null) { g.sem[colorSemaforo(v)]++; g.sem.suma += v; g.sem.n++; }
};

// Árbol campaña › conjunto › anuncio con el embudo de cada uno. names: id → nombre (Meta); spendBy: id → inversión.
// → { total, campanas: [{ key, label, leads, n, calidad, spend, cpl, coste: { pasoId → coste por cada uno }, hijos }], sinUtm }
// encuesta: puntuadorEncuesta(...) para el semáforo de calidad por la encuesta (o null).
export function arbolUtms(leads, pasos, { names = {}, spendBy = {}, minimo = 10, encuesta = null } = {}) {
  puntuar = encuesta;
  const total = nueva('total', 'Total', pasos);
  const sinUtm = nueva('__sin', 'Sin UTM (orgánico, directo o enlace sin parámetros)', pasos);
  const campanas = new Map();
  for (const x of leads || []) {
    sumar(total, x, pasos);
    const u = utmDe(x);
    if (!u.campaign && !u.adset && !u.ad) { sumar(sinUtm, x, pasos); continue; }
    const kc = u.campaign || '__sin-campana';
    const c = campanas.get(kc) || Object.assign(nueva(kc, u.campaign ? names[u.campaign] || u.campaign : 'Sin campaña', pasos), { hijos: new Map() });
    sumar(c, x, pasos);
    const ks = u.adset || '__sin-conjunto';
    const s = c.hijos.get(ks) || Object.assign(nueva(ks, u.adset ? names[u.adset] || u.adset : 'Sin conjunto', pasos), { hijos: new Map() });
    sumar(s, x, pasos);
    const ka = u.ad || '__sin-anuncio';
    const a = s.hijos.get(ka) || nueva(ka, u.ad ? names[u.ad] || u.ad : 'Sin anuncio', pasos);
    sumar(a, x, pasos);
    s.hijos.set(ka, a);
    c.hijos.set(ks, s);
    campanas.set(kc, c);
  }
  const cerrar = (g) => {
    const spend = g.key.startsWith('__') ? null : Number(spendBy[g.key]) || null;
    const coste = spend ? Object.fromEntries(pasos.map((p) => [p.id, g.n[p.id] ? spend / g.n[p.id] : null])) : {};
    // Semáforo de la fila: la media de sus leads con encuesta (con menos de 5 respuestas, orientativo).
    const media = g.sem.n ? g.sem.suma / g.sem.n : null;
    const semaforo = { ...g.sem, media, color: colorSemaforo(media), pocos: g.sem.n < 5 };
    const out = { ...g, calidad: calidad(g, pasos), pocos: g.leads < minimo, spend, coste, semaforo };
    if (g.hijos) out.hijos = [...g.hijos.values()].map(cerrar).sort((a, b) => b.leads - a.leads);
    return out;
  };
  puntuar = null;
  return { total: cerrar(total), campanas: [...campanas.values()].map(cerrar).sort((a, b) => b.leads - a.leads), sinUtm: sinUtm.leads ? cerrar(sinUtm) : null };
}

// Lista plana de un nivel (para «Solo conjuntos» / «Solo anuncios»), con la ruta de cada uno.
export function nivelUtms(arbol, nivel = 'ad') {
  const out = [];
  for (const c of arbol.campanas) {
    if (nivel === 'campaign') { out.push({ ...c, ruta: '' }); continue; }
    for (const s of c.hijos) {
      if (nivel === 'adset') { out.push({ ...s, ruta: c.label }); continue; }
      for (const a of s.hijos) out.push({ ...a, ruta: `${c.label} › ${s.label}` });
    }
  }
  return out;
}

// Orden: por leads, por compras (el último paso) o por calidad (con los de pocos datos al final).
export function ordenarUtms(filas, orden, pasos) {
  const ultimo = pasos.at(-1)?.id;
  const f = [...filas];
  if (orden === 'compras') return f.sort((a, b) => b.n[ultimo] - a.n[ultimo] || b.calidad - a.calidad || b.leads - a.leads);
  if (orden === 'calidad') return f.sort((a, b) => Number(a.pocos) - Number(b.pocos) || b.calidad - a.calidad || b.leads - a.leads);
  return f.sort((a, b) => b.leads - a.leads);
}
