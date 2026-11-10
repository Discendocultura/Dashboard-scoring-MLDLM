// 🚀 Montaje con IA, en el servidor: guardar lo que hace la IA o el equipo en cada fase, aprobar, pedir cambios y
// reabrir, y el encargo de cada fase para Claude. Las fases, piezas y reglas sin servidor están en public/js/montaje.js.
// Se guarda por cliente y lanzamiento: lsd_montaje_<código>. Al aprobar la fase 1, su narrativa pasa a ser la del
// lanzamiento (la que usan los prompts de páginas, anuncios, emails y WhatsApp).
import { leerJSON, guardarJSON, reintentando, versionDe } from './store.js';
import { getConfig, saveConfig } from './config-store.js';
import { leerMarca } from './marca.js';
import { clienteActual } from './cliente.js';
import { contextoMarca, disenoTexto, productoDeEmbudo, nombreDeProducto } from '../public/js/marca.js';
import { promptNarrativa, sanitizeNarrativa, tituloDe } from '../public/js/narrativa.js';
import { nombreProducto } from '../public/js/producto.js';
import { autoCtx } from '../public/js/automatizaciones.js';
import { FASE, FASES, limpiarMontaje, limpiarPieza, piezasDe, faltanPiezas, estadosFases, faseActual, briefFase, resumenMontaje, esSvg } from '../public/js/montaje.js';

const clave = (code) => `lsd_montaje_${code}`;
const fallo = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const CODE_RE = /^[\w-]{1,80}$/;

async function lanzamiento(code) {
  if (!CODE_RE.test(String(code || ''))) throw fallo('Lanzamiento no válido', 400);
  const config = await getConfig();
  const l = config.launches?.[code];
  if (!l) throw fallo(`No existe el lanzamiento «${code}».`, 404);
  return { config, l };
}
// Contexto de las piezas que dependen del lanzamiento (los workflows de la fase 6).
const ctxPiezas = (code, l) => ({ code, auto: autoCtx('lanzamientos', l, { code, cliente: clienteActual().nombre, clienteId: clienteActual().id }) });

export async function leerMontaje(code) {
  const { l } = await lanzamiento(code);
  return { montaje: limpiarMontaje((await leerJSON(clave(code))) || {}), l };
}

function cambiar(code, fn) {
  return reintentando(async () => {
    const crudo = await leerJSON(clave(code), () => ({})); // {} con versión 0: si otra persona lo crea a la vez, conflicto
    const m = limpiarMontaje(crudo);
    const r = await fn(m);
    const nuevo = limpiarMontaje(m);
    await guardarJSON(clave(code), nuevo, { version: versionDe(crudo), motivo: `Montaje ${code}` });
    return r ?? nuevo;
  });
}
const anotar = (m, fase, accion, quien, detalle = '') => {
  m.registro = [{ at: new Date().toISOString(), fase, accion, quien, detalle: String(detalle).slice(0, 600) }, ...(m.registro || [])].slice(0, 80);
};

export async function empezar(code, quien) {
  await lanzamiento(code);
  return cambiar(code, (m) => {
    if (!m.creado) { m.creado = { por: quien, at: new Date().toISOString() }; anotar(m, '', 'empezado', quien); }
  });
}

// Guarda piezas de una fase. origen 'ia' (el conector) o 'persona' (la pestaña).
//   listo: true → «para revisar» (si están todas las piezas); si no, «la IA está en ello».
// La IA no escribe en una fase aprobada ni en una bloqueada. Si una persona cambia una fase aprobada, vuelve a revisar.
export async function guardarFase(code, faseId, { piezas = {}, nota, listo = false } = {}, { quien, origen = 'persona' } = {}) {
  if (!FASE[faseId]) throw fallo('Fase desconocida');
  const { l } = await lanzamiento(code);
  const ctx = ctxPiezas(code, l);
  const defs = Object.fromEntries(piezasDe(faseId, ctx).map((d) => [d.id, d]));
  const desconocidas = Object.keys(piezas || {}).filter((id) => !defs[id]);
  if (desconocidas.length) throw fallo(`Piezas que no son de esta fase: ${desconocidas.join(', ')}. Las suyas: ${Object.keys(defs).join(', ')}.`);
  let resultado = null;
  const m = await cambiar(code, (m) => {
    const est = estadosFases(m).find((x) => x.id === faseId).estado;
    if (est === 'bloqueada') throw fallo(`La fase ${FASE[faseId].n} aún está bloqueada: falta aprobar la ${FASE[faseId].n - 1}.`, 409);
    if (est === 'aprobada' && origen === 'ia') throw fallo('Esta fase ya está aprobada: si hay que cambiarla, una persona admin tiene que reabrirla en AlquimIA.', 409);
    const f = m.fases[faseId] || { estado: 'pendiente', piezas: {} };
    for (const [id, p] of Object.entries(piezas || {})) {
      f.piezas[id] = { ...(f.piezas[id] || {}), ...limpiarPieza(p, defs[id].tipo) };
    }
    if (nota != null) f.nota = String(nota).slice(0, 4000);
    const faltan = faltanPiezas(faseId, f, ctx);
    if (origen === 'ia') {
      f.estado = listo && !faltan.length ? 'revisar' : 'trabajando';
      if (f.estado === 'revisar') delete f.cambios;
    } else if (f.estado === 'aprobada') {
      f.estado = 'revisar';
      delete f.aprobada;
      f.nota = `${f.nota ? `${f.nota}\n` : ''}(${quien} la cambió después de aprobarla: vuelve a revisarla.)`;
    } else if (f.estado === 'pendiente') f.estado = listo && !faltan.length ? 'revisar' : 'trabajando';
    else if (listo && !faltan.length) f.estado = 'revisar';
    f.actualizado = { por: quien, at: new Date().toISOString(), origen };
    m.fases[faseId] = f;
    if (!m.creado) m.creado = { por: quien, at: f.actualizado.at };
    anotar(m, faseId, origen === 'ia' ? (f.estado === 'revisar' ? 'ia-lista' : 'ia-avance') : 'editada', quien, Object.keys(piezas || {}).join(', '));
    resultado = { faltan, estado: f.estado };
  });
  return { montaje: m, ...resultado };
}

// Aprobar (solo admin): con todas las piezas. Fase 1: su narrativa pasa al lanzamiento.
export async function aprobarFase(code, faseId, quien) {
  if (!FASE[faseId]) throw fallo('Fase desconocida');
  const { l } = await lanzamiento(code);
  const ctx = ctxPiezas(code, l);
  let narrativa = null;
  const m = await cambiar(code, (m) => {
    const est = estadosFases(m).find((x) => x.id === faseId).estado;
    if (est === 'bloqueada') throw fallo('Primero hay que aprobar la fase anterior.', 409);
    if (est === 'aprobada') throw fallo('Ya está aprobada.', 409);
    const f = m.fases[faseId] || { piezas: {} };
    const faltan = faltanPiezas(faseId, f, ctx);
    if (faltan.length) throw fallo(`Falta: ${faltan.join(', ')}.`);
    f.estado = 'aprobada';
    f.aprobada = { por: quien, at: new Date().toISOString() };
    delete f.cambios;
    m.fases[faseId] = f;
    anotar(m, faseId, 'aprobada', quien);
    if (faseId === 'identidad') {
      const texto = f.piezas.narrativa?.texto || '';
      narrativa = sanitizeNarrativa({ titulo: tituloDe(texto) || l.name || code, texto });
    }
  });
  if (narrativa) await guardarNarrativa(code, narrativa);
  return m;
}
async function guardarNarrativa(code, n) {
  await reintentando(async () => {
    const actual = await getConfig({ fresh: true });
    if (!actual.launches?.[code]) return;
    await saveConfig({ ...actual, launches: { ...actual.launches, [code]: { ...actual.launches[code], narrativa: n } } }, { version: versionDe(actual), motivo: 'Narrativa del lanzamiento (Montaje)' });
  });
}

export async function pedirCambios(code, faseId, texto, quien) {
  if (!FASE[faseId]) throw fallo('Fase desconocida');
  const t = String(texto || '').trim();
  if (!t) throw fallo('Escribe qué hay que cambiar.');
  await lanzamiento(code);
  return cambiar(code, (m) => {
    const est = estadosFases(m).find((x) => x.id === faseId).estado;
    if (est === 'bloqueada') throw fallo('Esta fase aún está bloqueada.', 409);
    const f = m.fases[faseId] || { piezas: {} };
    f.estado = 'cambios';
    f.cambios = t.slice(0, 4000);
    delete f.aprobada;
    m.fases[faseId] = f;
    anotar(m, faseId, 'cambios', quien, t);
  });
}

// Reabrir una fase aprobada (solo admin): vuelve a «para revisar». Las siguientes se quedan como estén, pero
// quedan bloqueadas hasta que se apruebe otra vez.
export async function reabrirFase(code, faseId, quien) {
  if (!FASE[faseId]) throw fallo('Fase desconocida');
  await lanzamiento(code);
  return cambiar(code, (m) => {
    const f = m.fases[faseId];
    if (f?.estado !== 'aprobada') throw fallo('No está aprobada.');
    f.estado = 'revisar';
    delete f.aprobada;
    anotar(m, faseId, 'reabierta', quien);
  });
}

// Contexto para el encargo de una fase: la ficha de marca, el estilo visual y el prompt de narrativa.
export async function ctxBrief(code, { config, l } = {}) {
  if (!l) ({ config, l } = await lanzamiento(code));
  const marca = await leerMarca().catch(() => null);
  const producto = marca ? productoDeEmbudo(marca, l.embudo || '') : null;
  const nombreProd = producto ? nombreDeProducto(producto) : nombreProducto(config);
  const ficha = marca ? contextoMarca(marca, producto) : '';
  const diseno = marca ? disenoTexto(marca) : '';
  const anterior = Object.entries(config.launches || {}).filter(([c, x]) => c !== code && x.narrativa?.titulo).map(([, x]) => x.narrativa.titulo).slice(-3).join(', ');
  return {
    l, code, cliente: clienteActual().nombre, producto: nombreProd, ficha, diseno, ...ctxPiezas(code, l),
    narrativaPrompt: promptNarrativa({ marca: clienteActual().nombre, producto: nombreProd, contexto: ficha, diseno, lanzamiento: l.name || code, anterior }),
  };
}

// Para el conector: la fase que toca (o la pedida), su encargo y el estado de todas.
export async function contextoMontaje(code, faseId = '') {
  const { config, l } = await lanzamiento(code);
  const m = limpiarMontaje((await leerJSON(clave(code))) || {});
  const ctx = await ctxBrief(code, { config, l });
  const actual = faseActual(m);
  const fase = faseId || actual;
  const estados = estadosFases(m);
  if (!fase) return { lanzamiento: l.name || code, terminado: true, fases: estados, siguiente: 'Todas las fases están aprobadas: el montaje está terminado.' };
  if (!FASE[fase]) throw fallo(`Fase desconocida. Las fases: ${FASES.map((f) => f.id).join(', ')}.`);
  const est = estados.find((x) => x.id === fase).estado;
  const x = m.fases[fase] || {};
  return {
    lanzamiento: l.name || code, codigo: code, fase, estado: est, fases: estados.map((e) => ({ ...e, titulo: FASE[e.id].titulo })),
    ...(est === 'bloqueada' ? { aviso: `Esta fase está bloqueada: la que toca es «${actual}».` } : {}),
    ...(est === 'aprobada' ? { aviso: 'Esta fase ya está aprobada: no la cambies.' } : {}),
    ...(est === 'revisar' ? { aviso: 'Esta fase ya está entregada y espera el aprobado de una persona admin: no hagas nada más hasta que la aprueben o pidan cambios.' } : {}),
    cambiosPedidos: x.cambios || '',
    yaGuardado: Object.fromEntries(Object.entries(x.piezas || {}).map(([id, p]) => [id, { ...(p.url ? { url: p.url } : {}), ...(p.hecho ? { hecho: true } : {}), ...(p.colores?.length ? { colores: p.colores } : {}), ...(p.texto ? { texto: esSvg(p.texto) ? '(SVG guardado)' : p.texto.slice(0, 3000) } : {}) }])),
    encargo: briefFase(fase, m, ctx),
  };
}

// Para la etiqueta del menú: { código: resumen } de los lanzamientos con montaje.
export async function resumenes(codes) {
  const out = {};
  await Promise.all(codes.filter((c) => CODE_RE.test(c)).slice(0, 60).map(async (c) => {
    const m = await leerJSON(clave(c));
    const r = m ? resumenMontaje(limpiarMontaje(m)) : null;
    if (r) out[c] = r;
  }));
  return out;
}
