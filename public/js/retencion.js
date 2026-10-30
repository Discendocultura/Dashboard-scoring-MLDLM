// Retención de vídeos (Métricas → Consumo de vídeos): la curva de cada directo (de Zoom: cuántas personas había
// conectadas cada minuto) y de cada grabación (del tracker: cuántas personas vieron cada tramo y cuántas veces),
// con los puntos de fuga, los tramos que se saltan, los picos de interés y qué hacer con cada cosa.
// Sin pantalla: app.js, el servidor y las pruebas.

// Las grabaciones se miden en TRAMOS tramos iguales (0,5 % del vídeo cada uno).
export const TRAMOS = 200;

// Pocos datos = conclusiones de ruido: por debajo de esto solo se enseña la curva.
export const MIN_PERSONAS_REPLAY = 20;
export const MIN_PERSONAS_DIRECTO = 10;

const r1 = (n) => Math.round(n * 10) / 10;
const media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
// Media móvil centrada (suaviza el ruido de pocas personas).
export function suavizar(ys, w = 2) {
  return ys.map((_, i) => media(ys.slice(Math.max(0, i - w), i + w + 1)));
}

// Segundos → «m:ss» o «h:mm:ss».
export function mmss(seg) {
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Los mayores bajones de una curva (en % de la base): tramos de `ventana` puntos donde se cae mucho más que la
// media. → [{ desde, hasta, caida (puntos de %), antes, despues }] (como mucho `max`, sin solaparse).
export function fugas(ys, { ventana, desde = 0, hasta = ys.length - 1, minCaida = 4, max = 3 } = {}) {
  const n = hasta - desde;
  if (n <= ventana * 2) return [];
  const ritmo = Math.max(0, (ys[desde] - ys[hasta]) / n) * ventana; // lo que se pierde de media en una ventana
  const cands = [];
  for (let i = desde; i + ventana <= hasta; i++) {
    const caida = ys[i] - ys[i + ventana];
    if (caida >= Math.max(minCaida, ritmo * 2)) cands.push({ desde: i, hasta: i + ventana, caida, antes: ys[i], despues: ys[i + ventana] });
  }
  const out = [];
  for (const c of cands.sort((a, b) => b.caida - a.caida)) {
    if (out.length >= max) break;
    if (out.some((o) => c.desde < o.hasta + ventana && c.hasta > o.desde - ventana)) continue;
    out.push({ ...c, caida: r1(c.caida), antes: r1(c.antes), despues: r1(c.despues) });
  }
  return out.sort((a, b) => a.desde - b.desde);
}

// ---------- Grabación ----------
// datos: { dur (s), tramos: [[personas, vistas], …] } (TRAMOS elementos).
// → { serie: [{ i, t (s), ret (% de quien empezó), personas, vistas, interes }], base, fugas, saltos, picos,
//     final, suficiente, sugerencias: [{ tipo, t, texto, accion }] }
export function analizarReplay(datos, { nombre = 'la grabación' } = {}) {
  const dur = Number(datos?.dur) || 0;
  const tr = Array.from({ length: TRAMOS }, (_, i) => datos?.tramos?.[i] || [0, 0]);
  const personas = tr.map((x) => Number(x[0]) || 0);
  const vistas = tr.map((x) => Math.max(Number(x[1]) || 0, Number(x[0]) || 0));
  // La base: quien la empezó (lo más alto del primer 2 %: el primer tramo a veces se lo saltan al dar al play tarde).
  const base = Math.max(...personas.slice(0, 4), 0);
  const t = (i) => (dur * i) / TRAMOS;
  const ret = suavizar(personas.map((p) => (base ? (p / base) * 100 : 0)), 2);
  // Interés: veces que se ve cada tramo por persona (1 = una vez cada una). Los picos son los que se repiten.
  const ratio = personas.map((p, i) => (p ? vistas[i] / p : 0));
  const serie = ret.map((r, i) => ({ i, t: t(i), ret: r1(r), personas: personas[i], vistas: vistas[i], interes: r1(ratio[i]) }));
  const suficiente = base >= MIN_PERSONAS_REPLAY && dur > 0;
  const out = { serie, base, dur, suficiente, fugas: [], saltos: [], picos: [], final: r1(ret[TRAMOS - 6] ?? 0), sugerencias: [] };
  if (!suficiente) return out;

  // Puntos de fuga (fuera del 5 % final: los créditos y la despedida siempre caen).
  const ventana = 6; // 3 % del vídeo
  // Si la curva se recupera justo después no es que se vayan: se lo saltan (eso va en «saltos»).
  const serecupera = (f) => Math.max(...ret.slice(f.hasta, f.hasta + 12)) >= f.antes - f.caida * 0.4;
  out.fugas = fugas(ret, { ventana, desde: 2, hasta: TRAMOS - 10, minCaida: 4, max: 6 }).filter((f) => !serecupera(f)).slice(0, 3)
    .map((f) => ({ ...f, t0: t(f.desde), t1: t(f.hasta) }));
  // Tramos que se saltan: la curva se hunde y luego se recupera (avanzan la barra y vuelven a ver más adelante).
  const W = 8;
  const hundido = ret.map((r, i) => {
    if (i < 4 || i > TRAMOS - 6) return 0;
    const antes = Math.max(...ret.slice(Math.max(0, i - W), i));
    const despues = Math.max(...ret.slice(i + 1, i + W + 1));
    return Math.min(antes, despues) - r;
  });
  for (let i = 0; i < TRAMOS; i++) {
    if (hundido[i] < 6) continue;
    let j = i;
    while (j + 1 < TRAMOS && hundido[j + 1] >= 3) j++;
    const hueco = r1(Math.max(...hundido.slice(i, j + 1)));
    out.saltos.push({ desde: i, hasta: j + 1, t0: t(i), t1: t(j + 1), hueco });
    i = j + 1;
  }
  out.saltos = out.saltos.sort((a, b) => b.hueco - a.hueco).slice(0, 3).sort((a, b) => a.desde - b.desde);
  // Picos de interés: tramos que se ven bastantes más veces por persona que lo normal (vuelven atrás para verlos).
  const normal = mediana(ratio.filter((x) => x > 0)) || 1;
  const inter = suavizar(ratio, 1);
  const cands = inter.map((x, i) => ({ i, x })).filter(({ i, x }) => personas[i] >= 5 && x >= normal * 1.25 && x - normal >= 0.15
    && x >= (inter[i - 1] ?? 0) && x >= (inter[i + 1] ?? 0));
  for (const c of cands.sort((a, b) => b.x - a.x)) {
    if (out.picos.length >= 3) break;
    if (out.picos.some((p) => Math.abs(p.i - c.i) < 8)) continue;
    out.picos.push({ i: c.i, t: t(c.i), veces: r1(c.x), extra: Math.round((c.x / normal - 1) * 100) });
  }
  out.picos.sort((a, b) => a.i - b.i);

  // Qué hacer.
  const s = out.sugerencias;
  const intro = ret[10] ?? 100; // al 5 %
  if (intro < 75) {
    s.push({ tipo: 'fuga', t: t(10), texto: `En los primeros ${mmss(t(10))} se va el ${Math.round(100 - intro)}% de quien la empieza.`, accion: 'Recorta la introducción y empieza con el gancho: qué van a conseguir viéndola hasta el final.' });
  }
  for (const f of out.fugas) {
    if (f.desde < 10 && intro < 75) continue;
    s.push({ tipo: 'fuga', t: f.t0, t1: f.t1, texto: `Punto de fuga: se va el ${Math.round(f.caida)}% de quien la empezó (de ${Math.round(f.antes)}% a ${Math.round(f.despues)}%).`, accion: 'Revisa ese tramo: si es relleno, una digresión o baja el ritmo, córtalo o acórtalo en la grabación.' });
  }
  for (const x of out.saltos) {
    s.push({ tipo: 'salto', t: x.t0, t1: x.t1, texto: `Muchas personas se saltan este tramo (avanzan y siguen viendo después).`, accion: 'Es el candidato más claro a cortar: no les interesa, pero lo que viene después sí.' });
  }
  for (const p of out.picos) {
    s.push({ tipo: 'pico', t: p.t, texto: `Momento de gran interés: se ve un ${p.extra}% más veces de lo normal (vuelven atrás para verlo).`, accion: 'Úsalo como clip para anuncios, reels o el grupo de WhatsApp, y valora adelantarlo en el vídeo.' });
  }
  if (out.final < 30) {
    s.push({ tipo: 'final', t: t(TRAMOS - 6), texto: `Solo el ${Math.round(out.final)}% de quien empieza el vídeo llega al final.`, accion: 'Si la oferta está al final, adelántala o anúnciala al principio («al final te enseño…») para que se queden.' });
  }
  if (!s.length) s.push({ tipo: 'ok', t: 0, texto: 'La retención es estable: no hay caídas bruscas ni tramos que se salten.', accion: 'No hace falta cortar nada; mantén la estructura.' });
  return out;
}

// ---------- Directo (Zoom) ----------
// curva: { inicio (ms del minuto 0 = hora del directo), desde (ms del primer punto), paso (ms), valores: [personas] }
// → { serie: [{ min (desde la hora del directo), n, ret (% del pico) }], pico, picoMin, fugas, final, tarde,
//     suficiente, sugerencias }
export function analizarDirecto(curva, { nombre = 'el directo' } = {}) {
  const vals = (curva?.valores || []).map((x) => Number(x) || 0);
  const paso = Number(curva?.paso) || 60_000;
  const desde = Number(curva?.desde) || Number(curva?.inicio) || 0;
  const inicio = Number(curva?.inicio) || desde;
  const min = (i) => Math.round((desde + i * paso - inicio) / 60_000);
  const pico = Math.max(0, ...vals);
  const iPico = vals.indexOf(pico);
  const ret = vals.map((n) => (pico ? (n / pico) * 100 : 0));
  const serie = vals.map((n, i) => ({ min: min(i), n, ret: r1(ret[i]) }));
  // Hasta dónde mirar: el último minuto con alguien (al final solo queda el equipo).
  let ultimo = vals.length - 1;
  while (ultimo > 0 && vals[ultimo] <= Math.max(2, pico * 0.03)) ultimo--;
  const suficiente = pico >= MIN_PERSONAS_DIRECTO;
  const out = { serie, pico, picoMin: iPico >= 0 ? min(iPico) : 0, fugas: [], final: r1(ret[Math.max(0, ultimo - 5)] ?? 0), suficiente, sugerencias: [] };
  if (!suficiente) return out;

  // Fugas: después del pico, en ventanas de 5 minutos.
  const ventana = Math.max(1, Math.round(300_000 / paso));
  out.fugas = fugas(suavizar(ret, 1), { ventana, desde: Math.max(0, iPico), hasta: Math.max(0, ultimo - 3), minCaida: 5 })
    .map((f) => ({ ...f, min0: min(f.desde), min1: min(f.hasta), personas: Math.round((f.caida / 100) * pico) }));
  // Llegan tarde: cuánto tarda en llegar al 80 % del pico.
  const i80 = vals.findIndex((n) => n >= pico * 0.8);
  out.tarde = i80 >= 0 ? Math.max(0, min(i80)) : 0;

  const s = out.sugerencias;
  if (out.tarde >= 10) {
    s.push({ tipo: 'tarde', min: out.tarde, texto: `La mayoría (el 80% del máximo) no llegó hasta el minuto ${out.tarde}.`, accion: 'No des lo importante en los primeros minutos: abre con algo ligero e interactivo, y manda un último aviso por WhatsApp y email a la hora en punto.' });
  }
  s.push({ tipo: 'pico', min: out.picoMin, texto: `Máximo de asistencia: ${pico.toLocaleString('es-ES')} personas a la vez.`, accion: 'Ese es el mejor momento para lo más importante del contenido; la oferta, poco después, antes de que empiece a bajar.' });
  for (const f of out.fugas) {
    s.push({ tipo: 'fuga', min: f.min0, min1: f.min1, texto: `Punto de fuga: se van unas ${f.personas.toLocaleString('es-ES')} personas (el ${Math.round(f.caida)}% del máximo).`, accion: 'Mira en la grabación qué pasaba ahí (¿se alargó una parte, bajó el ritmo, empezó la venta?). En el próximo directo acórtalo, o en la grabación córtalo.' });
  }
  if (out.final < 40) {
    s.push({ tipo: 'final', min: min(Math.max(0, ultimo - 5)), texto: `Al final quedaba el ${Math.round(out.final)}% del máximo.`, accion: 'Si la oferta va al final, adelántala o anúnciala desde el principio con un motivo para quedarse (bonus en directo, sorteo, preguntas).' });
  }
  return out;
}

// Curva del directo a partir del informe de participantes de Zoom: personas distintas conectadas en cada minuto,
// desde 10 minutos antes de la hora (o la primera entrada) hasta la última salida.
//  participantes: [{ clave (email o id), entra (ms), sale (ms) }], inicio: ms de la hora del directo (o null).
export function curvaDirecto(participantes, inicio) {
  const ps = participantes.filter((p) => p.entra && p.sale && p.sale > p.entra);
  if (!ps.length) return null;
  const primera = Math.min(...ps.map((p) => p.entra));
  const ultima = Math.max(...ps.map((p) => p.sale));
  const cero = inicio || primera;
  const paso = 60_000;
  const desde = Math.floor(Math.max(primera, cero - 10 * paso) / paso) * paso;
  const n = Math.min(480, Math.ceil((ultima - desde) / paso)); // como mucho 8 horas
  const valores = Array.from({ length: n }, (_, i) => {
    const t = desde + i * paso + paso / 2;
    return new Set(ps.filter((p) => p.entra <= t && p.sale > t).map((p) => p.clave)).size;
  });
  return { inicio: cero, desde, paso, valores };
}
