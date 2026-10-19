// Análisis de la encuesta con IA (Leads → Encuesta → «🧠 Analizar con Claude»): un prompt con las respuestas de texto
// libre (anónimas, marcando las de quien compró), los % de las preguntas de opciones y la ficha del avatar, para que
// Claude saque patrones, el lenguaje literal del avatar y ganchos listos para anuncios, emails, WhatsApp y páginas.
// Es una tarea de la fase de cierre (ver PLANTILLA en tareas.js).

// Lo que no debe salir de la cuenta: emails y teléfonos que alguien escribió en una respuesta.
export const anonimizar = (t) => String(t || '')
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  .replace(/\+?\d(?:[\s.-]?\d){7,}/g, '[teléfono]')
  .replace(/\s+/g, ' ')
  .trim();

// Respuestas libres de una pregunta, sin repetidas exactas (con cuántas veces), las de compradoras primero.
export function libresAgrupadas(libres = []) {
  const m = new Map();
  for (const x of libres) {
    const t = anonimizar(x.texto);
    if (t.length < 2) continue;
    const k = t.toLowerCase().replace(/[\s.,;:!¡?¿…"'«»()]+/g, ' ').trim();
    const y = m.get(k) || { texto: t, n: 0, compras: 0 };
    y.n++;
    if (x.compra) y.compras++;
    m.set(k, y);
  }
  return [...m.values()].sort((a, b) => (b.compras > 0) - (a.compras > 0) || b.n - a.n);
}

// r: resumenEncuesta() · ctx: { marca, producto, lanzamiento, contexto (ficha), narrativa (bloque), max (caracteres) }
// → { prompt, incluidas, total }
export function promptEncuesta(r, ctx = {}) {
  const max = ctx.max || 30000; // las respuestas más repetidas y las de quien compró van primero: con 30.000 caracteres basta
  const lineas = [];
  let usados = 0;
  let incluidas = 0;
  let total = 0;
  const opciones = [];
  for (const q of r.preguntas || []) {
    const nombre = q.p?.name || q.p?.id || 'Pregunta';
    if (q.p?.tipo !== 'texto') {
      if (q.opciones?.length) opciones.push(`«${nombre}» (${q.respondieron} respuestas):\n${q.opciones.slice(0, 12).map((o) => `  - ${o.respuesta}: ${Math.round(o.pct * 100)} %${o.compras ? ` · ${o.compras} compraron` : ''}`).join('\n')}`);
      continue;
    }
    const g = libresAgrupadas(q.libres);
    total += g.length;
    if (!g.length) continue;
    const bloque = [];
    for (const x of g) {
      const l = `- ${x.compras ? '[COMPRÓ] ' : ''}${x.texto}${x.n > 1 ? ` (×${x.n})` : ''}`;
      if (usados + l.length > max) break;
      bloque.push(l);
      usados += l.length;
      incluidas++;
    }
    lineas.push(`<pregunta texto="${nombre.replace(/"/g, "'")}" respuestas="${q.libres.length}">\n${bloque.join('\n')}\n</pregunta>`);
  }
  const quien = [ctx.producto, ctx.marca].filter(Boolean).join(' · ');
  const prompt = [
    `Eres estratega de marketing de respuesta directa e investigador del cliente (voice of customer). Analiza las respuestas de la ENCUESTA de los registrados${ctx.lanzamiento ? ` del lanzamiento «${ctx.lanzamiento}»` : ''}${quien ? ` (${quien})` : ''} para sacar patrones, el lenguaje literal del avatar y ganchos de copy listos para usar.`,
    '',
    `DATOS: ${r.respondieron} de ${r.total} registrados respondieron. Las respuestas son anónimas; [COMPRÓ] marca a quien después compró el programa (dale más peso: es el avatar que convierte). (×N) = la misma respuesta repetida N veces.${incluidas < total ? ` Por espacio van ${incluidas} de ${total} respuestas distintas (primero las de compradoras y las más repetidas).` : ''}`,
    opciones.length ? `\nPREGUNTAS DE OPCIONES (para el contexto):\n${opciones.join('\n')}` : '',
    '\nRESPUESTAS DE TEXTO LIBRE:',
    lineas.join('\n\n') || '(no hay respuestas de texto libre)',
    ctx.contexto ? `\nFICHA ACTUAL DE MARCA Y AVATAR (compárala con lo que dicen: qué confirma, qué falta y qué es nuevo):\n<marca>\n${ctx.contexto}\n</marca>` : '',
    ctx.narrativa ? `\n${ctx.narrativa}` : '',
    '',
    'QUÉ QUIERO (en español de España, en este orden, con títulos claros):',
    '1. RESUMEN EN 5 LÍNEAS: lo más importante que hemos aprendido.',
    '2. LOS 8-10 PATRONES QUE MÁS SE REPITEN: para cada uno, qué es, cuántas respuestas aproximadamente (y %), si pesa más en las compradoras, y 2-3 citas LITERALES.',
    '3. COMPRADORAS FRENTE AL RESTO: qué dicen distinto quienes compraron (dolores, deseos, momento vital, palabras). Es la parte más valiosa.',
    '4. DOLORES, DESEOS, MIEDOS Y OBJECIONES: con sus frases literales.',
    '5. EL LENGUAJE DEL AVATAR: 25 expresiones literales que usan (tal cual, sin corregir), para usar en el copy.',
    '6. GANCHOS LISTOS PARA USAR, basados en lo anterior (y en la narrativa, si hay):',
    '   - 10 ganchos para anuncios (primeras líneas de vídeo o del texto) · 5 ángulos de anuncio distintos.',
    '   - 10 asuntos de email.',
    '   - 5 aperturas de mensaje para el grupo de WhatsApp.',
    '   - 5 titulares para la página de registro y 5 para la de venta.',
    '   - 5 objeciones con la mejor respuesta para el carrito y las FAQ.',
    '7. QUÉ CAMBIARÍA PARA EL PRÓXIMO LANZAMIENTO: mensaje, oferta, bonus, FAQ y públicos de anuncios.',
    '8. ACTUALIZACIÓN DE LA FICHA DEL AVATAR: un bloque listo para pegar en «Marca y avatar» con lo nuevo o lo que corrige.',
    '',
    'Reglas: no inventes datos ni citas (si algo es una intuición, dilo); las citas, literales; nada de datos personales.',
  ].filter((x) => x !== '').join('\n').replace(/\n{3,}/g, '\n\n');
  return { prompt, incluidas, total };
}
