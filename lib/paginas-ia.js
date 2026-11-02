// «✨ Crear con Claude» (Crear → Páginas): manda a Claude el prompt de la página (el mismo de «Copiar el prompt», con la
// marca, el avatar, la narrativa, los datos y los códigos de AlquimIA), recoge el HTML y lo revisa antes de dártelo
// (public/js/revisar-codigos.js). Usa la clave de Claude del cliente o la de la agencia (ANTHROPIC_API_KEY).
// Biblioteca de bloques: lo que ya funciona (una barra, un BAR, un selector de grabaciones…) se guarda para usarlo
// en otro lanzamiento o cliente. Hay la del cliente y, para el equipo de la agencia, la de la agencia (común).
import { env } from './env.js';
import { claveClaude, claudeConfigurado, MODELO, errorClaude } from './directo-ia.js';
import { enPrincipal } from './cliente.js';
import { leerJSON, guardarJSON, reintentando } from './store.js';
import { newId } from './users.js';
import { revisarHtmlPagina, htmlDeRespuesta } from '../public/js/revisar-codigos.js';

export const MAX_PROMPT = 150_000;
const SISTEMA = 'Eres diseñadora web y copywriter de embudos de venta. Devuelves UNA página completa en un solo bloque ```html … ``` listo para pegar en un elemento «Código personalizado» de GoHighLevel: HTML, CSS y JS en línea, sin dependencias de pago, responsive y accesible. Los códigos de AlquimIA que te dan van tal cual (no los cambies ni los quites). Antes del bloque, como mucho dos frases.';

// HTML de prueba (sin clave, con GHL_MOCK): falta un código y hay un botón de WhatsApp sin enlace, para ver la revisión.
function respuestaDePrueba(codigos) {
  const primero = codigos[0]?.[1] || '';
  return `Aquí tienes la página.\n\`\`\`html\n<section style="padding:40px;font-family:sans-serif"><h1>Página de prueba</h1>\n${primero}\n<a class="btn-whatsapp" href="#">Escríbenos por WhatsApp</a></section>\n\`\`\``;
}

export async function crearPaginaConClaude({ prompt, codigos = [] }) {
  const texto = String(prompt || '');
  if (texto.length < 50) throw Object.assign(new Error('Prompt vacío'), { status: 400, publicMessage: 'Falta el prompt de la página.' });
  if (texto.length > MAX_PROMPT) throw Object.assign(new Error('Prompt largo'), { status: 400, publicMessage: 'El prompt es demasiado largo: acorta las indicaciones.' });
  let respuesta;
  let modelo = MODELO;
  if (!claveClaude() && env.GHL_MOCK === '1') respuesta = respuestaDePrueba(codigos);
  else {
    if (!claudeConfigurado()) throw Object.assign(new Error('Sin clave'), { status: 400, publicMessage: 'Falta la clave de Claude: añade ANTHROPIC_API_KEY (tipo Secret) en Cloudflare y vuelve a desplegar.' });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': claveClaude(), 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO, max_tokens: 32000, fallbacks: 'default', output_config: { effort: 'medium' }, system: SISTEMA, messages: [{ role: 'user', content: texto }] }),
    });
    if (!res.ok) throw errorClaude(res.status, await res.text().catch(() => ''));
    const data = await res.json();
    if (data.stop_reason === 'refusal') throw Object.assign(new Error('Claude: refusal'), { status: 502, publicMessage: 'Claude no ha querido hacer esta página. Revisa las indicaciones.' });
    if (data.stop_reason === 'max_tokens') throw Object.assign(new Error('Claude: max_tokens'), { status: 502, publicMessage: 'La página era demasiado larga y se ha cortado. Pide una versión más corta en las indicaciones.' });
    respuesta = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    modelo = data.model || MODELO;
  }
  const html = htmlDeRespuesta(respuesta);
  if (!/<[a-z]/i.test(html)) throw Object.assign(new Error('Sin HTML'), { status: 502, publicMessage: 'Claude no ha devuelto el código de la página. Prueba otra vez.' });
  return { ...revisarHtmlPagina(html, codigos), modelo };
}

// ---- Biblioteca de bloques ----
const CLAVE = 'lsd_bloques';
const MAX_BLOQUES = 80;
const MAX_HTML = 120_000;
// La de la agencia va en el cliente principal con otra clave (si no, en el principal serían la misma lista).
const clave = (agencia) => (agencia ? `${CLAVE}_agencia` : CLAVE);
const leerDe = (agencia) => leerJSON(clave(agencia), () => []).then((l) => (Array.isArray(l) ? l : []));
const enAmbito = (agencia, fn) => (agencia ? enPrincipal(fn) : fn());
export const listarBloques = (agencia = false) => enAmbito(agencia, () => leerDe(agencia));
export function limpiarBloque(b) {
  const nombre = String(b?.nombre || '').trim().slice(0, 80);
  const html = String(b?.html || '').slice(0, MAX_HTML);
  if (!nombre || !html.trim()) throw Object.assign(new Error('Bloque vacío'), { status: 400, publicMessage: 'El bloque necesita un nombre y su código.' });
  return { nombre, html, pagina: String(b?.pagina || '').slice(0, 40), notas: String(b?.notas || '').trim().slice(0, 500) };
}
export async function guardarBloque(b, { agencia = false, por = '' } = {}) {
  const limpio = limpiarBloque(b);
  return enAmbito(agencia, () => reintentando(async () => {
    const lista = await leerDe(agencia);
    const nuevo = { id: newId('b'), ...limpio, por, en: new Date().toISOString() };
    const out = [nuevo, ...lista].slice(0, MAX_BLOQUES);
    await guardarJSON(clave(agencia), out, { motivo: `Bloque «${limpio.nombre}»` });
    return nuevo;
  }));
}
export async function borrarBloque(id, { agencia = false } = {}) {
  return enAmbito(agencia, () => reintentando(async () => {
    const lista = await leerDe(agencia);
    await guardarJSON(clave(agencia), lista.filter((x) => x.id !== id), { motivo: 'Bloque borrado' });
    return true;
  }));
}
