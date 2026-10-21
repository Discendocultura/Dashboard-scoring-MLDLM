// Métricas publicitarias de Meta como en el Administrador de anuncios (Campaña → Conjunto de anuncios →
// Anuncio) y avisos de cuándo conviene ir preparando anuncios nuevos. Lo usan el servidor
// (/api/publicidad e Inicio) y la pestaña «Anuncios → Cómo van» de cada embudo.

// Acciones de Meta: el mismo evento llega repetido con varios nombres (omni_purchase, purchase,
// offsite_conversion.fb_pixel_purchase…), así que de cada grupo se coge el primero que haya, no la suma.
const GRUPOS = {
  visitas: [['omni_landing_page_view', 'landing_page_view']],
  // Registros: lead (formulario o píxel) o CompleteRegistration; el mayor de los dos (hay embudos que lanzan ambos).
  registros: [['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead_grouped'], ['omni_complete_registration', 'complete_registration', 'offsite_conversion.fb_pixel_complete_registration']],
  compras: [['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase']],
  pagos: [['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout']],
  repro3s: [['video_view']],
};
const num = (v) => Number(v) || 0;
function accion(lista, grupos) {
  const por = new Map((lista || []).map((x) => [x.action_type, num(x.value)]));
  return Math.max(0, ...grupos.map((tipos) => por.get(tipos.find((t) => por.has(t))) || 0));
}

// Fila de la API de insights de Meta → cifras base (sumables, salvo el alcance).
export function baseDe(row = {}) {
  return {
    gasto: num(row.spend),
    impresiones: num(row.impressions),
    alcance: num(row.reach),
    clics: num(row.clicks),
    clicsEnlace: num(row.inline_link_clicks),
    visitas: accion(row.actions, GRUPOS.visitas),
    registros: accion(row.actions, GRUPOS.registros),
    compras: accion(row.actions, GRUPOS.compras),
    pagos: accion(row.actions, GRUPOS.pagos),
    repro3s: accion(row.actions, GRUPOS.repro3s),
    valor: accion(row.action_values, GRUPOS.compras),
  };
}
const CLAVES = Object.keys(baseDe());
export function sumar(lista) {
  const t = Object.fromEntries(CLAVES.map((k) => [k, 0]));
  for (const b of lista) for (const k of CLAVES) t[k] += b[k] || 0;
  return t;
}

const div = (a, b) => (b ? a / b : null);
// Ratios como en Meta: CPM (coste por 1.000 impresiones), CTR, CPC del enlace, frecuencia…
export function derivadas(b) {
  return {
    ...b,
    frecuencia: div(b.impresiones, b.alcance),
    cpm: b.impresiones ? (b.gasto / b.impresiones) * 1000 : null,
    ctr: div(b.clics, b.impresiones),
    ctrEnlace: div(b.clicsEnlace, b.impresiones),
    cpcEnlace: div(b.gasto, b.clicsEnlace),
    carga: div(b.visitas, b.clicsEnlace),
    costeVisita: div(b.gasto, b.visitas),
    cpl: div(b.gasto, b.registros),
    costePago: div(b.gasto, b.pagos),
    costeCompra: div(b.gasto, b.compras),
    roas: div(b.valor, b.gasto),
    hook: div(b.repro3s, b.impresiones),
  };
}

// Qué cuenta como «resultado» de cada tipo de embudo.
export const resultadoDe = (tipo) => (tipo === 'directa' || tipo === 'meteorico' ? 'compras' : 'registros');

// Árbol Campaña → Conjunto → Anuncio. `filas`: { campaigns, adsets, ads } (filas de insights de cada nivel);
// `estados`: { id: { estado, creado } }. Cada nivel trae su propio alcance (no se puede sumar el de los hijos).
export function arbolPublicidad({ campaigns = [], adsets = [], ads = [] } = {}, estados = {}) {
  const nodo = (row, nivel, id, nombre) => ({ id, nivel, nombre, estado: estados[id]?.estado || '', creado: estados[id]?.creado || '', m: derivadas(baseDe(row)), hijos: [] });
  const porGasto = (a, b) => b.m.gasto - a.m.gasto || a.nombre.localeCompare(b.nombre);
  const cmp = new Map(campaigns.map((r) => [r.campaign_id, nodo(r, 'campaign', r.campaign_id, r.campaign_name || r.campaign_id)]));
  const conj = new Map();
  for (const r of adsets) {
    const n = nodo(r, 'adset', r.adset_id, r.adset_name || r.adset_id);
    conj.set(r.adset_id, n);
    cmp.get(r.campaign_id)?.hijos.push(n);
  }
  for (const r of ads) conj.get(r.adset_id)?.hijos.push(nodo(r, 'ad', r.ad_id, r.ad_name || r.ad_id));
  const lista = [...cmp.values()].sort(porGasto);
  for (const c of lista) { c.hijos.sort(porGasto); for (const s of c.hijos) s.hijos.sort(porGasto); }
  // Total: el alcance de varias campañas se suma (Meta no lo da sin solapes): es aproximado.
  const total = derivadas(sumar(lista.map((c) => c.m)));
  return { campanas: lista, total, alcanceAproximado: lista.length > 1 };
}

// Cuándo conviene preparar anuncios nuevos (fatiga creativa y del público). Se compara la última semana
// con la anterior, anuncio a anuncio. Valores pensados para tráfico frío en Meta con presupuestos pequeños
// y medianos; se ven en la pestaña («¿Cómo se calcula?»).
export const UMBRALES = {
  frecuenciaAviso: 2.2, // a partir de aquí, ir preparando el relevo
  frecuenciaAlta: 3, // el público ya lo ha visto 3 veces o más en 7 días
  caidaCtr: 0.25, // el CTR del enlace cae un 25 % o más frente a la semana anterior
  subidaCpm: 0.3, // el CPM sube un 30 % o más
  subidaCoste: 0.3, // el coste por resultado sube un 30 % o más
  diasActivo: 28, // un anuncio con 4 semanas o más: tener variaciones listas
  minGasto: 15, // por debajo de este gasto semanal (€) no se juzga un anuncio
  minImpresiones: 1000, // ni con menos impresiones
  minResultados: 3, // ni el coste por resultado con menos resultados
  minActivos: 3, // menos anuncios con gasto: poco margen para testear
  concentracion: 0.6, // un anuncio que se lleva el 60 % del gasto
};

const pct = (x) => `${Math.round(Math.abs(x) * 100)} %`;
const coma = (x, d = 1) => x.toFixed(d).replace('.', ',');
const eur = (x) => `${coma(x, x < 100 ? 2 : 0)} €`;

// `actual` / `anterior`: filas de insights por anuncio (última semana y la de antes).
// `estados`: { adId: { estado, creado } } · `objetivoCoste`: coste por resultado máximo del embudo (opcional).
// → { nivel: 'urgente' | 'pronto' | 'ok' | 'sindatos', titulo, avisos: [{ nivel: 'alta'|'media'|'info', id, nombre, texto }], activos }
export function avisosAnuncios({ actual = [], anterior = [], estados = {}, tipo = 'directa', objetivoCoste = 0, hoy = '', u = UMBRALES } = {}) {
  const res = resultadoDe(tipo);
  const nombreRes = res === 'compras' ? 'venta' : 'registro';
  const costeDe = (m) => (res === 'compras' ? m.costeCompra : m.cpl);
  const previas = new Map(anterior.map((r) => [r.ad_id, derivadas(baseDe(r))]));
  const vivos = actual.map((r) => ({ id: r.ad_id, nombre: r.ad_name || r.ad_id, m: derivadas(baseDe(r)), antes: previas.get(r.ad_id), estado: estados[r.ad_id]?.estado || '', creado: estados[r.ad_id]?.creado || '' }))
    .filter((a) => a.m.gasto > 0 && (!a.estado || a.estado === 'ACTIVE'));
  const gastoTotal = vivos.reduce((t, a) => t + a.m.gasto, 0);
  if (!vivos.length) return { nivel: 'sindatos', titulo: 'Sin anuncios con gasto en los últimos 7 días', avisos: [], activos: 0 };
  const avisos = [];
  const add = (nivel, a, texto) => avisos.push({ nivel, id: a?.id || '', nombre: a?.nombre || '', texto });
  for (const a of vivos) {
    if (a.m.gasto < u.minGasto && a.m.impresiones < u.minImpresiones) continue;
    const f = a.m.frecuencia;
    if (f != null && f >= u.frecuenciaAlta) add('alta', a, `Frecuencia ${coma(f)} en 7 días: el público ya lo ha visto 3 veces o más. Prepara su relevo ya.`);
    else if (f != null && f >= u.frecuenciaAviso) add('media', a, `Frecuencia ${coma(f)} en 7 días: ve preparando una variación (nuevo gancho o formato).`);
    const b = a.antes;
    if (b && b.impresiones >= u.minImpresiones && a.m.impresiones >= u.minImpresiones) {
      if (b.ctrEnlace && a.m.ctrEnlace != null && a.m.ctrEnlace <= b.ctrEnlace * (1 - u.caidaCtr)) {
        add(a.m.ctrEnlace <= b.ctrEnlace * 0.5 ? 'alta' : 'media', a, `El CTR del enlace ha caído un ${pct(a.m.ctrEnlace / b.ctrEnlace - 1)} (${coma(b.ctrEnlace * 100, 2)} % → ${coma(a.m.ctrEnlace * 100, 2)} %): el anuncio se está quemando.`);
      }
      if (b.cpm && a.m.cpm != null && a.m.cpm >= b.cpm * (1 + u.subidaCpm)) add('info', a, `El CPM ha subido un ${pct(a.m.cpm / b.cpm - 1)} (${eur(b.cpm)} → ${eur(a.m.cpm)}): sale más caro llegar al mismo público.`);
    }
    const cAhora = costeDe(a.m);
    const cAntes = b ? costeDe(b) : null;
    if (b && cAntes && cAhora && a.m[res] >= u.minResultados && b[res] >= u.minResultados && cAhora >= cAntes * (1 + u.subidaCoste)) {
      add('alta', a, `El coste por ${nombreRes} ha subido un ${pct(cAhora / cAntes - 1)} (${eur(cAntes)} → ${eur(cAhora)}).`);
    }
    if (objetivoCoste && cAhora && a.m[res] >= u.minResultados && cAhora > objetivoCoste * 1.2) add('media', a, `Coste por ${nombreRes} de ${eur(cAhora)}, por encima del objetivo (${eur(objetivoCoste)}).`);
    if (hoy && a.creado) {
      const dias = Math.floor((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(a.creado)) / 86_400_000);
      if (dias >= u.diasActivo) add('info', a, `Lleva ${dias} días publicado: ten variaciones listas antes de que se agote.`);
    }
  }
  // Del embudo entero: pocos anuncios con gasto o todo en uno que ya avisa.
  const conGasto = vivos.filter((a) => a.m.gasto >= u.minGasto);
  if (conGasto.length < u.minActivos) add('media', null, `Solo ${conGasto.length} anuncio${conGasto.length === 1 ? '' : 's'} con gasto esta semana: prepara 2 o 3 nuevos para tener con qué testear.`);
  const top = [...vivos].sort((x, y) => y.m.gasto - x.m.gasto)[0];
  if (gastoTotal && top.m.gasto / gastoTotal >= u.concentracion && avisos.some((x) => x.id === top.id && x.nivel !== 'info')) {
    add('alta', top, `Se lleva el ${pct(top.m.gasto / gastoTotal)} del gasto y ya da señales de cansancio: si cae, cae el embudo. Prepara su sustituto.`);
  }
  const orden = { alta: 0, media: 1, info: 2 };
  avisos.sort((x, y) => orden[x.nivel] - orden[y.nivel]);
  const nivel = avisos.some((x) => x.nivel === 'alta') ? 'urgente' : avisos.some((x) => x.nivel === 'media') ? 'pronto' : 'ok';
  const titulo = { urgente: 'Prepara anuncios nuevos ya', pronto: 'Ve preparando anuncios nuevos (1-2 semanas)', ok: 'Sin señales de cansancio: los anuncios aguantan' }[nivel];
  return { nivel, titulo, avisos, activos: vivos.length };
}

// Registros reales (los leads de GHL) del periodo y su CPL con el gasto de Meta. `dia(l)`: día de registro del lead.
// Con `todos` (todo el lanzamiento) cuentan todos los que tienen la etiqueta, también los que ya estaban en GHL.
// `inicio` (inicio de captación): quien ya estaba en GHL (o sin fecha) cuenta como registrado ese día, porque
// en este lanzamiento no pudo registrarse antes.
// `porUtm`: cuántos hay por campaña, conjunto y anuncio según sus UTM de Meta (utm_campaign, utm_term y
// utm_content, con el id o el nombre); se leen con `realesDeNodo`.
const CAMPO_UTM = { campaign: 'campaign', adset: 'term', ad: 'content' };
export function registrosReales(leads, rango, gasto, { dia = () => '', todos = false, inicio = '' } = {}) {
  if (!Array.isArray(leads)) return null;
  const diaDe = (l) => { const d = dia(l); return inicio && (!d || d < inicio) ? inicio : d; };
  const del = todos ? leads : leads.filter((l) => { const d = diaDe(l); return d && d >= rango.desde && d <= rango.hasta; });
  const porUtm = { campaign: new Map(), adset: new Map(), ad: new Map() };
  for (const l of del) {
    for (const [nivel, campo] of Object.entries(CAMPO_UTM)) {
      const v = norm(l.src?.[campo]).trim();
      if (v) porUtm[nivel].set(v, (porUtm[nivel].get(v) || 0) + 1);
    }
  }
  const n = del.length;
  return { registros: n, cpl: n && gasto ? gasto / n : null, porUtm };
}
// Registros reales de una campaña, conjunto o anuncio del árbol (por su id o, si la UTM lleva el nombre, por su nombre).
export function realesDeNodo(porUtm, n) {
  const m = porUtm?.[n.nivel];
  if (!m) return 0;
  const id = norm(n.id);
  const nombre = norm(n.nombre).trim();
  return (m.get(id) || 0) + (nombre && nombre !== id ? m.get(nombre) || 0 : 0);
}

// Filtro de campañas (texto en el nombre, sin mayúsculas ni tildes), igual que la inversión.
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const filtrarCampanas = (rows, filtro = '') => {
  const f = norm(String(filtro).trim());
  return f ? rows.filter((r) => norm(r.campaign_name).includes(f)) : rows;
};
