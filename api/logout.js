import { clearCookie } from '../lib/auth.js';
import { json } from '../lib/http.js';

export function POST() {
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}
