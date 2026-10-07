// La configuración (lanzamientos y plantillas de WhatsApp) se guarda en un "Custom Value"
// de la subcuenta de GHL. Así no necesitamos base de datos y admin y setter ven lo mismo.
import { storeGet, storeSet, fijarVersion } from './store.js';
import { clienteActual } from './cliente.js';
import { pestanaIds } from '../public/js/embudos-def.js';
import { cachePorCliente } from './cliente.js';
import { DEFAULT_TEMPLATES, NEUTRAL_TEMPLATES, LAUNCH_CODE_RE } from '../public/js/scoring.js';
import { ENCUESTA_PREGUNTAS } from '../public/js/encuesta.js';
import { PHASE_IDS, LINK_KEYS, LOCAL_DT_RE } from '../public/js/page.js';
import { formatoValido, nVideos } from '../public/js/videos.js';

const NAME = 'lead_scoring_dashboard_config';
const cache = cachePorCliente(); // una por cliente

const URL_FIELDS = [
  'replayUrl', 'raicesUrl', 'ventaUrl', 'ventaFraccionadoUrl', 'llamadaUrl', 'zoomJoinUrl',
  // Página de recursos
  'loginUrl', 'recursosUrl', 'vipUrl', 'whatsappUrl', 'clase1Url', 'clase2Url', 'replayVideoUrl', 'calendarioUrl', 'encuestaUrl',
  // Página de gracias (tras el registro)
  'graciasVideoUrl',
];

// Embudo VSL (siempre abierto): registro → vídeo → compra directa o llamada de valoración.
// Valores de serie: las etiquetas, el calendario y el pipeline que ya usa la VSL en GHL.
export const VSL_DEFAULT = {
  name: 'VSL Raíces',
  registroTag: 'et-registro-vsl-búsqueda', vioTag: 'et-ve-vsl-raices', compraTag: 'et-compra-raices-vsl',
  llamadaTag: '', fraccionadoTag: '', unicoTag: '', publiTag: '', organicoTag: '',
  registroDateField: '', compraDateField: '',
  vslUrl: '', raicesUrl: '', ventaUrl: '', ventaFraccionadoUrl: '',
  llamadaUrl: 'https://api.leadconnectorhq.com/widget/booking/6pgezBW77b9AMkJ8aqDJ',
  llamadasPipeline: 'Leads evergreen',
  precioPrograma: 0, precioFraccionado: 0, metaFiltro: 'vsl',
  // Páginas del embudo
  vslVideoUrl: '', botonSegundos: 0, textoCompra: 'Quiero unirme a Raíces', textoLlamada: 'Prefiero hablarlo en una llamada',
  graciasVideoUrl: '', agendaVideoUrl: '',
  accesos: [],
};
// VSL nueva (otros clientes o una segunda VSL): sin etiquetas, calendario ni textos de MLDLM.
export const VSL_VACIA = {
  ...VSL_DEFAULT, name: 'VSL', registroTag: '', vioTag: '', compraTag: '', llamadaUrl: '', llamadasPipeline: '', metaFiltro: '',
  textoCompra: 'Quiero apuntarme', textoLlamada: 'Prefiero hablarlo en una llamada',
};
const VSL_TAGS = ['registroTag', 'vioTag', 'compraTag', 'llamadaTag', 'fraccionadoTag', 'unicoTag', 'publiTag', 'organicoTag'];
const VSL_URLS = ['vslUrl', 'raicesUrl', 'ventaUrl', 'ventaFraccionadoUrl', 'llamadaUrl', 'vslVideoUrl', 'graciasVideoUrl', 'agendaVideoUrl'];

// Embudos de cada cliente (menú lateral): { id, tipo: 'lanzamientos' | 'vsl', nombre }.
// Las VSL guardan su configuración en vsls[id] (su id es también su código de tareas y llamadas).
// Los lanzamientos llevan `embudo` = el id del embudo de lanzamientos al que pertenecen.
export const TIPOS_EMBUDO = ['lanzamientos', 'vsl'];
export const EMBUDO_ID_RE = /^[a-z][a-z0-9-]{1,23}$/;
const vslBase = (id) => (id === 'vsl' && clienteActual().principal ? VSL_DEFAULT : VSL_VACIA);

function embudosPorDefecto(vsls, launches) {
  const out = [];
  if (clienteActual().principal || Object.keys(launches || {}).length) out.push({ id: 'lanz', tipo: 'lanzamientos', nombre: 'Lanzamientos' });
  for (const [id, v] of Object.entries(vsls || {})) out.push({ id, tipo: 'vsl', nombre: v.name || 'VSL' });
  return out;
}

export function emptyConfig() {
  const principal = clienteActual().principal;
  const vsls = principal ? { vsl: structuredClone(VSL_DEFAULT) } : {};
  return {
    launches: {}, templates: plantillasDeSerie(),
    // Marca del cliente: su producto (en los textos, en lugar de «Raíces») y los colores de sus emails.
    marca: principal ? { producto: 'Raíces', color: '#860d0e', color2: '#c49b79' } : { producto: '', color: '#2f4858', color2: '#86bbd8' },
    // Preguntas de la encuesta del avatar (campos de GHL) que se cruzan con las ventas.
    encuesta: principal ? ENCUESTA_PREGUNTAS.map(({ id, name, tipo }) => ({ id, name, tipo })) : [], defaultCountryCode: '34', digestEmail: '', accesos: [], formAds: { campaign: '', adset: '', ad: '' },
    vsls, embudos: embudosPorDefecto(vsls, {}),
  };
}

// Mensajes de WhatsApp de serie: los de MLDLM en el principal; neutros (con {producto}) en el resto.
const plantillasDeSerie = () => ({ ...(clienteActual().principal ? DEFAULT_TEMPLATES : NEUTRAL_TEMPLATES) });
const COLOR_RE = /^#[0-9a-f]{6}$/i;
function sanitizeMarca(m, def) {
  return {
    producto: str(m?.producto ?? def.producto, 40),
    color: COLOR_RE.test(m?.color || '') ? m.color : def.color,
    color2: COLOR_RE.test(m?.color2 || '') ? m.color2 : def.color2,
  };
}
const TIPOS_PREGUNTA = ['opciones', 'texto', 'edad'];
function sanitizeEncuesta(list) {
  if (!Array.isArray(list)) return null;
  return list.slice(0, 12).map((p) => ({
    id: str(p?.id, 40).replace(/[^A-Za-z0-9]/g, ''), name: str(p?.name, 160), tipo: TIPOS_PREGUNTA.includes(p?.tipo) ? p.tipo : 'opciones',
  })).filter((p) => p.id && p.name);
}

export async function getConfig({ fresh = false } = {}) {
  const hit = cache.get();
  if (!fresh && hit && hit.at > Date.now() - 30_000) return hit.value;
  const cv = await storeGet(NAME);
  let value = emptyConfig();
  if (cv?.value) {
    try {
      const parsed = JSON.parse(cv.value);
      // Antes había una sola VSL en `vsl`: pasa a vsls.vsl.
      const vslsGuardadas = parsed.vsls || (parsed.vsl ? { vsl: parsed.vsl } : value.vsls);
      const vsls = Object.fromEntries(Object.entries(vslsGuardadas).map(([id, v]) => [id, { ...vslBase(id), ...v }]));
      const { vsl: _viejo, ...resto } = parsed;
      value = {
        ...value, ...resto, templates: { ...plantillasDeSerie(), ...(parsed.templates || {}) }, vsls,
        marca: { ...value.marca, ...(parsed.marca || {}) },
        embudos: Array.isArray(parsed.embudos) ? parsed.embudos : embudosPorDefecto(vsls, parsed.launches),
      };
    } catch {
      console.error('Config de GHL corrupta, se usa la vacía');
    }
  }
  // Formato de cada lanzamiento = el de su embudo (por si se guardó antes de existir los formatos).
  for (const l of Object.values(value.launches || {})) {
    l.formato = value.embudos.find((e) => e.id === l.embudo)?.formato || l.formato || 'webinar';
    if (!Array.isArray(l.videos)) l.videos = [];
  }
  fijarVersion(value, cv?.version ?? null);
  cache.set({ at: Date.now(), value });
  return value;
}

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const money = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};
const localDT = (v) => (LOCAL_DT_RE.test(String(v ?? '').trim()) ? String(v).trim() : '');
const hhmm = (v) => (/^\d{2}:\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');

// Enlaces personalizados para los botones de la página: { guia: 'https://…', … }
const RESERVED_LINKS = ['vip', 'whatsapp', 'directo', 'grabacion', 'venta', 'pago', 'pago-fraccionado', 'llamada', 'recursos', 'login', 'calendario', 'calendario-ics', 'encuesta'];
function sanitizeEnlaces(e) {
  const out = {};
  for (const [k, v] of Object.entries(e || {}).slice(0, 20)) {
    const key = String(k).trim().toLowerCase();
    const url = str(v, 600);
    if (/^[a-z0-9-]{2,30}$/.test(key) && !RESERVED_LINKS.includes(key) && /^https?:\/\//i.test(url)) out[key] = url;
  }
  return out;
}

// Textos editables de la página: { 'clase1-titulo': '…', … } → <span data-lsd-text="clase1-titulo">.
const RESERVED_TEXTS = ['nombre', 'fechadirecto', 'horadirecto', 'directo', 'clase1', 'clase2', 'replay', 'cierrevip', 'cierrecarrito', 'preciovip'];
function sanitizeTextos(t) {
  const out = {};
  for (const [k, v] of Object.entries(t || {}).slice(0, 40)) {
    const key = String(k).trim().toLowerCase();
    const text = str(v, 1000);
    if (/^[a-z0-9-]{2,40}$/.test(key) && !RESERVED_TEXTS.includes(key) && text) out[key] = text;
  }
  return out;
}

// Mensajes de la barra de urgencia por fase.
function sanitizeBarra(b) {
  const out = {};
  for (const id of PHASE_IDS) {
    const v = b?.[id];
    if (!v) continue;
    out[id] = {
      text: str(v.text, 200),
      button: Object.hasOwn(LINK_KEYS, v.button) ? v.button : '',
      buttonLabel: str(v.buttonLabel, 40),
    };
  }
  return out;
}

// Accesos directos a GHL (workflows, encuesta, formularios…): [{ tipo, nombre, url }].
const ACCESO_TIPOS = ['workflow', 'pagina', 'formulario', 'encuesta', 'calendario', 'email', 'whatsapp', 'pago', 'otro'];
function sanitizeAccesos(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 30)
    .map((a) => ({ tipo: ACCESO_TIPOS.includes(a?.tipo) ? a.tipo : '', nombre: str(a?.nombre, 60), url: str(a?.url, 600) }))
    .map((a) => ({ ...a, url: /^https:\/\//i.test(a.url) ? a.url : '' }))
    .filter((a) => a.nombre);
}

export function sanitizeVsl(v, id = 'vsl') {
  const base = vslBase(id);
  const out = structuredClone(base);
  if (!v || typeof v !== 'object') return out;
  out.name = str(v.name, 80) || base.name;
  for (const k of VSL_TAGS) if (v[k] != null) out[k] = str(v[k], 120).toLowerCase();
  for (const k of VSL_URLS) {
    if (v[k] == null) continue;
    const u = str(v[k], 600);
    out[k] = /^https?:\/\//i.test(u) ? u : '';
  }
  for (const k of ['registroDateField', 'compraDateField']) out[k] = str(v[k], 40).replace(/[^A-Za-z0-9]/g, '');
  out.llamadasPipeline = str(v.llamadasPipeline ?? VSL_DEFAULT.llamadasPipeline, 80);
  out.precioPrograma = money(v.precioPrograma);
  out.precioFraccionado = money(v.precioFraccionado);
  out.metaFiltro = str(v.metaFiltro ?? VSL_DEFAULT.metaFiltro, 80);
  out.botonSegundos = Math.min(36_000, Math.max(0, Math.floor(Number(v.botonSegundos) || 0)));
  out.textoCompra = str(v.textoCompra, 60) || VSL_DEFAULT.textoCompra;
  out.textoLlamada = str(v.textoLlamada, 60) || VSL_DEFAULT.textoLlamada;
  out.accesos = sanitizeAccesos(v.accesos);
  return out;
}

const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');

export function sanitizeConfig(input) {
  const out = emptyConfig();
  out.defaultCountryCode = str(input?.defaultCountryCode, 4).replace(/\D/g, '') || '34';
  const digest = str(input?.digestEmail, 120).toLowerCase();
  out.digestEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digest) ? digest : '';
  out.accesos = sanitizeAccesos(input?.accesos);
  out.marca = sanitizeMarca(input?.marca, out.marca);
  out.encuesta = sanitizeEncuesta(input?.encuesta) ?? out.encuesta;
  // VSLs (una por embudo de tipo VSL) y lista de embudos.
  const vslsIn = input?.vsls || (input?.vsl ? { vsl: input.vsl } : {});
  out.vsls = {};
  for (const [id, v] of Object.entries(vslsIn).slice(0, 10)) if (EMBUDO_ID_RE.test(id)) out.vsls[id] = sanitizeVsl(v, id);
  out.embudos = sanitizeEmbudos(input?.embudos, out.vsls, input?.launches);
  // Campos de GHL con campaña / conjunto / anuncio de los formularios instantáneos de Meta (opcional).
  const fid = (v) => String(v ?? '').trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  out.formAds = { campaign: fid(input?.formAds?.campaign), adset: fid(input?.formAds?.adset), ad: fid(input?.formAds?.ad) };
  for (const k of Object.keys(out.templates)) {
    if (input?.templates?.[k] != null) out.templates[k] = str(input.templates[k], 1500);
  }
  for (const [code, l] of Object.entries(input?.launches || {})) {
    if (code === 'vsl' || out.vsls[code]) throw Object.assign(new Error('Código reservado'), { status: 400, publicMessage: `El código «${code}» ya lo usa una VSL: elige otro para el lanzamiento.` });
    if (!LAUNCH_CODE_RE.test(code)) throw Object.assign(new Error(`Código de lanzamiento no válido: ${code}`), { status: 400, publicMessage: `Código de lanzamiento no válido: "${code}" (usa minúsculas, números y guiones)` });
    const launch = {
      name: str(l.name, 80) || code,
      registroTag: str(l.registroTag, 120).toLowerCase(),
      vipTag: str(l.vipTag, 120).toLowerCase(),
      compraTag: str(l.compraTag, 120).toLowerCase(),
      encuestaTag: str(l.encuestaTag, 120).toLowerCase(),
      llamadaTag: str(l.llamadaTag, 120).toLowerCase(),
      fraccionadoTag: str(l.fraccionadoTag, 120).toLowerCase(),
      unicoTag: str(l.unicoTag, 120).toLowerCase(),
      publiTag: str(l.publiTag, 120).toLowerCase(),
      organicoTag: str(l.organicoTag, 120).toLowerCase(),
      objetivos: {
        registros: Math.max(0, Math.floor(money(l.objetivos?.registros))),
        vip: Math.max(0, Math.floor(money(l.objetivos?.vip))),
        ventas: Math.max(0, Math.floor(money(l.objetivos?.ventas))),
        facturacion: money(l.objetivos?.facturacion),
      },
      // Supuestos de la calculadora (vacío = los del histórico): conversiones en %.
      calculadora: sanitizeCalculadora(l.calculadora),
      compraDateField: str(l.compraDateField, 40).replace(/[^A-Za-z0-9]/g, ''),
      inicioCaptacion: isoDay(l.inicioCaptacion),
      finCaptacion: isoDay(l.finCaptacion),
      aperturaCarrito: localDT(l.aperturaCarrito),
      fechaDirecto: isoDay(l.fechaDirecto),
      horaDirecto: hhmm(l.horaDirecto),
      clase1At: localDT(l.clase1At),
      clase2At: localDT(l.clase2At),
      replayAt: localDT(l.replayAt),
      cierreCarrito: localDT(l.cierreCarrito),
      barra: sanitizeBarra(l.barra),
      enlaces: sanitizeEnlaces(l.enlaces),
      textos: sanitizeTextos(l.textos),
      zoomMeetingId: str(l.zoomMeetingId, 20).replace(/\D/g, ''),
      precioVip: money(l.precioVip),
      // Contador de VIP de la página: empieza en este número y suma cada VIP vendida en el lanzamiento.
      vipContadorBase: l.vipContadorBase === '' || l.vipContadorBase == null ? 41 : Math.max(0, Math.floor(Number(l.vipContadorBase) || 0)),
      precioPrograma: money(l.precioPrograma),
      precioFraccionado: money(l.precioFraccionado),
      inversion: money(l.inversion),
      metaFiltro: str(l.metaFiltro, 80),
      createdAt: l.createdAt || new Date().toISOString(),
      snapshot: sanitizeSnapshot(l.snapshot),
    };
    for (const f of URL_FIELDS) {
      const v = str(l[f], 600);
      launch[f] = /^https?:\/\//i.test(v) ? v : '';
    }
    // Embudo de lanzamientos al que pertenece (por defecto, el primero) y su formato (cuántos vídeos).
    const lanzIds = out.embudos.filter((e) => e.tipo === 'lanzamientos').map((e) => e.id);
    launch.embudo = lanzIds.includes(l.embudo) ? l.embudo : lanzIds[0] || 'lanz';
    launch.formato = out.embudos.find((e) => e.id === launch.embudo)?.formato || 'webinar';
    // Vídeos 2, 3 y 4 (el 1 usa los campos de siempre del webinar).
    launch.videos = Array.from({ length: nVideos(launch.formato) - 1 }, (_, i) => sanitizeVideo(l.videos?.[i]));
    out.launches[code] = launch;
  }
  return out;
}

// Lo que hereda un lanzamiento nuevo de la plantilla: precios, textos y barra de la página.
export function sanitizeBase(b) {
  return {
    precioVip: money(b?.precioVip), precioPrograma: money(b?.precioPrograma), precioFraccionado: money(b?.precioFraccionado),
    vipContadorBase: b?.vipContadorBase === '' || b?.vipContadorBase == null ? '' : Math.max(0, Math.floor(Number(b.vipContadorBase) || 0)),
    textos: sanitizeTextos(b?.textos), barra: sanitizeBarra(b?.barra),
  };
}

function sanitizeCalculadora(c) {
  const opt = (v, max) => (v === '' || v == null || !(Number(String(v).replace(',', '.')) > 0) ? '' : Math.min(max, money(v)));
  return {
    presupuesto: opt(c?.presupuesto, 10_000_000), roasObjetivo: opt(c?.roasObjetivo, 100),
    cpl: opt(c?.cpl, 10_000), convVip: opt(c?.convVip, 100), convVenta: opt(c?.convVenta, 100), ticket: opt(c?.ticket, 1_000_000),
  };
}

function sanitizeVideo(v) {
  const url = (x) => { const u = str(x, 600); return /^https?:\/\//i.test(u) ? u : ''; };
  return {
    fecha: isoDay(v?.fecha), hora: hhmm(v?.hora), zoomMeetingId: str(v?.zoomMeetingId, 20).replace(/\D/g, ''),
    zoomJoinUrl: url(v?.zoomJoinUrl), replayUrl: url(v?.replayUrl), replayVideoUrl: url(v?.replayVideoUrl), replayAt: localDT(v?.replayAt),
  };
}

function sanitizeEmbudos(list, vsls, launches) {
  if (!Array.isArray(list)) return embudosPorDefecto(vsls, launches);
  const vistos = new Set();
  const out = [];
  for (const e of list.slice(0, 20)) {
    const id = str(e?.id, 24);
    if (!EMBUDO_ID_RE.test(id) || vistos.has(id) || !TIPOS_EMBUDO.includes(e?.tipo)) continue;
    if (e.tipo === 'vsl' && !vsls[id]) continue; // una VSL sin configuración no existe
    if (e.tipo === 'lanzamientos' && vsls[id]) continue;
    vistos.add(id);
    // Pestañas activas del embudo (sin lista = todas).
    const validas = pestanaIds(e.tipo);
    const pestanas = Array.isArray(e.pestanas) ? [...new Set(e.pestanas.filter((p) => validas.includes(p)))] : null;
    out.push({
      id, tipo: e.tipo, nombre: str(e.nombre, 40) || (e.tipo === 'vsl' ? vsls[id].name : 'Lanzamientos'),
      // Lanzamientos: webinar (1 vídeo), v2, v3 o plf (4 PLCs).
      ...(e.tipo === 'lanzamientos' ? { formato: formatoValido(e.formato) } : {}),
      // Base de los lanzamientos nuevos de este embudo (viene de una plantilla de agencia).
      ...(e.tipo === 'lanzamientos' && e.base && typeof e.base === 'object' ? { base: sanitizeBase(e.base) } : {}),
      ...(pestanas?.length ? { pestanas } : {}),
    });
  }
  // Toda VSL guardada tiene su entrada en el menú.
  for (const [id, v] of Object.entries(vsls)) if (!vistos.has(id)) out.push({ id, tipo: 'vsl', nombre: v.name });
  return out;
}

// Registro de la "foto" de VIP / clientas anteriores hecha al crear el lanzamiento.
function sanitizeSnapshot(snap) {
  if (!snap || typeof snap !== 'object' || !snap.at) return null;
  const counts = {};
  for (const [k, v] of Object.entries(snap.counts || {})) {
    if (/^[a-zA-Z]{1,30}$/.test(k)) counts[k] = Math.max(0, Math.floor(Number(v) || 0));
  }
  const tags = {};
  for (const [k, v] of Object.entries(snap.tags || {})) {
    if (/^[a-zA-Z]{1,30}$/.test(k)) tags[k] = str(v, 120).toLowerCase();
  }
  return { at: str(snap.at, 40), counts, tags };
}

// `version`: la versión que tenía quien edita (si otra persona guardó entretanto, Conflicto).
export async function saveConfig(input, { version = null, motivo = '' } = {}) {
  const value = sanitizeConfig(input);
  fijarVersion(value, await storeSet(NAME, JSON.stringify(value), { version, motivo }));
  cache.set({ at: Date.now(), value });
  return value;
}
