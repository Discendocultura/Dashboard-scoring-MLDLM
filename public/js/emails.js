// Emails de un embudo: tasa de apertura (open rate), CTR y clics sobre aperturas (CTOR), medias e
// indicadores de si cada email está por encima o por debajo del resto. Lo usan el navegador y el servidor.
//   · Apertura = aperturas / entregados → depende sobre todo del ASUNTO (y del remitente y la hora).
//   · CTR = clics / entregados → resultado global del email.
//   · CTOR = clics / aperturas → depende del CONTENIDO y la LLAMADA A LA ACCIÓN (de quien lo abrió, cuántos hacen clic).
// Nota: desde 2021 Apple Mail «abre» los emails solo (privacidad), así que la apertura sale algo inflada;
// sirve para comparar emails entre sí, que es lo que se hace aquí.

export const MIN_ENVIOS = 30; // con menos entregas el dato es poco fiable y no se le pone indicador
export const MARGEN = 0.15; // ±15 % sobre la media del resto = alto / bajo

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Filtros de nombre: «Octubre, [RAÍCES] Lanzamiento» → ['octubre', '[raíces] lanzamiento'].
export const filtrosEmail = (texto) => String(texto || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
export const coincideFiltro = (nombre, filtros) => !filtros.length || filtros.some((f) => String(nombre || '').toLowerCase().includes(f));

// Normaliza las estadísticas de GHL de un email.
export function tasas(stats = {}) {
  const enviados = n(stats.sent);
  const entregados = n(stats.delivered) || n(stats.accepted) || enviados;
  const aperturas = n(stats.opened);
  const clics = n(stats.clicked);
  return {
    enviados, entregados, aperturas, clics, bajas: n(stats.unsubscribed),
    apertura: entregados ? aperturas / entregados : null,
    ctr: entregados ? clics / entregados : null,
    ctor: aperturas ? clics / aperturas : null,
  };
}

// Medias ponderadas (por entregas) de un conjunto de emails.
export function resumenEmails(lista) {
  const t = lista.reduce((a, e) => ({ entregados: a.entregados + e.entregados, aperturas: a.aperturas + e.aperturas, clics: a.clics + e.clics, enviados: a.enviados + e.enviados, bajas: a.bajas + (e.bajas || 0) }), { entregados: 0, aperturas: 0, clics: 0, enviados: 0, bajas: 0 });
  return {
    n: lista.length, ...t,
    apertura: t.entregados ? t.aperturas / t.entregados : null,
    ctr: t.entregados ? t.clics / t.entregados : null,
    ctor: t.aperturas ? t.clics / t.aperturas : null,
  };
}

// alto | medio | bajo frente a la media del resto (relativo: ±MARGEN). '' si no hay con qué comparar.
export function nivel(valor, media, margen = MARGEN) {
  if (valor == null || media == null || !media) return '';
  if (valor >= media * (1 + margen)) return 'alto';
  if (valor <= media * (1 - margen)) return 'bajo';
  return 'medio';
}

// Añade a cada email su comparación con la media de LOS DEMÁS emails del embudo y qué mejorar.
export function conIndicadores(lista, { minEnvios = MIN_ENVIOS, margen = MARGEN } = {}) {
  const fiables = lista.filter((e) => e.entregados >= minEnvios);
  return lista.map((e) => {
    const otros = resumenEmails(fiables.filter((x) => x !== e));
    const fiable = e.entregados >= minEnvios && otros.n > 0;
    const niv = {
      apertura: fiable ? nivel(e.apertura, otros.apertura, margen) : '',
      ctr: fiable ? nivel(e.ctr, otros.ctr, margen) : '',
      ctor: fiable && e.aperturas >= 10 ? nivel(e.ctor, otros.ctor, margen) : '',
    };
    const vs = (v, m) => (v != null && m ? v / m - 1 : null);
    return {
      ...e, niveles: niv, fiable,
      difApertura: fiable ? vs(e.apertura, otros.apertura) : null,
      difCtr: fiable ? vs(e.ctr, otros.ctr) : null,
      consejo: consejoEmail(e, niv, fiable),
    };
  });
}

export function consejoEmail(e, niv, fiable) {
  if (!fiable) return e.entregados ? 'Pocos envíos para compararlo todavía.' : 'Aún no se ha enviado.';
  const out = [];
  if (niv.apertura === 'bajo') out.push('Apertura baja: prueba otro asunto (más concreto, con curiosidad o beneficio claro; evita asuntos genéricos como «Recordatorio»).');
  if (niv.ctor === 'bajo' || (niv.ctr === 'bajo' && niv.apertura !== 'bajo')) out.push('De quien lo abre, pocos hacen clic: revisa la llamada a la acción (un solo botón, visible arriba y con verbo claro).');
  if (!out.length && niv.apertura === 'alto' && (niv.ctr === 'alto' || niv.ctor === 'alto')) out.push('De los mejores: reutiliza su estilo de asunto y de llamada a la acción.');
  if (!out.length && niv.apertura === 'alto') out.push('Buen asunto: úsalo como referencia.');
  if (!out.length && (niv.ctr === 'alto' || niv.ctor === 'alto')) out.push('Buena llamada a la acción.');
  return out.join(' ') || 'En la media.';
}

// Ventana de fechas por defecto para buscar las campañas de un lanzamiento o un meteórico (si no hay filtro).
export function ventanaEmails(emb = {}, addDays) {
  const dia = (v) => String(v || '').slice(0, 10);
  if (emb.inicioCaptacion) return { desde: addDays(emb.inicioCaptacion, -14), hasta: addDays(dia(emb.cierreCarrito) || addDays(emb.fechaDirecto || emb.inicioCaptacion, 10), 3) };
  if (emb.calentamiento || emb.apertura) return { desde: addDays(emb.calentamiento || dia(emb.apertura), -2), hasta: addDays(dia(emb.cierre) || dia(emb.apertura), 2) };
  return null;
}
