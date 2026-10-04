// Puente al directo: /directo?l=<lanzamiento>&cid=<id de contacto>  (o &email=...)
// 1) Marca en GHL que el lead ha pulsado el enlace (`<l>_directo_click`).
// 2) Lo inscribe en la reunión de Zoom con su email y le redirige a su enlace personal,
//    para que después el informe de Zoom diga quién asistió y cuánto tiempo.
// Si llega sin identificar (p. ej. desde el grupo de WhatsApp) se le pide el email.
import { addTags, getContact, findContactByEmail } from '../lib/ghl.js';
import { getConfig } from '../lib/config-store.js';
import { addRegistrant, zoomConfigured } from '../lib/zoom.js';
import { html, escapeHtml, isEmail } from '../lib/http.js';
import { tagFor } from '../public/js/scoring.js';

const page = (title, body) => html(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f3ef;color:#2b2522}
  main{max-width:420px;width:calc(100% - 32px);background:#fff;padding:28px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
  h1{font-size:1.35rem;margin:0 0 8px} p{line-height:1.5;color:#5a514c}
  input,button{width:100%;box-sizing:border-box;font:inherit;padding:14px;border-radius:10px;margin-top:10px}
  input{border:1px solid #d8d0c9} button{border:0;background:#b4552d;color:#fff;font-weight:600;cursor:pointer}
  .err{color:#b3261e}
</style></head><body><main>${body}</main></body></html>`);

function emailForm(launchCode, error = '') {
  return page('Accede al directo', `
    <h1>Accede a la clase en directo</h1>
    <p>Escribe el email con el que te registraste y te llevamos a la sala.</p>
    ${error ? `<p class="err">${escapeHtml(error)}</p>` : ''}
    <form method="get">
      <input type="hidden" name="l" value="${escapeHtml(launchCode)}">
      <input type="email" name="email" required placeholder="tu@email.com" autocomplete="email">
      <button type="submit">Entrar al directo</button>
    </form>`);
}

// Recordamos quién es en este navegador (cookie solo de /directo) para que, si vuelve a entrar
// desde el grupo de WhatsApp o tras cortarse la conexión, no tenga que escribir el email otra vez.
const WHO_COOKIE = 'lsd_who';
const WHO_MAX_AGE = 90 * 24 * 3600;

function rememberedWho(request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)lsd_who=([^;]+)/);
  if (!m) return {};
  const v = decodeURIComponent(m[1]);
  if (/^cid:[A-Za-z0-9]{6,40}$/.test(v)) return { cid: v.slice(4) };
  if (/^email:/.test(v) && isEmail(v.slice(6))) return { email: v.slice(6) };
  return {};
}

const isCid = (v) => /^[A-Za-z0-9]{6,40}$/.test(v);

export async function GET(request, ctx) {
  const url = new URL(request.url);
  const code = url.searchParams.get('l') || '';
  let cid = url.searchParams.get('cid') || '';
  let emailParam = (url.searchParams.get('email') || '').trim().toLowerCase();
  if (!isCid(cid)) cid = '';
  if (!cid && !emailParam) ({ cid = '', email: emailParam = '' } = rememberedWho(request));

  if (emailParam && !isEmail(emailParam)) return emailForm(code, 'Ese email no parece correcto.');

  // Configuración y contacto en paralelo para que la redirección sea lo más rápida posible.
  let launch;
  let contact = null;
  try {
    const [config, byId] = await Promise.all([
      getConfig(),
      cid ? getContact(cid).catch((e) => { console.error(e); return null; }) : null,
    ]);
    launch = config.launches[code];
    contact = byId;
  } catch (e) {
    console.error(e);
  }
  if (!launch) return page('Enlace no válido', '<h1>Enlace no válido</h1><p>Revisa el enlace que te hemos enviado.</p>');
  const fallback = launch.zoomJoinUrl;

  if (!cid && !emailParam) return emailForm(code);

  let joinUrl = '';
  try {
    if (!contact && emailParam) contact = await findContactByEmail(emailParam);
    if (contact) {
      // La etiqueta se guarda después de redirigir: la lead no espera por ella.
      const tagging = addTags(contact.id, [tagFor(code, 'directo_click')]).catch((e) => console.error(e));
      if (ctx?.waitUntil) ctx.waitUntil(tagging);
    }

    const email = contact?.email || emailParam;
    if (email && launch.zoomMeetingId && zoomConfigured()) {
      const [firstName, ...rest] = (contact?.name || '').split(' ');
      joinUrl = await addRegistrant(launch.zoomMeetingId, { email, firstName, lastName: rest.join(' ') });
    }
  } catch (e) {
    console.error(e); // nunca dejamos a nadie fuera del directo: usamos el enlace genérico
  }

  const target = joinUrl || fallback;
  if (!target) return page('Directo', '<h1>El enlace del directo aún no está disponible</h1><p>Vuelve a intentarlo un poco más tarde.</p>');
  const headers = new Headers({ location: target, 'cache-control': 'no-store' });
  const who = contact ? `cid:${contact.id}` : emailParam ? `email:${emailParam}` : '';
  if (who) headers.append('set-cookie', `${WHO_COOKIE}=${encodeURIComponent(who)}; Path=/directo; Max-Age=${WHO_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}
