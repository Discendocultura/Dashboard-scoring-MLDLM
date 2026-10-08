// Votación de la página preclase (la hace el dashboard, no GHL): un voto por contacto y lanzamiento,
// que se puede cambiar. Con D1, en la tabla «votos» (sin choques aunque voten muchas a la vez); sin D1,
// en un dato JSON por lanzamiento.
import { db, esquema, leerJSON, guardarJSON, reintentando } from './store.js';
import { clienteActual } from './cliente.js';

const clave = (code) => `lsd_votos_${code}`;

export async function votar(code, contacto, opcion) {
  const d = db();
  if (d) {
    await esquema(d);
    await d.prepare('INSERT INTO votos (cliente, lanzamiento, contacto, opcion, en) VALUES (?, ?, ?, ?, ?) ON CONFLICT (cliente, lanzamiento, contacto) DO UPDATE SET opcion = excluded.opcion, en = excluded.en')
      .bind(clienteActual().id, code, contacto, opcion, new Date().toISOString()).run();
    return;
  }
  await reintentando(async () => {
    const v = await leerJSON(clave(code), () => ({}));
    v[contacto] = opcion;
    await guardarJSON(clave(code), v, { motivo: 'Voto' });
  });
}

// { contacto → opción } de un lanzamiento.
export async function votosDe(code) {
  const d = db();
  if (d) {
    await esquema(d);
    const { results } = await d.prepare('SELECT contacto, opcion FROM votos WHERE cliente = ? AND lanzamiento = ?').bind(clienteActual().id, code).all();
    return Object.fromEntries((results || []).map((r) => [r.contacto, r.opcion]));
  }
  return (await leerJSON(clave(code), () => ({}))) || {};
}

export async function votoDe(code, contacto) {
  if (!contacto) return '';
  const d = db();
  if (d) {
    await esquema(d);
    return (await d.prepare('SELECT opcion FROM votos WHERE cliente = ? AND lanzamiento = ? AND contacto = ?').bind(clienteActual().id, code, contacto).first('opcion')) || '';
  }
  return (await votosDe(code))[contacto] || '';
}

// Resultados: { total, opciones: [{ id, texto, n, pct }] } en el orden de la pregunta.
export function resultadosVotos(votos, opciones) {
  const cuenta = {};
  for (const o of Object.values(votos)) cuenta[o] = (cuenta[o] || 0) + 1;
  const validas = opciones.filter((o) => o.id);
  const total = validas.reduce((t, o) => t + (cuenta[o.id] || 0), 0);
  return { total, opciones: validas.map((o) => ({ id: o.id, texto: o.texto, n: cuenta[o.id] || 0, pct: total ? (cuenta[o.id] || 0) / total : 0 })) };
}
