// Diagnóstico público: indica qué variables de entorno están configuradas (nunca sus valores).
import { env } from '../lib/env.js';
import { json } from '../lib/http.js';
import { usaD1 } from '../lib/store.js';
import { VERSION } from '../lib/version.js';

const VARS = ['GHL_TOKEN', 'GHL_LOCATION_ID', 'ADMIN_PASSWORD', 'SETTER_PASSWORD', 'SESSION_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'];
// Opcionales: Meta (inversión), Turnstile (anti-bots) y el resumen diario.
const OPTIONAL = ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET', 'DIGEST_KEY'];

export function GET() {
  const vars = Object.fromEntries(VARS.map((k) => [k, Boolean((env[k] || '').trim())]));
  const sessionOk = (env.SESSION_SECRET || '').trim().length >= 16;
  const optional = Object.fromEntries(OPTIONAL.map((k) => [k, Boolean((env[k] || '').trim())]));
  // baseDatosD1: si está conectada la base de datos propia (si no, todo va a los Custom Values de GHL).
  // version: la del código; commit: el que ha publicado Cloudflare Pages (si lo da).
  return json({ ok: VARS.every((k) => vars[k]) && sessionOk, version: VERSION, commit: String(env.CF_PAGES_COMMIT_SHA || '').slice(0, 7) || null, vars, optional, sessionSecretLongEnough: sessionOk, baseDatosD1: usaD1() });
}
