// Entrada de los alumnos leídos en Skool (el marcador «AlquimIA · Skool»): Skool corta la conexión entre su pestaña y
// la de AlquimIA (y el navegador bloquea las ventanas que no abre un clic), así que el marcador manda los datos con un
// formulario a esta dirección, en una pestaña nueva, al pulsar «Enviar a AlquimIA».
//   POST /api/skool-entrada?c=<cliente> (formulario: datos=<JSON del lector>) → guarda los datos 2 h con un código de
//        un solo uso y lleva a AlquimIA (/?c=…#membresia-entrada=<código>). Ahí, con la sesión de quien está dentro, el
//        panel los recoge (GET /api/membresia?entrada=<código>, permiso «config») y enseña la revisión antes de guardar.
// Sin sesión (el formulario llega desde Skool sin las cookies de AlquimIA): por eso el código y no los datos en la URL.
// Con límite por IP y de tamaño; solo en el cliente de la membresía (Discendo).
import { clienteActual } from '../lib/cliente.js';
import { guardarCompartida } from '../lib/store.js';
import { dentroDelLimite } from '../lib/intentos.js';
import { conMembresia } from '../public/js/membresia.js';
import { esDatosSkool } from '../public/js/skool-lector.js';

const MAX = 6_000_000;
const MAX_GUARDADO = 1_800_000; // una fila de D1 (2 MB) con margen
const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pagina = (msg, status = 400) => new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AlquimIA · Skool</title><body style="font:16px/1.5 system-ui,sans-serif;padding:32px;max-width:560px;margin:auto"><h1 style="font-size:20px">AlquimIA · Alumnos de Skool</h1><p>${escHtml(msg)}</p></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

// Si no cabe, fuera primero los textos largos de cada tarjeta y ficha (lo demás ya está en sus datos).
export function recortar(d) {
  let txt = JSON.stringify(d);
  if (txt.length <= MAX_GUARDADO) return d;
  const filas = d.filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'tarjeta.texto' && k !== 'ficha.texto')));
  let out = { ...d, filas };
  txt = JSON.stringify(out);
  if (txt.length <= MAX_GUARDADO) return out;
  out = { ...out, filas: filas.map((f) => Object.fromEntries(Object.entries(f).filter(([k], i) => !k.startsWith('ficha.') || i < 80))) };
  return JSON.stringify(out).length <= MAX_GUARDADO ? out : null;
}

export async function POST(request) {
  try {
    const c = clienteActual();
    if (!conMembresia(c.id)) return pagina('La membresía de Skool es de Discendo: el marcador tiene que ser el de Discendo.', 403);
    if (!(await dentroDelLimite(request, 'skool-entrada', 30))) return pagina('Demasiados envíos seguidos: espera unos minutos y vuelve a probar.', 429);
    if (Number(request.headers.get('content-length') || 0) > MAX) return pagina('Son demasiados datos para un envío.', 413);
    const form = await request.formData();
    const txt = String(form.get('datos') || '');
    if (!txt || txt.length > MAX) return pagina('No han llegado los datos de Skool.');
    let d = null;
    try { d = JSON.parse(txt); } catch { /* no es JSON */ }
    if (!esDatosSkool(d)) return pagina('Esos no son datos del marcador de Skool.');
    const guardar = recortar(d);
    if (!guardar) return pagina('Son demasiados datos para un envío: usa «Copiar» en Skool y «Pegar datos» en AlquimIA.', 413);
    const id = crypto.randomUUID().replace(/-/g, '');
    await guardarCompartida(`skool-entrada|${id}`, { at: Date.now(), datos: guardar });
    const destino = `/${c.principal ? '' : `?c=${encodeURIComponent(c.id)}`}#membresia-entrada=${id}`;
    return new Response(null, { status: 303, headers: { location: destino, 'cache-control': 'no-store' } });
  } catch (e) {
    console.error('Skool entrada', e);
    return pagina('No se han podido recibir los datos. Vuelve a probar o usa «Copiar» en Skool y «Pegar datos» en AlquimIA.', 500);
  }
}
