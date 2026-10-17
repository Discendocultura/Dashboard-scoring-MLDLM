// API de solo lectura para el setter IA (otro proyecto): lo que necesita saber para conversar con cada lead, en texto
// listo para el prompt. Sin emails ni teléfonos (de la persona, solo su nombre de pila).
//   marca:       ficha de marca y avatar, oferta y testimonios del producto elegido (funciona sin lanzamiento)
//   lanzamiento: fechas, fase actual, oferta, enlaces de pago y la encuesta (preguntas y opciones)
//   lead:        encuesta, clases vistas, directo, VIP, inicio de pago, compra, origen y puntuación (la misma fórmula
//                que el dashboard: scoring.js)
import { contextoMarca, productoDeEmbudo, nombreDeProducto } from '../public/js/marca.js';
import { nombreProducto } from '../public/js/producto.js';
import { sanitizeNarrativa } from '../public/js/narrativa.js';
import { videosDe, clasesDe, conVip, sigDirecto, sigReplay, esEnDirecto, FORMATOS } from '../public/js/videos.js';
import { phaseAt, madridToEpoch, milestones } from '../public/js/page.js';
import { momentosCarrito, ventanaBonus, tipoBonus, textoGarantia, tipoEntregable } from '../public/js/oferta.js';
import { esSuscripcion, planesActivos, conFraccionado } from '../public/js/pago.js';
import { enrichLead, respuestasDe } from '../public/js/metrics.js';
import { watched, score, estadoFor, nextStepFor, NEXT_STEPS, OUTCOMES } from '../public/js/scoring.js';
import { pesosDe } from '../public/js/pesos.js';
import { tieneRecurso, recursosDe } from '../public/js/recursos.js';

const MADRID = 'Europe/Madrid';
const fecha = (ms, { hora = true } = {}) => (ms == null ? '' : new Date(ms).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', ...(hora ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: MADRID }));
const local = (s, opts) => fecha(madridToEpoch(s), opts);
const dia = (d) => (d ? fecha(Date.parse(`${d}T12:00:00Z`), { hora: false }) : '');
const euros = (n) => (Number(n) > 0 ? `${Number(n).toLocaleString('es-ES')} €` : '');
const linea = (etq, v) => (v ? `- ${etq}: ${v}` : '');
const bloque = (titulo, lineas) => { const l = lineas.filter(Boolean); return l.length ? [`## ${titulo}`, ...l].join('\n') : ''; };
const unir = (partes) => partes.filter(Boolean).join('\n\n').trim();

// ---------- Producto (flexible: cada proyecto elige el suyo) ----------
// pedido: id o nombre del producto; si no, el del embudo; si no, el primero.
export function elegirProducto(m, { pedido = '', embudo = '' } = {}) {
  const ps = m?.productos || [];
  const p = String(pedido || '').trim().toLowerCase();
  if (p) {
    const x = ps.find((y, i) => y.id === pedido || nombreDeProducto(y, i).toLowerCase() === p);
    if (x) return x;
  }
  return productoDeEmbudo(m, embudo);
}
export const listaProductos = (m) => (m?.productos || []).map((p, i) => ({ id: p.id, nombre: nombreDeProducto(p, i) }));

// ---------- 1 · Marca ----------
export function textoMarca({ cliente, m, producto, config }) {
  const nombre = producto ? nombreDeProducto(producto, (m?.productos || []).indexOf(producto)) : nombreProducto(config);
  const r = producto?.respuestas || {};
  const ficha = contextoMarca(m, producto);
  const otros = listaProductos(m).filter((x) => x.id !== producto?.id);
  return unir([
    `# ${cliente} · ${nombre}`,
    bloque('Ficha de marca, producto y avatar', [ficha || '(Sin ficha: falta el cuestionario de marca en Equipo → Marca y avatar.)']),
    // Los testimonios, aparte y literales (si la ficha ya está hecha, pueden no ir en ella).
    r.testimonios ? bloque('Testimonios y casos (literales: no los inventes ni los adornes)', [r.testimonios]) : '',
    otros.length ? `Otros productos de este proyecto (pide otro con &producto=<id>): ${otros.map((x) => `${x.nombre} (${x.id})`).join(' · ')}` : '',
  ]);
}

// ---------- 2 · Lanzamiento ----------
const FASES = {
  preparacion: 'Preparación: aún no ha empezado la captación.',
  captacion: 'Captación: el registro está abierto y la preclase aún no ha empezado.',
  directo_hoy: 'Hoy es el directo.',
  en_directo: 'El directo está en marcha ahora mismo.',
  carrito: 'Carrito abierto: ya se puede comprar.',
  grabacion: 'El directo ya ha pasado y el carrito aún no ha abierto.',
  cerrado: 'Lanzamiento cerrado: el carrito ya ha cerrado.',
};
export function faseActual(l, ahora = Date.now()) {
  const inicio = l.inicioCaptacion ? Date.parse(`${l.inicioCaptacion}T00:00:00Z`) : null;
  if (inicio != null && ahora < inicio) return { id: 'preparacion', texto: FASES.preparacion };
  const ph = phaseAt(l, ahora);
  const M = momentosCarrito(l);
  if (ph.id === 'cerrado' || (M.cierre != null && ahora >= M.cierre)) return { id: 'cerrado', texto: FASES.cerrado };
  if (/^c\d+$/.test(ph.id)) {
    const n = Number(ph.id.slice(1));
    return { id: 'preclase', texto: `Preclase: ya está disponible la clase ${n}${n < clasesDe(l).length ? ` (la clase ${n + 1} se abre ${fecha(ph.changesAt)})` : ''}.` };
  }
  if (ph.id === 'pre_c1') return { id: 'captacion', texto: FASES.captacion + (ph.countdownTo ? ` La clase 1 se abre ${fecha(ph.countdownTo)}.` : '') };
  if (/^v\d+$/.test(ph.id)) return { id: 'entre_videos', texto: `Ya ha pasado el vídeo ${ph.id.slice(1)}; el siguiente es ${fecha(ph.countdownTo)}.` };
  if (ph.id.startsWith('dia_directo')) return { id: 'directo_hoy', texto: `${FASES.directo_hoy} Empieza ${fecha(ph.countdownTo)}.` };
  if (ph.id.startsWith('en_directo')) return { id: 'en_directo', texto: FASES.en_directo };
  if (M.apertura != null && ahora >= M.apertura) return { id: 'carrito', texto: `${FASES.carrito}${M.cierre ? ` Cierra ${fecha(M.cierre)}.` : ''}` };
  return { id: 'grabacion', texto: `${FASES.grabacion}${M.apertura ? ` Abre ${fecha(M.apertura)}.` : ''}` };
}

function lineasOferta(l) {
  const o = l.oferta || {};
  const out = [];
  if (esSuscripcion(l)) out.push(...planesActivos(l).map((p) => linea(`Plan ${p.label || p.id}`, `${euros(p.precio)}${p.url ? ` · pago: ${p.url}` : ''}`)));
  else {
    out.push(linea('Precio (pago único)', euros(l.precioPrograma)));
    if (conFraccionado(l)) out.push(linea('Precio a plazos', euros(l.precioFraccionado)));
  }
  if (conVip(l) && Number(l.precioVip) > 0) out.push(linea('Entrada VIP (antes del directo)', euros(l.precioVip)));
  for (const e of o.entregables || []) out.push(`- Incluye: ${e.nombre}${e.detalle ? ` — ${e.detalle}` : ''} (${tipoEntregable(e.tipo).label})${e.valor ? ` · valor ${euros(e.valor)}` : ''}`);
  for (const b of o.bonus || []) {
    const v = ventanaBonus(b, l);
    const t = tipoBonus(b.tipo);
    out.push(`- Bonus: ${b.nombre}${b.detalle ? ` — ${b.detalle}` : ''} (${t.largo || t.label}${v.hasta ? `, solo hasta ${fecha(v.hasta)}` : ''})${b.valor ? ` · valor ${euros(b.valor)}` : ''}`);
  }
  const g = textoGarantia(o.garantia);
  if (g) out.push(linea('Garantía', g));
  return out;
}

// preguntas: config.encuesta enriquecidas con sus opciones de GHL ({ id, name, tipo, opciones: [] }).
export function textoLanzamiento({ code, l, preguntas = [], nombre, narrativa = true, ahora = Date.now() }) {
  const vs = videosDe(l);
  const m = milestones(l);
  const M = momentosCarrito(l);
  const fase = faseActual(l, ahora);
  const n = sanitizeNarrativa(l.narrativa);
  const fechas = [
    linea('Captación', [l.inicioCaptacion && `desde el ${dia(l.inicioCaptacion)}`, l.finCaptacion && `hasta el ${dia(l.finCaptacion)}`].filter(Boolean).join(' ')),
    ...clasesDe(l).map((c, i) => linea(`Clase ${i + 1} de la preclase`, fecha(m[c]))),
    ...vs.map((v, i) => linea(`${v.nombre}${esEnDirecto(v) || v.k === 1 ? ' (en directo)' : ''}`, fecha(m.videos[i]?.inicio))),
    ...vs.map((v, i) => linea(`Grabación de «${v.nombre}» disponible`, fecha(m.videos[i]?.replay))),
    linea('Abre el carrito', fecha(M.apertura)),
    linea('Cierra el carrito', fecha(M.cierre)),
  ];
  const enlaces = [
    linea('Página de venta', l.raicesUrl || l.ventaUrl),
    linea('Página de pago', l.paginaPagoUrl),
    linea('Pago único', l.ventaUrl && l.ventaUrl !== l.raicesUrl ? l.ventaUrl : ''),
    linea('Pago a plazos', l.ventaFraccionadoUrl),
    linea('Reservar llamada', l.llamadaUrl),
    linea('Grabación', l.replayUrl),
    linea('Preclase', l.recursosUrl),
    linea('Entrada VIP', conVip(l) ? l.vipUrl : ''),
    linea('Grupo de WhatsApp', l.whatsappUrl),
  ];
  const enc = preguntas.map((p) => `- «${p.name}»${p.opciones?.length ? `: ${p.opciones.map((o) => `«${o}»`).join(', ')}` : p.tipo === 'texto' ? ' (respuesta libre)' : p.tipo === 'edad' ? ' (edad en años)' : ''}`);
  return unir([
    `# Lanzamiento «${l.name || code}» (${code}) · ${nombre}\nFormato: ${FORMATOS[l.formato || 'webinar']?.label || 'Webinar'}`,
    bloque('Fase actual', [fase.texto]),
    bloque('Fechas (hora de España)', fechas),
    bloque('Oferta', lineasOferta(l)),
    bloque('Enlaces', enlaces),
    narrativa && n?.texto ? bloque('Narrativa del lanzamiento (la gran idea)', [n.titulo ? `«${n.titulo}»` : '', n.texto]) : '',
    bloque('Encuesta (preguntas y opciones)', enc),
  ]);
}

// ---------- 3 · Lead ----------
// contact: de GHL (con todos sus campos). extra: { inicioPago: { primera, ultima, veces }, ventaVisita }.
export function datosLead({ contact, code, config, extra = {} }) {
  const lead = enrichLead(contact, code, config);
  const s = lead.s;
  if (extra.inicioPago) s.inicio_pago = extra.inicioPago;
  if (extra.ventaVisita) s.venta_visita = extra.ventaVisita;
  const pts = score(s, pesosDe(config));
  return { lead, s, puntos: pts, temperatura: estadoFor(pts) };
}
const pct = (s, v) => { const p = watched(s, v); return p ? `${p}%` : 'no'; };
export function textoLead({ contact, code, config, extra = {}, preguntas = [], ahora = Date.now() }) {
  const l = config.launches[code];
  const { lead, s, puntos, temperatura } = datosLead({ contact, code, config, extra });
  const registrado = !l.registroTag || (contact.tags || []).some((t) => String(t).toLowerCase() === String(l.registroTag).toLowerCase());
  const encuesta = preguntas.map((p) => { const r = respuestasDe(lead, p); return r.length ? `- «${p.name}»: ${r.join(' · ')}` : ''; }).filter(Boolean);
  const R = s.recursos || {};
  const preclase = [
    ...clasesDe(l).map((c, i) => linea(`Clase ${i + 1}`, pct(s, c) === 'no' ? 'no la ha visto' : `vista hasta el ${pct(s, c)}`)),
    R.musica ? linea('Música', s.musica_90 ? 'la escuchó entera' : s.musica_50 ? 'más de la mitad' : s.musica_play ? 'le dio al play' : 'no') : '',
    R.test ? linea('Test', s.test ? 'hecho' : 'no') : '',
    R.soloVotacion ? linea('Votación', s.voto ? 'votó' : 'no') : '',
    R.comentarios ? linea('Comentarios', s.comento ? 'comentó' : 'no') : '',
    tieneRecurso(l, 'descargable') ? linea(`Descargable${recursosDe(l).descargable?.nombre ? ` «${recursosDe(l).descargable.nombre}»` : ''}`, s.descarga ? 'lo abrió' : 'no') : '',
  ];
  const videos = videosDe(l).map((v) => {
    const d = sigDirecto(v.k);
    const vivo = s[`${d}_final`] ? 'se quedó hasta el final' : s[`${d}_60`] ? 'estuvo más de 60 min' : s[`${d}_asistio`] ? 'entró' : s[`${d}_click`] ? 'pulsó el enlace pero no consta que entrara' : 'no';
    const rep = watched(s, sigReplay(v.k));
    return `- ${v.nombre}: en directo ${vivo}; grabación ${rep ? `vista hasta el ${rep}%` : 'no vista'}`;
  });
  const src = contact.src || {};
  const origen = [
    s.origen === 'publi' ? 'publicidad' : s.origen === 'organico' ? 'orgánico' : '',
    src.campaign && `campaña «${src.campaign}»`, src.term && `conjunto «${src.term}»`, src.content && `anuncio «${src.content}»`,
    !src.campaign && src.source ? `fuente «${src.source}»` : '',
  ].filter(Boolean).join(', ');
  const pago = s.inicio_pago;
  const compra = s.compra
    ? `SÍ${s.fecha_compra ? `, el ${dia(s.fecha_compra)}` : ''}${s.fraccionado ? ' (a plazos)' : s.unico ? ' (pago único)' : s.plan ? ` (plan ${s.plan})` : ''}`
    : s.clienta_anterior ? 'no en este lanzamiento (ya era clienta de antes)' : 'no';
  const resultado = OUTCOMES.find((o) => s[`res_${o.id}`])?.label || '';
  return unir([
    `# Lead: ${contact.firstName || 'sin nombre'} · lanzamiento «${l.name || code}»`,
    bloque('Resumen', [
      linea('Registrada en este lanzamiento', registrado ? 'sí' : 'NO'),
      linea('Puntuación', `${puntos}/100 · ${temperatura.label}`),
      linea('Siguiente paso recomendado', NEXT_STEPS[nextStepFor(s)] || ''),
      linea('Tráfico', s.trafico === 'templado' ? 'templado (ya estaba en la lista antes de este lanzamiento)' : s.trafico === 'frio' ? 'frío (nueva en este lanzamiento)' : ''),
      linea('Origen', origen),
      linea('Resultado anotado por la setter', resultado),
    ]),
    bloque('Encuesta', encuesta.length ? encuesta : ['- No ha rellenado la encuesta.']),
    bloque('Preclase', preclase.length ? preclase : ['- Este lanzamiento no tiene preclase.']),
    bloque('Directo y grabación', videos),
    bloque('Compra', [
      conVip(l) ? linea('Entrada VIP', s.vip ? 'sí' : s.vip_anterior ? 'no en este (la tuvo en uno anterior)' : 'no') : '',
      linea('Visitó la página de venta', s.venta_visita ? `sí${s.venta_visita.veces > 1 ? ` (${s.venta_visita.veces} veces)` : ''}, la última ${fecha(s.venta_visita.ultima)}` : 'no consta'),
      linea('Inició el pago', pago ? `sí${pago.veces > 1 ? ` (${pago.veces} veces)` : ''}, la última ${fecha(pago.ultima)}${s.compra ? '' : ' — y NO ha comprado: es la más cercana a comprar'}` : 'no'),
      linea('Compró', compra),
    ]),
    `(Datos a ${fecha(ahora)}.)`,
  ]);
}
