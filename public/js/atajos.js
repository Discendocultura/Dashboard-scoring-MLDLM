// Accesos rápidos de cada cliente (proyecto): enlaces que se añaden a mano (Drive, GHL, Canva, Meta…) para
// abrirlos en dos clics desde el menú lateral. Cada uno: { id, nombre, url, grupo, nota, soloAdmin }.
// Lo usan el navegador (panel) y el servidor (lib/atajos.js).
export const MAX_ATAJOS = 80;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export const urlValida = (v) => {
  const u = str(v, 1000);
  if (!/^https?:\/\//i.test(u)) return '';
  try { new URL(u); return u; } catch { return ''; }
};

// Icono y nombre del servicio según el dominio (para que se reconozcan de un vistazo).
const SERVICIOS = [
  [/drive\.google|docs\.google\.com\/drive/, '📁', 'Google Drive'],
  [/docs\.google\.com\/spreadsheets/, '📊', 'Google Sheets'],
  [/docs\.google\.com\/document/, '📄', 'Google Docs'],
  [/docs\.google\.com\/presentation/, '📽️', 'Google Slides'],
  [/docs\.google\.com\/forms|forms\.gle/, '📝', 'Google Forms'],
  [/calendar\.google/, '📅', 'Google Calendar'],
  [/mail\.google/, '✉️', 'Gmail'],
  [/gohighlevel|leadconnectorhq|msgsndr|highlevel/, '⚡', 'GoHighLevel'],
  [/business\.facebook|facebook\.com\/adsmanager|adsmanager|facebook\.com|fb\.com/, '📣', 'Meta'],
  [/instagram\.com/, '📸', 'Instagram'],
  [/canva\.com/, '🎨', 'Canva'],
  [/figma\.com/, '🖌️', 'Figma'],
  [/notion\.(so|site)/, '🗒️', 'Notion'],
  [/asana\.com/, '✅', 'Asana'],
  [/trello\.com/, '📋', 'Trello'],
  [/vimeo\.com/, '🎬', 'Vimeo'],
  [/youtube\.com|youtu\.be/, '▶️', 'YouTube'],
  [/zoom\.us/, '🎥', 'Zoom'],
  [/stripe\.com/, '💳', 'Stripe'],
  [/paypal\.com/, '💳', 'PayPal'],
  [/sendflow/, '💬', 'SendFlow'],
  [/whatsapp\.com|wa\.me/, '💬', 'WhatsApp'],
  [/dropbox\.com/, '📦', 'Dropbox'],
  [/claude\.ai/, '🤖', 'Claude'],
  [/chatgpt\.com|openai\.com/, '🤖', 'ChatGPT'],
  [/slack\.com/, '💼', 'Slack'],
  [/cloudflare\.com/, '☁️', 'Cloudflare'],
];
export function servicioDe(url) {
  const u = String(url || '').toLowerCase();
  const s = SERVICIOS.find(([re]) => re.test(u));
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* sin URL */ }
  return { icono: s?.[1] || '🔗', servicio: s?.[2] || host };
}

export function sanitizeAtajos(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_ATAJOS).map((a, i) => {
    let id = str(a?.id, 16);
    if (!/^[a-z0-9]{1,16}$/i.test(id) || vistos.has(id)) id = `a${Date.now().toString(36)}${i}`;
    vistos.add(id);
    const url = urlValida(a?.url);
    return { id, nombre: str(a?.nombre, 60) || servicioDe(url).servicio, url, grupo: str(a?.grupo, 40), nota: str(a?.nota, 140), soloAdmin: Boolean(a?.soloAdmin) };
  }).filter((a) => a.url);
}

// Por grupos, en el orden en que aparecen: [{ grupo, enlaces }]. Los sin grupo van primero.
export function agruparAtajos(lista) {
  const orden = [];
  const m = new Map();
  for (const a of lista) {
    const g = a.grupo || '';
    if (!m.has(g)) { m.set(g, []); orden.push(g); }
    m.get(g).push(a);
  }
  orden.sort((a, b) => (a !== '') - (b !== '')); // estable: el resto, en su orden
  return orden.map((g) => ({ grupo: g, enlaces: m.get(g) }));
}

// Búsqueda sin tildes ni mayúsculas en nombre, grupo, nota y dominio.
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const buscarAtajos = (lista, q) => {
  const t = norm(q).trim();
  return t ? lista.filter((a) => norm(`${a.nombre} ${a.grupo} ${a.nota} ${a.url} ${servicioDe(a.url).servicio}`).includes(t)) : lista;
};
