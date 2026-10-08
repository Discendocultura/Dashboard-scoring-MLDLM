// Votación de la página preclase (la hace el dashboard, no GHL): las respuestas de cada contacto a las
// preguntas del lanzamiento ({ p1: 'o2', p2: 'texto libre' }), que se pueden cambiar. Se guardan en JSON en
// la columna «opcion»; un voto antiguo (solo el id de una opción) cuenta como la respuesta a la pregunta p1. Con D1, en la tabla «votos» (sin choques aunque voten muchas a la vez); sin D1,
// en un dato JSON por lanzamiento.
import { db, esquema, leerJSON, guardarJSON, reintentando } from './store.js';
import { clienteActual } from './cliente.js';

const clave = (code) => `lsd_votos_${code}`;

// Respuestas guardadas → objeto { pregunta → respuesta }.
export function leerRespuestas(v) {
  if (v && typeof v === 'object') return v;
  const t = String(v ?? '');
  if (t.startsWith('{')) { try { const o = JSON.parse(t); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
  return t ? { p1: t } : {};
}

export async function votar(code, contacto, respuestas) {
  const opcion = JSON.stringify(respuestas);
  const d = db();
  if (d) {
    await esquema(d);
    await d.prepare('INSERT INTO votos (cliente, lanzamiento, contacto, opcion, en) VALUES (?, ?, ?, ?, ?) ON CONFLICT (cliente, lanzamiento, contacto) DO UPDATE SET opcion = excluded.opcion, en = excluded.en')
      .bind(clienteActual().id, code, contacto, opcion, new Date().toISOString()).run();
    return;
  }
  await reintentando(async () => {
    const v = await leerJSON(clave(code), () => ({}));
    v[contacto] = respuestas;
    await guardarJSON(clave(code), v, { motivo: 'Voto' });
  });
}

// { contacto → { pregunta → respuesta } } de un lanzamiento.
export async function votosDe(code) {
  const d = db();
  if (d) {
    await esquema(d);
    const { results } = await d.prepare('SELECT contacto, opcion FROM votos WHERE cliente = ? AND lanzamiento = ?').bind(clienteActual().id, code).all();
    return Object.fromEntries((results || []).map((r) => [r.contacto, leerRespuestas(r.opcion)]));
  }
  const v = (await leerJSON(clave(code), () => ({}))) || {};
  return Object.fromEntries(Object.entries(v).map(([c, r]) => [c, leerRespuestas(r)]));
}

export async function votoDe(code, contacto) {
  if (!contacto) return {};
  const d = db();
  if (d) {
    await esquema(d);
    return leerRespuestas(await d.prepare('SELECT opcion FROM votos WHERE cliente = ? AND lanzamiento = ? AND contacto = ?').bind(clienteActual().id, code, contacto).first('opcion'));
  }
  return (await votosDe(code))[contacto] || {};
}

// Resultados: { total (contactos que respondieron), preguntas: { p1: { tipo, total, opciones: [{ id, texto, n, pct }] } } }.
// De las preguntas libres solo se cuenta cuántas respondieron (los textos no se enseñan a las demás).
export function resultadosVotos(votos, preguntas) {
  const lista = Object.values(votos);
  const out = { total: lista.filter((r) => Object.keys(r || {}).length).length, preguntas: {} };
  for (const q of preguntas) {
    const resp = lista.map((r) => r?.[q.id]).filter((x) => x != null && x !== '');
    if (q.tipo === 'libre') { out.preguntas[q.id] = { tipo: 'libre', total: resp.length, opciones: [] }; continue; }
    const cuenta = {};
    for (const o of resp) cuenta[o] = (cuenta[o] || 0) + 1;
    const total = q.opciones.reduce((t, o) => t + (cuenta[o.id] || 0), 0);
    out.preguntas[q.id] = { tipo: 'opciones', total, opciones: q.opciones.map((o) => ({ id: o.id, texto: o.texto, n: cuenta[o.id] || 0, pct: total ? (cuenta[o.id] || 0) / total : 0 })) };
  }
  return out;
}
