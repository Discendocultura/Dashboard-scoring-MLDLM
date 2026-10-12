// Titular y subtitular de la página de venta según lo que la lead contestó en la encuesta.
// Cada variante mira una pregunta y unas respuestas: la primera que encaja (de arriba abajo) es la que ve.
// Sin encuesta, sin coincidencia o sin saber quién es: el titular general.
// Lo usan /api/page (página de venta) y Configuración → Embudo → Página de venta (editor y resultados).
import { respuestasDe } from './metrics.js';

export const MAX_VARIANTES = 12;
const str = (v, n) => String(v ?? '').trim().slice(0, n);

export function sanitizeTitulares(t) {
  if (!t || typeof t !== 'object') return { activo: false, general: { titular: '', subtitular: '' }, variantes: [] };
  const variantes = (Array.isArray(t.variantes) ? t.variantes : []).slice(0, MAX_VARIANTES).map((v, i) => ({
    id: /^[a-z0-9]{1,12}$/.test(v?.id || '') ? v.id : `v${i + 1}`,
    pregunta: str(v?.pregunta, 60),
    respuestas: [...new Set((Array.isArray(v?.respuestas) ? v.respuestas : []).map((r) => str(r, 200)).filter(Boolean))].slice(0, 30),
    titular: str(v?.titular, 300),
    subtitular: str(v?.subtitular, 600),
  })).filter((v) => v.pregunta && v.respuestas.length && (v.titular || v.subtitular));
  return { activo: Boolean(t.activo), general: { titular: str(t.general?.titular, 300), subtitular: str(t.general?.subtitular, 600) }, variantes };
}

// Variante que le toca a una lead (o null = la general). `lead`: { cf: { idCampo: valor } }.
export function varianteDe(titulares, lead, preguntas = []) {
  if (!titulares?.activo || !lead) return null;
  for (const v of titulares.variantes || []) {
    const p = preguntas.find((x) => x.id === v.pregunta) || { id: v.pregunta, tipo: 'opciones' };
    const suyas = respuestasDe(lead, p).map((r) => r.toLowerCase());
    if (v.respuestas.some((r) => suyas.includes(r.toLowerCase()))) return v;
  }
  return null;
}

// Textos que pinta la página: los de la variante y, lo que esta deje vacío, los generales.
// Solo lleva las claves con texto: si no hay nada, la página se queda con lo que ya tiene escrito.
export function textosTitular(titulares, variante) {
  const g = titulares?.general || {};
  const out = {};
  const titular = variante?.titular || g.titular;
  const subtitular = variante?.subtitular || g.subtitular;
  if (titular) out.titular = titular;
  if (subtitular) out.subtitular = subtitular;
  return out;
}

// Preguntas que sirven para elegir titular: las de opciones y la edad (las de texto libre, no).
export const preguntasParaTitular = (preguntas = []) => preguntas.filter((p) => p.tipo !== 'texto');

// Resultados por variante con las leads del lanzamiento: cuántas son, cuántas visitaron la página de venta
// y cuántas compraron (para ver qué titular convierte mejor). La última fila es la general.
export function resultadosTitulares(titulares, leads, preguntas = []) {
  const filas = [...(titulares?.variantes || []).map((v) => ({ id: v.id, v, leads: 0, visitas: 0, compras: 0 })), { id: 'general', v: null, leads: 0, visitas: 0, compras: 0 }];
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const l of leads || []) {
    const f = porId.get(varianteDe({ ...titulares, activo: true }, l, preguntas)?.id || 'general');
    f.leads++;
    if (l.s?.venta_visita) { f.visitas++; if (l.s?.compra) f.compras++; }
  }
  return filas;
}
