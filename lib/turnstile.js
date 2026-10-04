// Cloudflare Turnstile (gratis): comprueba que quien se registra no es un bot.
// Variables: TURNSTILE_SITE_KEY (pública) y TURNSTILE_SECRET. Sin ellas, no se exige.
import { env } from './env.js';

export const turnstileSiteKey = () => (env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET ? env.TURNSTILE_SITE_KEY : '');

export async function verifyTurnstile(token, ip) {
  if (!turnstileSiteKey()) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(token) });
  if (ip) body.set('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    return Boolean((await res.json()).success);
  } catch (e) {
    console.error(e);
    return true; // si Cloudflare no responde, no dejamos fuera a una lead de verdad
  }
}
