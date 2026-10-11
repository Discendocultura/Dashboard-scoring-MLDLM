// Análisis del lanzamiento con Claude (Plan → Tareas → «🧠 Análisis del lanzamiento»): un prompt para pegar en Claude
// con el conector del dashboard activado. Claude saca él mismo los datos (métricas de este lanzamiento y de los
// anteriores, encuesta, emails, tareas, ficha y narrativa) y devuelve un análisis con mejoras accionables, cada una
// con su dato, su razonamiento, el impacto esperado y la prioridad, para preparar el siguiente.
// Es la tarea de preparación «Analizar con Claude el lanzamiento anterior» (ver PLANTILLA en tareas.js).

const dia = (s) => String(s || '').slice(0, 10);

// El lanzamiento a analizar y con cuáles compararlo.
//   lanzamientos: [[código, lanzamiento], …] del mismo embudo · actual: código del que está abierto · hoy: AAAA-MM-DD
// Si el abierto ya cerró el carrito, se analiza él; si no, el último que ya cerró antes (el que hay que estudiar
// al preparar el siguiente). → { objetivo: [código, l] | null, anteriores: [[código, l], …] (hasta 2), cerrado: bool }
export function lanzamientoAAnalizar(lanzamientos = [], actual = '', hoy = '') {
  const cierre = (l) => dia(l.cierreCarrito) || l.fechaDirecto || '';
  const orden = [...lanzamientos].sort((a, b) => String(cierre(b[1]) || b[1].inicioCaptacion || '').localeCompare(String(cierre(a[1]) || a[1].inicioCaptacion || '')));
  const cerrados = orden.filter(([, l]) => cierre(l) && cierre(l) < hoy);
  const act = orden.find(([c]) => c === actual);
  const objetivo = act && cerrados.includes(act) ? act : cerrados.find(([c]) => c !== actual) || null;
  if (!objetivo) return { objetivo: null, anteriores: [], cerrado: false };
  const i = cerrados.indexOf(objetivo);
  return { objetivo, anteriores: cerrados.slice(i + 1, i + 3), cerrado: objetivo[0] === actual };
}

// ctx: { cliente: { id, nombre }, producto, objetivo: [código, l], anteriores: [[código, l], …], siguiente: { code, name } | null }
export function promptAnalisis(ctx = {}) {
  const [code, l = {}] = ctx.objetivo || [];
  const cli = ctx.cliente || {};
  const nombre = (c, x) => `«${x?.name || c}» (código ${c})`;
  const fechas = (x) => [x.inicioCaptacion && `captación desde ${x.inicioCaptacion}`, x.fechaDirecto && `directo ${x.fechaDirecto}`, dia(x.cierreCarrito) && `cierre ${dia(x.cierreCarrito)}`].filter(Boolean).join(', ');
  const ant = ctx.anteriores || [];
  return [
    `Eres director de lanzamientos digitales y analista de marketing de respuesta directa. Vamos a analizar a fondo el lanzamiento ${code ? nombre(code, l) : 'más reciente que ya haya cerrado'} de ${cli.nombre || 'la marca'}${ctx.producto ? ` (programa «${ctx.producto}»)` : ''} para decidir qué cambiar en el siguiente${ctx.siguiente ? `, ${nombre(ctx.siguiente.code, ctx.siguiente)}` : ''}. Quiero mejoras concretas, accionables y priorizadas, cada una con el dato que la justifica y tu razonamiento.`,
    '',
    'PASO 1 · RECOGE LOS DATOS con el conector «Dashboard Estelabs» (no inventes nada: si una herramienta falla o falta un dato, dilo y sigue):',
    `1. ver_embudos${cli.id ? ` (cliente: "${cli.id}")` : ''}: fechas, precios y estado de los lanzamientos.`,
    `2. metricas_embudo del lanzamiento ${code || 'a analizar'}${ant.length ? ` y de ${ant.map(([c, x]) => nombre(c, x)).join(' y ')} para comparar` : ' (y del anterior, si lo hay, para comparar)'}.`,
    `3. encuesta_para_copy (${code || 'el mismo'}): qué dicen las registradas y en qué se diferencian las que compraron.`,
    `4. emails_lanzamiento (${code || 'el mismo'}): resultados de cada email y asuntos ganadores.`,
    `5. tareas_lanzamiento (${code || 'el mismo'}, incluir_hechas: true): qué se hizo tarde o quedó sin hacer.`,
    `6. marca_y_narrativa (${code || 'el mismo'}): la ficha del avatar y la narrativa, para juzgar el mensaje.`,
    'Si tienes otros conectores (Meta Ads, GHL), úsalos solo para completar: qué anuncios trajeron registros más baratos y qué creatividades funcionaron.',
    code ? `\nFechas del lanzamiento analizado: ${fechas(l) || '(ver en ver_embudos)'}.${ant.length ? ` Anteriores: ${ant.map(([c, x]) => `${c} (${fechas(x) || 'sin fechas'})`).join('; ')}.` : ''}` : '',
    '',
    'PASO 2 · EL ANÁLISIS, en español de España, con estos apartados y títulos claros:',
    '1. RESUMEN EJECUTIVO (5 líneas): resultado frente a los objetivos y frente al lanzamiento anterior, y tu veredicto en una frase.',
    '2. CUADRO DE MANDO: tabla con métrica · este lanzamiento · anterior · variación % · objetivo · valoración (✅/⚠️/❌). Como mínimo: registros, coste por registro (CPL), % que vio el directo o la grabación, % VIP, ventas, conversión registro → venta, facturación, inversión, ROAS y CAC.',
    '3. EL EMBUDO PASO A PASO: el % que pasa de cada paso al siguiente, comparado con el anterior, y EL CUELLO DE BOTELLA (el paso que más ventas está costando), con una estimación de cuántas ventas más habría con una mejora realista de ese paso.',
    '4. QUÉ FUNCIONÓ (mantener): cada punto con el dato que lo demuestra.',
    '5. QUÉ NO FUNCIONÓ: cada punto con el dato y su causa probable. Separa lo que es DATO de lo que es HIPÓTESIS.',
    '6. LO QUE DICE EL AVATAR (encuesta): 5 hallazgos y qué cambiarían en el mensaje, la oferta o las objeciones del carrito.',
    '7. EMAILS: los mejores y los peores (apertura y clics), qué patrón siguen los asuntos ganadores y qué cambiar.',
    '8. EJECUCIÓN DEL EQUIPO: tareas que se hicieron tarde o no se hicieron y cómo afectaron; qué preparar antes.',
    '9. MEJORAS PARA EL PRÓXIMO LANZAMIENTO (lo más importante): entre 8 y 12, ordenadas por prioridad. Para cada una:',
    '   - Qué cambiar exactamente (concreto: no «mejorar los anuncios», sino qué anuncio, qué texto, qué página, qué fecha).',
    '   - Por qué: el dato que la justifica y tu razonamiento.',
    '   - Impacto esperado: qué métrica mueve y cuánto, aproximadamente.',
    '   - Esfuerzo (bajo / medio / alto), prioridad (ICE: impacto × confianza × facilidad, del 1 al 10) y cómo medir si funcionó.',
    '   Cubre, si los datos lo justifican: captación y anuncios, página de registro, preclase y clases, directo, oferta y precio, bonus, emails y WhatsApp, carrito y seguimiento de ventas, y equipo.',
    '10. OBJETIVOS PARA EL PRÓXIMO: registros, CPL, inversión, ventas, facturación y ROAS, razonados con los datos de este y de los anteriores (realistas, no optimistas), y la inversión recomendada.',
    '11. TRES EXPERIMENTOS A/B: hipótesis, qué se prueba, métrica de éxito y cuánto tráfico hace falta para fiarse del resultado.',
    '12. CHECKLIST DE PREPARACIÓN: 10 tareas concretas para el próximo lanzamiento, con quién (rol) y cuándo (días antes de la captación), listas para copiarlas en Plan → Tareas.',
    '',
    'Reglas: cada recomendación ligada a un dato (nada genérico); di de qué herramienta sale cada cifra; avisa si una muestra es pequeña para sacar conclusiones; no confundas correlación con causa; nada de datos personales; si algo no se puede saber con los datos, dilo y propón cómo medirlo la próxima vez.',
  ].filter((x) => x !== '').join('\n').replace(/\n{3,}/g, '\n\n');
}
