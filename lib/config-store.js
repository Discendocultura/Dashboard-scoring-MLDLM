// La configuración (lanzamientos y plantillas de WhatsApp) se guarda en un "Custom Value"
// de la subcuenta de GHL. Así no necesitamos base de datos y admin y setter ven lo mismo.
import { getCustomValue, saveCustomValue } from './ghl.js';
import { cachePorCliente } from './cliente.js';
import { DEFAULT_TEMPLATES, LAUNCH_CODE_RE } from '../public/js/scoring.js';
import { PHASES, LINK_KEYS, LOCAL_DT_RE } from '../public/js/page.js';

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
const VSL_TAGS = ['registroTag', 'vioTag', 'compraTag', 'llamadaTag', 'fraccionadoTag', 'unicoTag', 'publiTag', 'organicoTag'];
const VSL_URLS = ['vslUrl', 'raicesUrl', 'ventaUrl', 'ventaFraccionadoUrl', 'llamadaUrl', 'vslVideoUrl', 'graciasVideoUrl', 'agendaVideoUrl'];

export function emptyConfig() {
  return {
    launches: {}, templates: { ...DEFAULT_TEMPLATES }, defaultCountryCode: '34', digestEmail: '', accesos: [], formAds: { campaign: '', adset: '', ad: '' },
    vsl: structuredClone(VSL_DEFAULT),
  };
}

export async function getConfig({ fresh = false } = {}) {
  const hit = cache.get();
  if (!fresh && hit && hit.at > Date.now() - 30_000) return hit.value;
  const cv = await getCustomValue(NAME);
  let value = emptyConfig();
  if (cv?.value) {
    try {
      const parsed = JSON.parse(cv.value);
      value = { ...value, ...parsed, templates: { ...DEFAULT_TEMPLATES, ...(parsed.templates || {}) }, vsl: { ...VSL_DEFAULT, ...(parsed.vsl || {}) } };
    } catch {
      console.error('Config de GHL corrupta, se usa la vacía');
    }
  }
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
  for (const p of PHASES) {
    const v = b?.[p.id];
    if (!v) continue;
    out[p.id] = {
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

export function sanitizeVsl(v) {
  const out = structuredClone(VSL_DEFAULT);
  if (!v || typeof v !== 'object') return out;
  out.name = str(v.name, 80) || VSL_DEFAULT.name;
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
  out.vsl = sanitizeVsl(input?.vsl);
  // Campos de GHL con campaña / conjunto / anuncio de los formularios instantáneos de Meta (opcional).
  const fid = (v) => String(v ?? '').trim().replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
  out.formAds = { campaign: fid(input?.formAds?.campaign), adset: fid(input?.formAds?.adset), ad: fid(input?.formAds?.ad) };
  for (const k of Object.keys(out.templates)) {
    if (input?.templates?.[k] != null) out.templates[k] = str(input.templates[k], 1500);
  }
  for (const [code, l] of Object.entries(input?.launches || {})) {
    if (code === 'vsl') throw Object.assign(new Error('Código reservado'), { status: 400, publicMessage: 'El código «vsl» está reservado para el embudo VSL: usa otro.' });
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
    out.launches[code] = launch;
  }
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

export async function saveConfig(input) {
  const value = sanitizeConfig(input);
  await saveCustomValue(NAME, JSON.stringify(value));
  cache.set({ at: Date.now(), value });
  return value;
}
