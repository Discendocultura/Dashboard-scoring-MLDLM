import { clearCookie, clearVerComo } from '../lib/auth.js';

// Sale de la cuenta (y de «Ver como», si estaba mirando como otra persona).
export function POST() {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  headers.append('set-cookie', clearCookie());
  headers.append('set-cookie', clearVerComo());
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
