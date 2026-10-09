// La configuración (lanzamientos y plantillas de WhatsApp) se guarda en un "Custom Value"
// de la subcuenta de GHL. Así no necesitamos base de datos y admin y setter ven lo mismo.
import { storeGet, storeSet, fijarVersion } from './store.js';
import { clienteActual } from './cliente.js';
import { pestanaIds, subtipoValido, SECCIONES_VALIDAS } from '../public/js/embudos-def.js';
import { cachePorCliente } from './cliente.js';
import { DEFAULT_TEMPLATES, NEUTRAL_TEMPLATES, LAUNCH_CODE_RE } from '../public/js/scoring.js';
import { ENCUESTA_PREGUNTAS, actualizarEncuesta } from '../public/js/encuesta.js';
import { PHASE_IDS, LINK_KEYS, LOCAL_DT_RE, sanitizeReplayBarra, sanitizeVentaBarra, sanitizePaginaPago, numeroWhatsApp, enlaceWhatsApp, leerEnlaceWhatsApp } from '../public/js/page.js';
import { formatoValido, nVideos } from '../public/js/videos.js';
import { sanitizeCarritoNotas, sanitizeCarritoEnvios, diasCarritoValido, cierrePorDias } from '../public/js/carrito.js';
import { sanitizePago, dinero } from '../public/js/pago.js';
import { sanitizeOferta, IDS_BONUS_METEO } from '../public/js/oferta.js';
import { sanitizePesos } from '../public/js/pesos.js';
import { sanitizeRecursos, RECURSOS_EXTRA } from '../public/js/recursos.js';

const NAME = 'lead_scoring_dashboard_config';
const cache = cachePorCliente(); // una por cliente

const URL_FIELDS = [
  'replayUrl', 'raicesUrl', 'ventaUrl', 'ventaFraccionadoUrl', 'llamadaUrl', 'zoomJoinUrl',
  // WhatsApp para resolver dudas (botón de las páginas de venta y de replay)
  'whatsappDudasUrl',
  // Página de pago donde se elige pago único o fraccionado (botones «Quiero inscribirme»)
  'paginaPagoUrl',
  // Página de recursos
  'loginUrl', 'recursosUrl', 'vipUrl', 'whatsappUrl', 'clase1Url', 'clase2Url', 'clase3Url', 'replayVideoUrl', 'calendarioUrl', 'encuestaUrl',
  // Página de gracias (tras el registro)
  'graciasUrl', 'graciasVideoUrl',
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
// «meteorico»: ofertas flash (sus ediciones van en meteoricos[código] con `embudo` = este id).
export const TIPOS_EMBUDO = ['lanzamientos', 'vsl', 'meteorico'];
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
    vsls, embudos: embudosPorDefecto(vsls, {}), meteoricos: {},
  };
}

// Mensajes de WhatsApp de serie: los de MLDLM en el principal; neutros (con {producto}) en el resto.
const plantillasDeSerie = () => ({ ...(clienteActual().principal ? DEFAULT_TEMPLATES : NEUTRAL_TEMPLATES) });
const COLOR_RE = /^#[0-9a-f]{6}$/i;
function sanitizeMarca(m, def) {
  return {
    // Sin < > & " ': el nombre se cuela en HTML ya escapado (informes, emails, página).
    producto: str(m?.producto ?? def.producto, 40).replace(/[<>&"']/g, ''),
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

// Mapas por código sin prototipo: `config.launches['constructor']` no debe devolver nada (códigos de la URL).
function sinPrototipo(cfg) {
  for (const k of ['launches', 'vsls', 'meteoricos']) {
    if (cfg[k] && typeof cfg[k] === 'object') cfg[k] = Object.assign(Object.create(null), cfg[k]);
  }
  return cfg;
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
  // La encuesta del avatar cambió de campos en GHL: se usa el campo nuevo.
  value.encuesta = actualizarEncuesta(value.encuesta);
  sinPrototipo(value);
  // Formato de cada lanzamiento = el de su embudo (por si se guardó antes de existir los formatos).
  for (const l of Object.values(value.launches || {})) {
    const emb = value.embudos.find((e) => e.id === l.embudo);
    l.formato = emb?.formato || l.formato || 'webinar';
    l.nClases = emb?.clases || l.nClases || 2;
    l.vip = emb ? emb.vip !== false : l.vip !== false;
    l.preclase = emb ? emb.preclase !== false : l.preclase !== false;
    if (!Array.isArray(l.videos)) l.videos = [];
  }
  fijarVersion(value, cv?.version ?? null);
  cache.set({ at: Date.now(), value });
  return value;
}

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const money = dinero; // acepta «1.164», «1.164,50», «97,5»…
const localDT = (v) => (LOCAL_DT_RE.test(String(v ?? '').trim()) ? String(v).trim() : '');
const hhmm = (v) => (/^\d{2}:\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');

// Enlaces personalizados para los botones de la página: { guia: 'https://…', … }
const RESERVED_LINKS = ['vip', 'whatsapp', 'directo', 'grabacion', 'venta', 'pago', 'pago-fraccionado', 'llamada', 'recursos', 'login', 'calendario', 'calendario-ics', 'encuesta'];
function sanitizeEnlaces(e) {
  const out = {};
  for (const [k, v] of Object.entries(e || {}).slice(0, 20)) {
    const key = String(k).trim().toLowerCase();
    const url = str(v, 600);
    if (/^[a-z0-9-]{2,30}$/.test(key) && !RESERVED_LINKS.includes(key) && !key.startsWith('plan-') && /^https?:\/\//i.test(url)) out[key] = url;
  }
  return out;
}

// Textos editables de la página: { 'clase1-titulo': '…', … } → <span data-lsd-text="clase1-titulo">.
const RESERVED_TEXTS = ['nombre', 'fechadirecto', 'horadirecto', 'directo', 'clase1', 'clase2', 'clase3', 'replay', 'cierrevip', 'cierrecarrito', 'preciovip'];
// Imagen de cada etapa de la página preclase (URL de Medios de GHL): <img data-lsd-img="clase1">.
export const IMAGENES_ETAPA = ['clase1', 'clase2', 'clase3', 'test', 'descargable', 'espera'];
function sanitizeImagenes(i) {
  const out = {};
  for (const k of IMAGENES_ETAPA) {
    const v = String(i?.[k] ?? '').trim().slice(0, 600);
    if (/^https:\/\//i.test(v)) out[k] = v;
  }
  return out;
}

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
  // Variante: vsl | leadmagnet | evergreen | llamadas (mismo motor, otros textos y reglas).
  out.subtipo = subtipoValido(v.subtipo ?? base.subtipo);
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
  out.pago = sanitizePago(v.pago ?? base.pago);
  out.metaFiltro = str(v.metaFiltro ?? VSL_DEFAULT.metaFiltro, 80);
  out.emailFiltro = str(v.emailFiltro, 200);
  out.botonSegundos = Math.min(36_000, Math.max(0, Math.floor(Number(v.botonSegundos) || 0)));
  out.textoCompra = str(v.textoCompra, 60) || VSL_DEFAULT.textoCompra;
  out.textoLlamada = str(v.textoLlamada, 60) || VSL_DEFAULT.textoLlamada;
  out.accesos = sanitizeAccesos(v.accesos);
  // Informe semanal al cliente (cada lunes, la semana anterior) y cuándo se mandó el último.
  out.informeSemanal = Boolean(v.informeSemanal);
  out.informeUltimo = isoDay(v.informeUltimo);
  return out;
}

const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');

export function sanitizeConfig(input) {
  const out = emptyConfig();
  out.defaultCountryCode = str(input?.defaultCountryCode, 4).replace(/\D/g, '') || '34';
  // Pesos de la puntuación aprendidos de las ventas (null = los de serie).
  out.pesosScore = sanitizePesos(input?.pesosScore);
  const digest = str(input?.digestEmail, 120).toLowerCase();
  out.digestEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digest) ? digest : '';
  out.accesos = sanitizeAccesos(input?.accesos);
  out.marca = sanitizeMarca(input?.marca, out.marca);
  out.encuesta = actualizarEncuesta(sanitizeEncuesta(input?.encuesta) ?? out.encuesta);
  // VSLs (una por embudo de tipo VSL) y lista de embudos.
  const vslsIn = input?.vsls || (input?.vsl ? { vsl: input.vsl } : {});
  out.vsls = {};
  for (const [id, v] of Object.entries(vslsIn).slice(0, 10)) if (EMBUDO_ID_RE.test(id)) out.vsls[id] = sanitizeVsl(v, id);
  out.embudos = sanitizeEmbudos(input?.embudos, out.vsls, input?.launches);
  // Meteóricos (ofertas flash): de un embudo «⚡ Meteóricos» o downsell de un lanzamiento.
  out.meteoricos = {};
  for (const [code, m] of Object.entries(input?.meteoricos || {}).slice(0, 200)) {
    if (!LAUNCH_CODE_RE.test(code)) throw Object.assign(new Error('Código no válido'), { status: 400, publicMessage: `Código de meteórico no válido: "${code}" (usa minúsculas, números y guiones)` });
    if (out.vsls[code] || input?.launches?.[code]) throw Object.assign(new Error('Código repetido'), { status: 400, publicMessage: `El código «${code}» ya lo usa un lanzamiento o una VSL: elige otro para el meteórico.` });
    const meteo = sanitizeMeteorico(m, out.embudos, input?.launches || {});
    if (meteo) out.meteoricos[code] = meteo;
  }
  // Campos de GHL con campaña / conjunto / anuncio de los formularios instantáneos de Meta (opcional).
  const fid = (v) => String(v ?? '').trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  out.formAds = { campaign: fid(input?.formAds?.campaign), adset: fid(input?.formAds?.adset), ad: fid(input?.formAds?.ad) };
  for (const k of Object.keys(out.templates)) {
    if (input?.templates?.[k] != null) out.templates[k] = str(input.templates[k], 1500);
  }
  for (const [code, l] of Object.entries(input?.launches || {})) {
    if (!l || typeof l !== 'object') continue;
    if (code in Object.prototype) throw Object.assign(new Error(`Código reservado: ${code}`), { status: 400, publicMessage: `El código «${code}» no se puede usar: elige otro.` });
    if (input?.meteoricos?.[code]) throw Object.assign(new Error('Código repetido'), { status: 400, publicMessage: `El código «${code}» ya lo usa un meteórico: elige otro para el lanzamiento.` });
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
      clase3At: localDT(l.clase3At),
      replayAt: localDT(l.replayAt),
      cierreCarrito: localDT(l.cierreCarrito),
      barra: sanitizeBarra(l.barra),
      // Barra fija de la página de replay (cuenta atrás → página de venta).
      replayBarra: sanitizeReplayBarra(l.replayBarra),
      // Barra fija de la página de venta: tramos con su texto, su fin y su botón (o solo informativa).
      ventaBarra: sanitizeVentaBarra(l.ventaBarra),
      // Página de pago: copy de los cajetines (pago único y fraccionado) y su barra por tramos.
      paginaPago: sanitizePaginaPago(l.paginaPago),
      // Etiqueta de GHL que se pone al llegar a la página de pago (dispara el workflow de carrito abandonado).
      // Sin tocar, la de serie de MLDLM; vacía = no se pone ninguna.
      carritoAbandonadoTag: l.carritoAbandonadoTag === undefined ? (clienteActual().principal ? 'el-camino-carrito-abandonado' : '') : str(l.carritoAbandonadoTag, 100).toLowerCase(),
      // Estrategia de cada día del carrito, escrita a mano (pestaña Carrito).
      carritoNotas: sanitizeCarritoNotas(l.carritoNotas),
      // Emails y mensajes al grupo de WhatsApp de cada día del carrito (cuántos y a qué hora).
      carritoEnvios: sanitizeCarritoEnvios(l.carritoEnvios),
      // Días de carrito: cuentan desde el día siguiente al vídeo de venta (de ahí sale el cierre).
      diasCarrito: diasCarritoValido(l.diasCarrito),
      enlaces: sanitizeEnlaces(l.enlaces),
      textos: sanitizeTextos(l.textos),
      imagenes: sanitizeImagenes(l.imagenes),
      zoomMeetingId: str(l.zoomMeetingId, 20).replace(/\D/g, ''),
      precioVip: money(l.precioVip),
      // Contador de VIP de la página: empieza en este número y suma cada VIP vendida en el lanzamiento.
      vipContadorBase: l.vipContadorBase === '' || l.vipContadorBase == null ? null : Math.max(0, Math.floor(Number(l.vipContadorBase) || 0)),
      precioPrograma: money(l.precioPrograma),
      precioFraccionado: money(l.precioFraccionado),
      // Tipo de pago: único (con o sin fraccionado) o suscripción con sus planes.
      pago: sanitizePago(l.pago),
      // Oferta: entregables y bonus (BAR en directo, 24 h, 48 h o de todo el carrito).
      oferta: sanitizeOferta(l.oferta),
      inversion: money(l.inversion),
      metaFiltro: str(l.metaFiltro, 80),
      // Emails del lanzamiento: nombre de la campaña o del workflow contiene… (separados por comas).
      emailFiltro: str(l.emailFiltro, 200),
      createdAt: (/^\d{4}-\d{2}-\d{2}T/.test(String(l.createdAt || '')) && str(l.createdAt, 40)) || new Date().toISOString(),
      snapshot: sanitizeSnapshot(l.snapshot),
      // Informe al cliente: se manda solo al cerrar el carrito (una vez).
      informeEnviado: isoDay(l.informeEnviado),
    };
    for (const f of URL_FIELDS) {
      const v = str(l[f], 600);
      launch[f] = /^https?:\/\//i.test(v) ? v : '';
    }
    // Embudo de lanzamientos al que pertenece (por defecto, el primero) y su formato (cuántos vídeos).
    const lanzIds = out.embudos.filter((e) => e.tipo === 'lanzamientos').map((e) => e.id);
    launch.embudo = lanzIds.includes(l.embudo) ? l.embudo : lanzIds[0] || 'lanz';
    const emb = out.embudos.find((e) => e.id === launch.embudo);
    launch.formato = emb?.formato || 'webinar';
    // Contador de VIP sin poner: el del embudo (se elige al crearlo); si tampoco, 41 en MLDLM y 0 en el resto.
    if (launch.vipContadorBase == null) launch.vipContadorBase = emb?.vipContadorBase ?? (clienteActual().principal ? 41 : 0);
    // Prelanzamiento del embudo: cuántas clases y si hay entrada VIP.
    launch.nClases = emb?.clases || 2;
    // Pantalla de espera antes del directo (59 min antes; al llegar a cero entra sola al webinar), con vídeo opcional.
    // Sin elegir en el lanzamiento: la del embudo (se pregunta al crearlo); si tampoco, activa.
    const vEspera = str(l.espera?.video, 600);
    launch.espera = { activa: typeof l.espera?.activa === 'boolean' ? l.espera.activa : emb?.espera !== false, video: /^https?:\/\//i.test(vEspera) ? vEspera : '' };
    // Recursos de la preclase además de las clases: música, test, votación y descargable.
    launch.recursosPre = sanitizeRecursos(l.recursosPre, launch.nClases);
    launch.vip = emb?.vip !== false;
    // ¿Hay área de recursos preclase (con sus clases)? Sin ella, el lanzamiento no tiene clases.
    launch.preclase = emb?.preclase !== false;
    // Vídeos 2, 3 y 4 (el 1 usa los campos de siempre del webinar).
    launch.videos = Array.from({ length: nVideos(launch.formato) - 1 }, (_, i) => sanitizeVideo(l.videos?.[i]));
    // WhatsApp para dudas: número y mensaje (el enlace se genera con ellos). De los de antes, se saca del enlace.
    const wa = l.whatsappDudas && typeof l.whatsappDudas === 'object' ? l.whatsappDudas : leerEnlaceWhatsApp(l.whatsappDudasUrl);
    launch.whatsappDudas = { numero: numeroWhatsApp(wa.numero), mensaje: str(wa.mensaje, 500) };
    // Con el generador (número y mensaje), el enlace es siempre el generado: sin número, no hay botón.
    launch.whatsappDudasUrl = l.whatsappDudas && typeof l.whatsappDudas === 'object' ? enlaceWhatsApp(launch.whatsappDudas.numero, launch.whatsappDudas.mensaje) : launch.whatsappDudasUrl;
    // Con días de carrito, el cierre sale de ellos: el último día a las 23:59.
    if (launch.diasCarrito) launch.cierreCarrito = cierrePorDias(launch) || launch.cierreCarrito;
    out.launches[code] = launch;
  }
  // Encuesta siempre igual: si la etiqueta ya la usaba un lanzamiento anterior, hace falta su «foto».
  for (const l of Object.values(out.launches)) {
    l.encuestaCompartida = Boolean(l.encuestaTag) && Object.values(out.launches).some((o) => o !== l && o.encuestaTag === l.encuestaTag && String(o.createdAt) < String(l.createdAt));
  }
  return sinPrototipo(out);
}

// Lo que hereda un lanzamiento nuevo de la plantilla: precios, textos y barra de la página.
export function sanitizeBase(b) {
  return {
    precioVip: money(b?.precioVip), precioPrograma: money(b?.precioPrograma), precioFraccionado: money(b?.precioFraccionado), pago: sanitizePago(b?.pago), oferta: sanitizeOferta(b?.oferta),
    vipContadorBase: b?.vipContadorBase === '' || b?.vipContadorBase == null ? '' : Math.max(0, Math.floor(Number(b.vipContadorBase) || 0)),
    textos: sanitizeTextos(b?.textos), barra: sanitizeBarra(b?.barra),
  };
}

function sanitizeCalculadora(c) {
  const opt = (v, max) => (v === '' || v == null || !(dinero(v) > 0) ? '' : Math.min(max, money(v)));
  return {
    presupuesto: opt(c?.presupuesto, 10_000_000), roasObjetivo: opt(c?.roasObjetivo, 100),
    cpl: opt(c?.cpl, 10_000), convVip: opt(c?.convVip, 100), convVenta: opt(c?.convVenta, 100), ticket: opt(c?.ticket, 1_000_000),
    // Equipo de llamadas (en %): agendan, asisten, cierran; capacidad y días de carrito; costes.
    pctLlamada: opt(c?.pctLlamada, 100), pctShow: opt(c?.pctShow, 100), pctCierre: opt(c?.pctCierre, 100),
    llamadasDia: opt(c?.llamadasDia, 100), diasCarrito: opt(c?.diasCarrito, 60), diasCaptacion: opt(c?.diasCaptacion, 365),
    costePersona: opt(c?.costePersona, 1_000_000), comision: opt(c?.comision, 100), costesFijos: opt(c?.costesFijos, 10_000_000),
  };
}

// Lanzamientos anteriores a mano: [{ id, nombre, registros, inversion, vip, ventas, facturacion, ticket,
// llamadas, shows, ventasLlamada, diasCarrito }].
function sanitizeHistorico(lista) {
  const num = (v, max) => { const x = dinero(v); return x > 0 ? Math.min(max, x) : 0; };
  return lista.slice(0, 40).map((r, i) => ({
    id: /^[a-z0-9_-]{1,24}$/i.test(String(r?.id || '')) ? String(r.id) : `h${i + 1}`,
    nombre: str(r?.nombre, 80),
    registros: Math.round(num(r?.registros, 10_000_000)), inversion: num(r?.inversion, 100_000_000),
    vip: Math.round(num(r?.vip, 10_000_000)), ventas: Math.round(num(r?.ventas, 10_000_000)),
    facturacion: num(r?.facturacion, 1_000_000_000), ticket: num(r?.ticket, 1_000_000),
    llamadas: Math.round(num(r?.llamadas, 10_000_000)), shows: Math.round(num(r?.shows, 10_000_000)),
    ventasLlamada: Math.round(num(r?.ventasLlamada, 10_000_000)), diasCarrito: Math.round(num(r?.diasCarrito, 60)),
  })).filter((r) => r.nombre || r.registros);
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
      id, tipo: e.tipo, nombre: str(e.nombre, 40) || (e.tipo === 'vsl' ? vsls[id].name : e.tipo === 'meteorico' ? 'Meteóricos' : 'Lanzamientos'),
      // Lanzamientos: webinar (1 vídeo), v2, v3 o plf (4 PLCs).
      ...(e.tipo === 'lanzamientos' ? { formato: formatoValido(e.formato), clases: [1, 2, 3].includes(Number(e.clases)) ? Number(e.clases) : 2, vip: e.vip !== false, preclase: e.preclase !== false, espera: e.espera !== false, recursos: Array.isArray(e.recursos) ? [...new Set(e.recursos.filter((x) => RECURSOS_EXTRA.includes(x)))] : [], ...(e.vipContadorBase !== '' && e.vipContadorBase != null && Number.isFinite(Number(e.vipContadorBase)) ? { vipContadorBase: Math.max(0, Math.floor(Number(e.vipContadorBase))) } : {}) } : {}),
      // Base de los lanzamientos nuevos de este embudo (viene de una plantilla de agencia).
      ...(e.tipo === 'lanzamientos' && e.base && typeof e.base === 'object' ? { base: sanitizeBase(e.base) } : {}),
      // Lanzamientos anteriores metidos a mano para la calculadora (cuando no están en el dashboard).
      ...(e.tipo === 'lanzamientos' && Array.isArray(e.historico) && e.historico.length ? { historico: sanitizeHistorico(e.historico) } : {}),
      ...(pestanas?.length ? { pestanas } : {}),
      ...(Array.isArray(e.ocultas) && e.ocultas.some((x) => SECCIONES_VALIDAS.includes(x)) ? { ocultas: [...new Set(e.ocultas.filter((x) => SECCIONES_VALIDAS.includes(x)))] } : {}),
    });
  }
  // Toda VSL guardada tiene su entrada en el menú.
  for (const [id, v] of Object.entries(vsls)) if (!vistos.has(id)) out.push({ id, tipo: 'vsl', nombre: v.name });
  return out;
}

// Un meteórico: oferta, producto y precios, etiquetas de compra, tiempos (calentamiento, apertura y
// cierre en hora de España), páginas y enlaces, inversión y objetivos. Va en un embudo de meteóricos
// (`embudo`) o tras un lanzamiento (`lanzamiento`, downsell).
export function sanitizeMeteorico(m, embudos, launches) {
  if (!m || typeof m !== 'object') return null;
  const url = (v) => { const u = str(v, 600); return /^https?:\/\//i.test(u) ? u : ''; };
  const tag = (v) => str(v, 120).toLowerCase();
  const lanzamiento = launches[m.lanzamiento] ? String(m.lanzamiento) : '';
  const deMeteo = embudos.filter((e) => e.tipo === 'meteorico').map((e) => e.id);
  const embudo = deMeteo.includes(m.embudo) ? m.embudo : '';
  if (!lanzamiento && !embudo) return null; // sin embudo ni lanzamiento no se ve en ningún sitio
  return {
    name: str(m.name, 80) || 'Meteórico', embudo: lanzamiento ? '' : embudo, lanzamiento,
    producto: str(m.producto, 80), oferta: str(m.oferta, 300),
    // Entregables y bonus de la oferta (BAR 30 min, 1 h… desde que abre): se cruzan con las ventas por horas.
    paquete: sanitizeOferta(m.paquete, { tipos: IDS_BONUS_METEO }),
    precio: money(m.precio), precioFraccionado: money(m.precioFraccionado), pago: sanitizePago(m.pago),
    compraTag: tag(m.compraTag), fraccionadoTag: tag(m.fraccionadoTag),
    compraDateField: str(m.compraDateField, 40).replace(/[^A-Za-z0-9]/g, ''),
    calentamiento: isoDay(m.calentamiento), apertura: localDT(m.apertura), cierre: localDT(m.cierre),
    ofertaUrl: url(m.ofertaUrl), pagoUrl: url(m.pagoUrl), pagoFraccionadoUrl: url(m.pagoFraccionadoUrl), cerradaUrl: url(m.cerradaUrl), whatsappUrl: url(m.whatsappUrl),
    textos: {
      calentamiento: str(m.textos?.calentamiento, 160), abierta: str(m.textos?.abierta, 160), cerrada: str(m.textos?.cerrada, 160), boton: str(m.textos?.boton, 40),
    },
    inversion: money(m.inversion), metaFiltro: str(m.metaFiltro, 80), emailFiltro: str(m.emailFiltro, 200),
    objetivoVentas: Math.max(0, Math.floor(Number(m.objetivoVentas) || 0)), objetivoFacturacion: money(m.objetivoFacturacion),
    notas: str(m.notas, 2000),
    createdAt: str(m.createdAt, 40) || new Date().toISOString(),
  };
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
