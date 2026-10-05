// La configuración (lanzamientos y plantillas de WhatsApp) se guarda en un "Custom Value"
// de la subcuenta de GHL. Así no necesitamos base de datos y admin y setter ven lo mismo.
import { getCustomValue, saveCustomValue } from './ghl.js';
import { DEFAULT_TEMPLATES, LAUNCH_CODE_RE } from '../public/js/scoring.js';
import { PHASES, LINK_KEYS, LOCAL_DT_RE } from '../public/js/page.js';

const NAME = 'lead_scoring_dashboard_config';
let cache = null;

const URL_FIELDS = [
  'replayUrl', 'raicesUrl', 'ventaUrl', 'llamadaUrl', 'zoomJoinUrl',
  // Página de recursos
  'loginUrl', 'recursosUrl', 'vipUrl', 'whatsappUrl', 'clase1Url', 'clase2Url', 'replayVideoUrl', 'calendarioUrl', 'encuestaUrl',
];

export function emptyConfig() {
  return { launches: {}, templates: { ...DEFAULT_TEMPLATES }, defaultCountryCode: '34', digestEmail: '' };
}

export async function getConfig({ fresh = false } = {}) {
  if (!fresh && cache && cache.at > Date.now() - 30_000) return cache.value;
  const cv = await getCustomValue(NAME);
  let value = emptyConfig();
  if (cv?.value) {
    try {
      const parsed = JSON.parse(cv.value);
      value = { ...value, ...parsed, templates: { ...DEFAULT_TEMPLATES, ...(parsed.templates || {}) } };
    } catch {
      console.error('Config de GHL corrupta, se usa la vacía');
    }
  }
  cache = { at: Date.now(), value };
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
const RESERVED_LINKS = ['vip', 'whatsapp', 'directo', 'grabacion', 'venta', 'pago', 'llamada', 'recursos', 'login', 'calendario', 'calendario-ics', 'encuesta'];
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

const isoDay = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '').trim()) ? String(v).trim() : '');

export function sanitizeConfig(input) {
  const out = emptyConfig();
  out.defaultCountryCode = str(input?.defaultCountryCode, 4).replace(/\D/g, '') || '34';
  const digest = str(input?.digestEmail, 120).toLowerCase();
  out.digestEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(digest) ? digest : '';
  for (const k of Object.keys(out.templates)) {
    if (input?.templates?.[k] != null) out.templates[k] = str(input.templates[k], 1500);
  }
  for (const [code, l] of Object.entries(input?.launches || {})) {
    if (!LAUNCH_CODE_RE.test(code)) throw Object.assign(new Error(`Código de lanzamiento no válido: ${code}`), { status: 400, publicMessage: `Código de lanzamiento no válido: "${code}" (usa minúsculas, números y guiones)` });
    const launch = {
      name: str(l.name, 80) || code,
      registroTag: str(l.registroTag, 120).toLowerCase(),
      vipTag: str(l.vipTag, 120).toLowerCase(),
      compraTag: str(l.compraTag, 120).toLowerCase(),
      encuestaTag: str(l.encuestaTag, 120).toLowerCase(),
      compraDateField: str(l.compraDateField, 40).replace(/[^A-Za-z0-9]/g, ''),
      inicioCaptacion: isoDay(l.inicioCaptacion),
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
      precioPrograma: money(l.precioPrograma),
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
  cache = { at: Date.now(), value };
  return value;
}
