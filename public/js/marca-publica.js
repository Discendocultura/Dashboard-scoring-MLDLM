// /marca.html?c=<cliente>&t=<enlace>: el cliente rellena su cuestionario de marca y avatar sin cuenta,
// con el asistente paso a paso (el mismo que ve al entrar al dashboard con su acceso de cliente).
import { montarAsistente } from './marca-asistente.js';

const params = new URLSearchParams(location.search);
const t = params.get('t') || '';
const c = params.get('c') || '';
const raiz = document.querySelector('#mq-body');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));

async function llamar(body) {
  const qs = new URLSearchParams({ ...(c ? { c } : {}), ...(body ? {} : { t }) });
  const res = await fetch(`/api/marca?${qs}`, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, t }) }
    : {});
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
  return d;
}

(async () => {
  if (!t) { raiz.innerHTML = '<p class="error as-error">Falta la clave del enlace. Ábrelo tal cual te lo enviamos.</p>'; return; }
  try {
    const primero = await llamar(null);
    await montarAsistente(raiz, { llamar: async (b) => (b ? llamar(b) : primero), clienteNombre: primero.cliente, docsActivos: primero.docsActivos });
  } catch (e) {
    raiz.innerHTML = `<p class="error as-error">${esc(e.message)}</p>`;
  }
})();
