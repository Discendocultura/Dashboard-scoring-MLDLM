// Diagnóstico público: indica qué variables de entorno están configuradas (nunca sus valores).
import { env } from '../lib/env.js';
import { json } from '../lib/http.js';

const VARS = ['GHL_TOKEN', 'GHL_LOCATION_ID', 'ADMIN_PASSWORD', 'SETTER_PASSWORD', 'SESSION_SECRET', 'ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'];

export function GET() {
  const vars = Object.fromEntries(VARS.map((k) => [k, Boolean((env[k] || '').trim())]));
  const sessionOk = (env.SESSION_SECRET || '').trim().length >= 16;
  return json({ ok: VARS.every((k) => vars[k]) && sessionOk, vars, sessionSecretLongEnough: sessionOk });
}
