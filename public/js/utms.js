// Anuncios → UTMs: qué tipo de lead trae cada campaña, conjunto y anuncio (por sus UTM), paso a paso del embudo, para
// saber qué anuncios traen un avatar más cerca de la compra. Sin pantalla: la usan public/js/app.js y las pruebas.
//   · Lanzamientos: Leads → Encuesta → Clases → Entrada VIP → Directo → Compra del producto.
//   · VSL: Leads → Vio el vídeo → Vio el 75% → Llamada → Compra.
//   · Venta directa: Compras → Con extras (bump/upsell) → Producto principal.
import { watched } from './scoring.js';
import { videosDe, clasesDe, conVip } from './videos.js';
import { respuestasDe } from './metrics.js';
import { ORDEN_EDAD } from './encuesta.js';

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

const nueva = (key, label, pasos) => ({ key, label, leads: 0, lista: [], n: Object.fromEntries(pasos.map((p) => [p.id, 0])), sem: { verde: 0, ambar: 0, rojo: 0, suma: 0, n: 0 } });
let puntuar = null; // el de la encuesta, mientras se monta el árbol
const sumar = (g, x, pasos) => {
  g.leads++;
  g.lista.push(x); // los leads de la fila (para ver sus respuestas a la encuesta)
  for (const p of pasos) if (p.fn(x)) g.n[p.id]++;
  const v = puntuar ? puntuar(x) : null;
  if (v != null) { g.sem[colorSemaforo(v)]++; g.sem.suma += v; g.sem.n++; }
};

// Árbol campaña › conjunto › anuncio con el embudo de cada uno. names: id → nombre (Meta); spendBy: id → inversión.
// → { total, campanas: [{ key, label, leads, n, calidad, spend, cpl, coste: { pasoId → coste por cada uno }, hijos }], sinUtm }
// encuesta: puntuadorEncuesta(...) para el semáforo de calidad por la encuesta (o null).
// filtro: lo que llevan en el nombre las campañas del embudo (p. ej. el código del lanzamiento). Las UTM de otras
// campañas (un lanzamiento anterior, otro embudo) no salen como fila: cuentan con «Sin UTM de este lanzamiento».
export function arbolUtms(leads, pasos, { names = {}, spendBy = {}, minimo = 10, encuesta = null, filtro = '' } = {}) {
  puntuar = encuesta;
  // Las UTM pueden llevar el id ({{ad.id}}) o el nombre ({{ad.name}}): el gasto de Meta va por id, así que también se
  // busca por nombre (sin mayúsculas ni espacios de más).
  const clave = (t) => String(t || '').trim().toLowerCase();
  const idDeNombre = new Map(Object.entries(names).map(([id, n]) => [clave(n), id]));
  const gastoDe = (k) => Number(spendBy[k]) || Number(spendBy[idDeNombre.get(clave(k))]) || null;
  const total = nueva('total', 'Total', pasos);
  const conocido = (k) => Boolean(k) && (Object.hasOwn(names, k) || idDeNombre.has(clave(k)));
  const delEmbudo = (u) => [u.campaign, u.adset, u.ad].some(conocido) || (Boolean(filtro) && [u.campaign, names[u.campaign]].some((t) => clave(t).includes(clave(filtro))));
  const sinUtm = nueva('__sin', filtro ? 'Sin UTM de este lanzamiento (orgánico, otras campañas o enlace sin parámetros)' : 'Sin UTM (orgánico, directo o enlace sin parámetros)', pasos);
  const campanas = new Map();
  // Con el id o con el nombre, la misma campaña (conjunto, anuncio) va en una sola fila: la del id de Meta.
  const idDe = (k) => (Object.hasOwn(names, k) ? k : idDeNombre.get(clave(k)) || k);
  for (const x of leads || []) {
    sumar(total, x, pasos);
    const u0 = utmDe(x);
    const u = { campaign: u0.campaign && idDe(u0.campaign), adset: u0.adset && idDe(u0.adset), ad: u0.ad && idDe(u0.ad) };
    if ((!u.campaign && !u.adset && !u.ad) || (filtro && !delEmbudo(u))) { sumar(sinUtm, x, pasos); continue; }
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
    const spend = g.key.startsWith('__') ? null : gastoDe(g.key);
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
    if (nivel === 'campaign') { out.push({ ...c, ruta: '', campana: c }); continue; }
    for (const s of c.hijos) {
      if (nivel === 'adset') { out.push({ ...s, ruta: c.label, campana: c }); continue; }
      for (const a of s.hijos) out.push({ ...a, ruta: `${c.label} › ${s.label}`, campana: c, conjunto: s });
    }
  }
  return out;
}

// Orden: menor CPL (sin inversión, al final), más cerca de la compra, más compras o avatar comprador (el semáforo de la
// encuesta: los que traen leads que más se parecen a quien compra). Lo de pocos datos, al final.
export function ordenarUtms(filas, orden, pasos) {
  const ultimo = pasos.at(-1)?.id;
  const f = [...filas];
  if (orden === 'compras') return f.sort((a, b) => b.n[ultimo] - a.n[ultimo] || b.calidad - a.calidad || b.leads - a.leads);
  if (orden === 'calidad') return f.sort((a, b) => Number(a.pocos) - Number(b.pocos) || b.calidad - a.calidad || b.leads - a.leads);
  if (orden === 'cpl') {
    const cpl = (x) => x.coste?.leads ?? Infinity;
    return f.sort((a, b) => cpl(a) - cpl(b) || b.leads - a.leads);
  }
  if (orden === 'avatar') {
    const m = (x) => (x.semaforo?.media == null ? -1 : x.semaforo.media);
    return f.sort((a, b) => Number(Boolean(a.semaforo?.pocos)) - Number(Boolean(b.semaforo?.pocos)) || m(b) - m(a) || b.leads - a.leads);
  }
  return f.sort((a, b) => b.leads - a.leads);
}

// Cruce entrada VIP → compra (y asistencia al directo → compra) con los leads: cuántos compran en cada grupo.
export function cruceVipCompra(leads = []) {
  const grupo = (fn) => {
    const g = leads.filter(fn);
    const c = g.filter((l) => l.s?.compra).length;
    return { n: g.length, compran: c, pct: g.length ? c / g.length : null };
  };
  return { vip: grupo((l) => l.s?.vip), noVip: grupo((l) => !l.s?.vip), todos: grupo(() => true) };
}

// Prompt para pegar en Claude con TODO lo de la tabla de UTMs: cada campaña, conjunto y anuncio con su inversión, leads,
// CPL, cada paso del embudo (nº, % y coste por cada uno), la calidad y el semáforo de la encuesta; el cruce VIP → compra y
// lo que se le pide analizar. ctx: { negocio, embudo, tipo, producto, precioVip, precioPrograma, inversion, fechas, cruce }.
export function promptUtms(arbol, pasos, ctx = {}) {
  const eur = (n) => (n == null || !Number.isFinite(n) ? '–' : `${(Math.round(n * 100) / 100).toLocaleString('es-ES')} €`);
  const pc = (n, t) => (t ? `${(Math.round((n / t) * 1000) / 10).toLocaleString('es-ES')} %` : '–');
  const resto = pasos.slice(1);
  const fila = (nivel, g, dentro = '') => {
    const cpl = g.spend && g.leads ? g.spend / g.leads : null;
    const celdas = resto.map((p) => `${g.n[p.id]} (${pc(g.n[p.id], g.leads)}${g.coste?.[p.id] ? `, ${eur(g.coste[p.id])}/u` : ''})`);
    const sem = g.semaforo?.n ? `${Math.round((g.semaforo.verde / g.semaforo.n) * 100)} % de ${g.semaforo.n}` : '–';
    return `| ${nivel} | ${String(g.label).replace(/\|/g, '/')} | ${dentro.replace(/\|/g, '/')} | ${eur(g.spend)} | ${g.leads} | ${eur(cpl)} | ${celdas.join(' | ')} | ${g.calidad}${g.pocos ? ' (pocos datos)' : ''} | ${sem} |`;
  };
  const cab = `| Nivel | Nombre | Dentro de | Inversión | Leads | CPL | ${resto.map((p) => p.label).join(' | ')} | Calidad (0-100) | Encuesta: % parecido a quien compra |\n|${' --- |'.repeat(8 + resto.length)}`;
  const filas = [];
  for (const c of arbol.campanas) filas.push(fila('Campaña', c));
  for (const c of arbol.campanas) for (const s of c.hijos) filas.push(fila('Conjunto', s, c.label));
  const anuncios = [];
  for (const c of arbol.campanas) for (const s of c.hijos) for (const a of s.hijos) anuncios.push([a, `${c.label} › ${s.label}`]);
  anuncios.sort((x, y) => y[0].leads - x[0].leads);
  for (const [a, ruta] of anuncios.slice(0, 150)) filas.push(fila('Anuncio', a, ruta));
  if (arbol.sinUtm) filas.push(fila('Sin UTM', arbol.sinUtm));
  filas.push(fila('TOTAL', arbol.total));
  const cr = ctx.cruce;
  const pcx = (x) => (x == null ? '–' : `${(Math.round(x * 1000) / 10).toLocaleString('es-ES')} %`);
  const cruce = cr && cr.vip.n ? `## Entrada VIP → compra de ${ctx.producto}
- Con entrada VIP: ${cr.vip.n} leads, compran ${cr.vip.compran} (${pcx(cr.vip.pct)}).
- Sin entrada VIP: ${cr.noVip.n} leads, compran ${cr.noVip.compran} (${pcx(cr.noVip.pct)}).
- Todos: ${cr.todos.n} leads, compran ${cr.todos.compran} (${pcx(cr.todos.pct)}).
` : '';
  return `Eres analista de tráfico de pago (Meta Ads) para lanzamientos de infoproductos. Analiza estos datos reales de ${ctx.negocio || 'mi negocio'} y dime qué funciona, qué no y qué hago en el siguiente lanzamiento. Responde en español de España, claro y directo, sin tecnicismos innecesarios.

## Contexto
- Embudo: ${ctx.embudo || '–'} (${ctx.tipo === 'vsl' ? 'VSL evergreen' : ctx.tipo === 'directa' ? 'venta directa' : 'lanzamiento'})${ctx.fechas ? ` · ${ctx.fechas}` : ''}
- Producto principal: ${ctx.producto}${ctx.precioPrograma ? ` · precio ${eur(Number(ctx.precioPrograma))}` : ''}${ctx.precioVip ? ` · entrada VIP ${eur(Number(ctx.precioVip))}` : ''}
- Inversión total en Meta: ${eur(ctx.inversion)}
- Atribución: por las UTM del registro (el último anuncio por el que llegó cada lead). «Sin UTM» = orgánico o enlaces sin parámetros.
- «Calidad» (0-100) = lo cerca de la compra que llegan los leads de esa fila (pondera cada paso del embudo). «Encuesta» = % de sus leads cuyas respuestas se parecen a las de quien compra.
- En cada paso: nº de leads (% sobre los leads de esa fila, € que cuesta cada uno con la inversión de esa fila).

${cruce}## Datos por campaña, conjunto y anuncio
${cab}
${filas.join('\n')}

## Qué necesito
1. **Lo que trae compradores:** las campañas, conjuntos y anuncios con más compras y menor coste por compra, con la facturación estimada (compras × precio) y el ROAS de cada uno.
2. **Leads más baratos:** los de menor CPL, y si esos leads baratos convierten (VIP, directo, compra) o son baratos pero malos.
3. **Entrada VIP:** qué anuncios y conjuntos traen más compradoras de VIP y a qué coste por VIP.
4. **Correlación VIP → compra:** con los datos de arriba, ¿quien compra la VIP compra más ${ctx.producto}? Cuantifícalo (cuántas veces más) y dime qué implica: ¿merece la pena empujar la VIP o subir su precio?, ¿qué anuncios traen VIP que luego compran?
5. **Encuesta y calidad:** qué anuncios traen leads parecidos a quien compra aunque aún no hayan comprado (potencial para retargeting o seguimiento).
6. **Escalar, mantener o pausar:** una lista concreta por campaña / conjunto / anuncio, con el presupuesto que moverías y por qué.
7. **Siguiente lanzamiento:** estructura de campañas recomendada, qué ángulos o creatividades repetir y cuáles cambiar, a qué públicos ir y qué probar (tests A/B concretos).
8. **Cualquier otra cosa** que veas en los datos que me ayude a vender más o a gastar menos.

## Reglas
- Con pocos datos (menos de 10 leads o menos de 3 compras en una fila) dilo y no saques conclusiones fuertes.
- Si algo no se puede saber con estos datos, dilo y propón cómo medirlo.
- Empieza con un resumen de 5 puntos; luego tablas cortas (ganadores, perdedores) y termina con un plan de acción priorizado (qué hago mañana, esta semana y en el próximo lanzamiento).`;
}

// Respuestas a la encuesta de los leads de una fila (campaña, conjunto o anuncio), pregunta a pregunta, frente a las de
// todos los leads: { respondieron, total, preguntas: [{ id, name, respondieron, opciones: [{ respuesta, n, pct, pctTodos,
// diferencia (puntos) }], otras }] }. Por pregunta, las `max` respuestas más repetidas (la edad, por tramos y en orden).
export function encuestaUtm(lista = [], preguntas = [], todos = [], { max = 8 } = {}) {
  const reparto = (leads, p) => {
    const con = leads.filter((l) => respuestasDe(l, p).length);
    const g = new Map();
    for (const l of con) for (const r of respuestasDe(l, p)) g.set(r, (g.get(r) || 0) + 1);
    return { con: con.length, g };
  };
  const preguntasOut = preguntas.map((p) => {
    const fila = reparto(lista, p);
    const base = reparto(todos, p);
    let opciones = [...fila.g].map(([respuesta, n]) => {
      const pct = fila.con ? n / fila.con : 0;
      const pctTodos = base.con ? (base.g.get(respuesta) || 0) / base.con : 0;
      return { respuesta, n, pct, pctTodos, diferencia: Math.round((pct - pctTodos) * 1000) / 10 };
    });
    if (p.tipo === 'edad') opciones.sort((a, b) => ORDEN_EDAD.indexOf(a.respuesta) - ORDEN_EDAD.indexOf(b.respuesta));
    else opciones.sort((a, b) => b.n - a.n || a.respuesta.localeCompare(b.respuesta, 'es'));
    const otras = Math.max(0, opciones.length - max);
    if (p.tipo !== 'edad') opciones = opciones.slice(0, max);
    return { id: p.id, name: p.name, tipo: p.tipo, respondieron: fila.con, opciones, otras };
  }).filter((q) => q.respondieron);
  const respondieron = lista.filter((l) => preguntas.some((p) => respuestasDe(l, p).length)).length;
  return { respondieron, total: lista.length, preguntas: preguntasOut };
}
