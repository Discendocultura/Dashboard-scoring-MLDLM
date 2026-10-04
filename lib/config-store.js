// La configuración (lanzamientos y plantillas de WhatsApp) se guarda en un "Custom Value"
// de la subcuenta de GHL. Así no necesitamos base de datos y admin y setter ven lo mismo.
import { getCustomValue, saveCustomValue } from './ghl.js';
import { DEFAULT_TEMPLATES, LAUNCH_CODE_RE } from '../public/js/scoring.js';

const NAME = 'lead_scoring_dashboard_config';
let cache = null;

const URL_FIELDS = ['replayUrl', 'raicesUrl', 'ventaUrl', 'llamadaUrl', 'zoomJoinUrl'];

export function emptyConfig() {
  return { launches: {}, templates: { ...DEFAULT_TEMPLATES }, defaultCountryCode: '34' };
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

export function sanitizeConfig(input) {
  const out = emptyConfig();
  out.defaultCountryCode = str(input?.defaultCountryCode, 4).replace(/\D/g, '') || '34';
  for (const k of Object.keys(out.templates)) {
    if (input?.templates?.[k] != null) out.templates[k] = str(input.templates[k], 1500);
  }
  for (const [code, l] of Object.entries(input?.launches || {})) {
    if (!LAUNCH_CODE_RE.test(code)) throw Object.assign(new Error(`Código de lanzamiento no válido: ${code}`), { status: 400, publicMessage: `Código de lanzamiento no válido: "${code}" (usa minúsculas, números y guiones)` });
    const launch = {
      name: str(l.name, 80) || code,
      registroTag: str(l.registroTag, 120).toLowerCase(),
      vipTag: str(l.vipTag, 120).toLowerCase(),
      zoomMeetingId: str(l.zoomMeetingId, 20).replace(/\D/g, ''),
      createdAt: l.createdAt || new Date().toISOString(),
    };
    for (const f of URL_FIELDS) {
      const v = str(l[f], 600);
      launch[f] = /^https?:\/\//i.test(v) ? v : '';
    }
    out.launches[code] = launch;
  }
  return out;
}

export async function saveConfig(input) {
  const value = sanitizeConfig(input);
  await saveCustomValue(NAME, JSON.stringify(value));
  cache = { at: Date.now(), value };
  return value;
}
