// Diagnóstico: para todos, si funciona y la versión; con sesión de admin, además qué variables de entorno están
// configuradas (nunca sus valores). Así nadie de fuera sabe qué integraciones hay (Turnstile, Meta, Telegram…).
import { env } from '../lib/env.js';
import { json } from '../lib/http.js';
import { usaD1 } from '../lib/store.js';
import { VERSION } from '../lib/version.js';
import { getSession } from '../lib/auth.js';

const VARS = ['GHL_TOKEN', 'GHL_LOCATION_ID', 'ADMIN_PASSWORD', 'SETTER_PASSWORD', 'SESSION_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'];
// Opcionales: Meta (inversión), Turnstile (anti-bots) y el resumen diario.
const OPTIONAL = ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET', 'DIGEST_KEY', 'TELEGRAM_BOT_TOKEN'];

export async function GET(request) {
  const vars = Object.fromEntries(VARS.map((k) => [k, Boolean((env[k] || '').trim())]));
  const sessionOk = (env.SESSION_SECRET || '').trim().length >= 16;
  const optional = Object.fromEntries(OPTIONAL.map((k) => [k, Boolean((env[k] || '').trim())]));
  // baseDatosD1: si está conectada la base de datos propia (si no, todo va a los Custom Values de GHL).
  // version: la del código; commit: el que ha publicado Cloudflare Pages (si lo da).
  const base = { ok: VARS.every((k) => vars[k]) && sessionOk, version: VERSION, commit: String(env.CF_PAGES_COMMIT_SHA || '').slice(0, 7) || null };
  const s = await getSession(request).catch(() => null);
  if (s?.role !== 'admin' && !s?.superadmin) return json(base);
  return json({ ...base, vars, optional, sessionSecretLongEnough: sessionOk, baseDatosD1: usaD1() });
}
