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
  const pago = l.entradaPago === true;
  const c = code || 'a analizar';
  return [
    `Eres director de lanzamientos digitales, media buyer de Meta Ads y analista de marketing de respuesta directa. Vamos a analizar a fondo el lanzamiento ${code ? nombre(code, l) : 'más reciente que ya haya cerrado'} de ${cli.nombre || 'la marca'}${ctx.producto ? ` (programa «${ctx.producto}»)` : ''}${pago ? ', un LANZAMIENTO DE PAGO (la entrada al evento se paga)' : ''} para decidir qué cambiar en el siguiente${ctx.siguiente ? `, ${nombre(ctx.siguiente.code, ctx.siguiente)}` : ''}. Quiero tres cosas por encima de todo: 1) QUIÉN COMPRA (los perfiles del lead comprador), 2) QUÉ ANUNCIOS Y CONJUNTOS LOS TRAEN (para escalarlos) y 3) mejoras concretas y priorizadas, cada una con el dato que la justifica.`,
    '',
    'PASO 1 · RECOGE LOS DATOS con el conector «Dashboard Datos» (no inventes nada: si una herramienta falla o falta un dato, dilo y sigue):',
    `1. ver_embudos${cli.id ? ` (cliente: "${cli.id}")` : ''}: fechas, precios y estado de los lanzamientos.`,
    `2. metricas_embudo del lanzamiento ${c}${ant.length ? ` y de ${ant.map(([x, y]) => nombre(x, y)).join(' y ')} para comparar` : ' (y del anterior, si lo hay, para comparar)'}.`,
    `3. perfil_comprador (${c}): en qué se diferencia quien compró de quien no (qué hizo, qué respondió en la encuesta y por qué campaña, conjunto y anuncio llegó). ES LA BASE DE LOS PERFILES.`,
    `4. anuncios_que_venden (${c}): gasto y VENTAS REALES por campaña, conjunto y anuncio (ROAS real, coste por venta, ingresos directos e indirectos, ROAS de Meta para comparar). ES LA BASE DE QUÉ ESCALAR.`,
    `5. encuesta_para_copy (${c}): el lenguaje literal de las compradoras ([COMPRÓ]) frente al resto.`,
    `6. emails_lanzamiento (${c}): resultados de cada email y asuntos ganadores.`,
    `7. tareas_lanzamiento (${c}, incluir_hechas: true): qué se hizo tarde o quedó sin hacer.`,
    `8. marca_y_narrativa (${c}): la ficha del avatar y la narrativa, para juzgar el mensaje.`,
    'Si tienes el conector de Meta Ads, úsalo solo para completar (creatividades, textos y públicos de los anuncios ganadores); las ventas reales salen de AlquimIA, no del píxel.',
    code ? `\nFechas del lanzamiento analizado: ${fechas(l) || '(ver en ver_embudos)'}.${ant.length ? ` Anteriores: ${ant.map(([x, y]) => `${x} (${fechas(y) || 'sin fechas'})`).join('; ')}.` : ''}` : '',
    '',
    'PASO 2 · EL ANÁLISIS, en español de España, con estos apartados y títulos claros:',
    '1. RESUMEN EJECUTIVO (5 líneas): resultado frente a los objetivos y frente al lanzamiento anterior, quién compró en una frase, el anuncio o conjunto que más ventas trajo y tu veredicto.',
    `2. CUADRO DE MANDO: tabla con métrica · este lanzamiento · anterior · variación % · objetivo · valoración (✅/⚠️/❌). Como mínimo: registros, coste por registro (CPL), % que vio el directo o la grabación, % que estuvo el 75 % del directo, % que se quedó hasta la oferta, % VIP, ventas, conversión registro → venta, facturación, inversión, ROAS REAL (ventas reales ÷ gasto) frente al ROAS de Meta, y CAC.${pago ? ' Y, al ser de pago: entradas vendidas, coste por entrada, ROAS de las entradas (¿se pagaron solos los anuncios?), ticket medio de la entrada con bumps, % que añade cada bump de la entrada, participación y paso de la entrada al programa.' : ''}`,
    '3. LOS PERFILES DEL LEAD COMPRADOR (lo más importante junto con el punto 4). Con perfil_comprador y encuesta_para_copy, describe de 2 a 4 perfiles de compradora. Para cada uno:',
    '   - Nombre corto y descriptivo y qué % de las ventas representa (aproximado, di cómo lo estimas).',
    '   - Cómo es: situación, dolor principal, deseo, objeción y lo que la hizo decidirse, con frases literales de la encuesta.',
    '   - Qué hizo en el lanzamiento: clases, directo (entró, 75 %, hasta la oferta), VIP o bumps, página de pago, llamada o setter; y qué conductas multiplican la probabilidad de compra (lift).',
    '   - Por qué campañas, conjuntos y anuncios llegó y con qué conversión.',
    '   - Cómo reconocerla pronto (señales en los primeros días) y qué mensaje, anuncio y oferta le habla mejor.',
    '   Añade el anti-perfil: quién se registra mucho pero no compra, y cómo dejar de pagar por traerlo.',
    '4. ANUNCIOS Y CONJUNTOS QUE TRAEN COMPRADORAS (para escalar). Con anuncios_que_venden y el origen de perfil_comprador:',
    '   - Tabla de los conjuntos y anuncios ordenados por ingresos reales: gasto · ventas reales · coste por venta · ROAS real · ROAS de Meta · conversión de sus registros · perfil de compradora que trae · decisión (ESCALAR / MANTENER / REVISAR / APAGAR).',
    '   - ESCALAR: cuáles, cuánto subir el presupuesto y a qué ritmo (p. ej. +20-30 % cada 3-4 días mientras el ROAS real aguante), si duplicar el conjunto o abrir públicos parecidos.',
    '   - REPLICAR: qué tienen en común los ganadores (gancho, formato, ángulo, perfil al que hablan) y 3 anuncios nuevos inspirados en ellos, con su gancho.',
    '   - APAGAR o CAMBIAR: los que gastan sin traer compradoras, aunque Meta diga que van bien (ROAS de Meta alto con ROAS real bajo = registros baratos que no compran).',
    '   - PÚBLICOS: audiencias que crear (parecidas a compradoras, a «Clientes con su valor» de AlquimIA, a quien se quedó hasta la oferta) y a qué evento optimizar la captación (registro, LeadCualificado o compra).',
    '   - Avisa de las ventas sin origen y de las muestras pequeñas: con menos de 3 ventas, un anuncio no se juzga.',
    '5. EL EMBUDO PASO A PASO: el % que pasa de cada paso al siguiente, comparado con el anterior, y EL CUELLO DE BOTELLA (el paso que más ventas está costando), con una estimación de cuántas ventas más habría con una mejora realista de ese paso.',
    '6. QUÉ FUNCIONÓ (mantener) y QUÉ NO: cada punto con el dato. Separa lo que es DATO de lo que es HIPÓTESIS.',
    '7. EMAILS: los mejores y los peores (apertura y clics), qué patrón siguen los asuntos ganadores y qué cambiar.',
    '8. EJECUCIÓN DEL EQUIPO: tareas que se hicieron tarde o no se hicieron y cómo afectaron; qué preparar antes.',
    '9. MEJORAS PARA EL PRÓXIMO LANZAMIENTO: entre 8 y 12, ordenadas por prioridad. Para cada una:',
    '   - Qué cambiar exactamente (qué anuncio, qué texto, qué página, qué fecha, a qué perfil).',
    '   - Por qué: el dato que la justifica y tu razonamiento.',
    '   - Impacto esperado: qué métrica mueve y cuánto, aproximadamente.',
    '   - Esfuerzo (bajo / medio / alto), prioridad (ICE del 1 al 10) y cómo medir si funcionó.',
    `   Cubre, si los datos lo justifican: anuncios y públicos (punto 4), página de registro, preclase y clases, directo (retención hasta el 75 % y hasta la oferta), oferta, precio y bumps${pago ? ' (también los de la entrada)' : ''}, emails y WhatsApp, setter, carrito y seguimiento de ventas, y equipo.`,
    '10. OBJETIVOS PARA EL PRÓXIMO: registros, CPL, inversión, ventas, facturación y ROAS real, razonados con este y los anteriores (realistas, no optimistas), y cuánto de la inversión poner en los conjuntos ganadores.',
    '11. TRES EXPERIMENTOS A/B: hipótesis, qué se prueba, métrica de éxito y cuánto tráfico hace falta para fiarse del resultado.',
    '12. CHECKLIST DE PREPARACIÓN: 10 tareas concretas para el próximo lanzamiento, con quién (rol) y cuándo (días antes de la captación), listas para copiarlas en Plan → Tareas.',
    '',
    'Reglas: cada recomendación ligada a un dato (nada genérico); di de qué herramienta sale cada cifra; usa el ROAS REAL de AlquimIA para decidir, no el de Meta; avisa si una muestra es pequeña; no confundas correlación con causa; nada de datos personales; si algo no se puede saber con los datos, dilo y propón cómo medirlo la próxima vez.',
  ].filter((x) => x !== '').join('\n').replace(/\n{3,}/g, '\n\n');
}
