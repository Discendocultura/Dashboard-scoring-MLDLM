// Comentarios de la preclase: debajo de cada clase, las leads responden a las preguntas de la clase y lo ven
// todas (muro). Se publican al momento; el equipo puede ocultarlos, destacarlos y contestarlos desde el
// dashboard. Con D1, en la tabla «comentarios» (sin choques aunque escriban muchas a la vez); sin D1, en un
// dato JSON por lanzamiento.
//   { id, clase, pregunta, contacto, nombre, texto, en, oculto, destacado, respuesta, respuestaEn }
import { db, esquema, leerJSON, guardarJSON, reintentando } from './store.js';
import { clienteActual } from './cliente.js';
import { newId } from './users.js';

const clave = (code) => `lsd_comentarios_${code}`;
const MAX_JSON = 3000;
export const MAX_TEXTO = 1500;
export const MAX_POR_CLASE = 15; // comentarios de una misma lead en una clase (para frenar abusos)

const deFila = (r) => ({
  id: r.id, clase: r.clase, pregunta: r.pregunta, contacto: r.contacto, nombre: r.nombre, texto: r.texto, en: r.en,
  oculto: Boolean(r.oculto), destacado: Boolean(r.destacado), respuesta: r.respuesta || '', respuestaEn: r.respuesta_en || r.respuestaEn || '',
});

// Todos los comentarios de un lanzamiento (también los ocultos), del más nuevo al más antiguo.
export async function comentariosDe(code) {
  const d = db();
  if (d) {
    await esquema(d);
    const { results } = await d.prepare('SELECT * FROM comentarios WHERE cliente = ? AND lanzamiento = ? ORDER BY en DESC LIMIT 5000').bind(clienteActual().id, code).all();
    return (results || []).map(deFila);
  }
  const lista = (await leerJSON(clave(code), () => [])) || [];
  return (Array.isArray(lista) ? lista : []).map(deFila).sort((a, b) => b.en.localeCompare(a.en));
}

// Nuevo comentario. Devuelve el comentario guardado.
export async function comentar(code, { clase, pregunta, contacto, nombre, texto }) {
  const c = { id: newId('k'), clase, pregunta, contacto, nombre: String(nombre || '').slice(0, 40), texto: String(texto).slice(0, MAX_TEXTO), en: new Date().toISOString(), oculto: false, destacado: false, respuesta: '', respuestaEn: '' };
  const d = db();
  if (d) {
    await esquema(d);
    const n = await d.prepare('SELECT COUNT(*) AS n FROM comentarios WHERE cliente = ? AND lanzamiento = ? AND contacto = ? AND clase = ?').bind(clienteActual().id, code, contacto, clase).first('n');
    if (n >= MAX_POR_CLASE) throw limite();
    await d.prepare('INSERT INTO comentarios (cliente, lanzamiento, id, clase, pregunta, contacto, nombre, texto, en, oculto, destacado, respuesta, respuesta_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, \'\', \'\')')
      .bind(clienteActual().id, code, c.id, c.clase, c.pregunta, c.contacto, c.nombre, c.texto, c.en).run();
    return c;
  }
  await reintentando(async () => {
    const lista = (await leerJSON(clave(code), () => [])) || [];
    if (lista.filter((x) => x.contacto === contacto && x.clase === clase).length >= MAX_POR_CLASE) throw limite();
    await guardarJSON(clave(code), [...lista, c].slice(-MAX_JSON), { motivo: 'Comentario de la preclase' });
  });
  return c;
}
const limite = () => Object.assign(new Error('Ya has dejado muchos comentarios en esta clase'), { status: 429, publicMessage: 'Ya has dejado muchos comentarios en esta clase. ¡Gracias por participar!' });

// Moderación desde el dashboard: cambios = { oculto?, destacado?, respuesta? } o borrar.
export async function moderar(code, id, cambios, { borrar = false } = {}) {
  const d = db();
  const ahora = new Date().toISOString();
  if (d) {
    await esquema(d);
    const k = [clienteActual().id, code, id];
    if (borrar) { await d.prepare('DELETE FROM comentarios WHERE cliente = ? AND lanzamiento = ? AND id = ?').bind(...k).run(); return null; }
    const actual = await d.prepare('SELECT * FROM comentarios WHERE cliente = ? AND lanzamiento = ? AND id = ?').bind(...k).first();
    if (!actual) throw noExiste();
    const n = { ...deFila(actual), ...cambios };
    if ('respuesta' in cambios) n.respuestaEn = cambios.respuesta ? ahora : '';
    await d.prepare('UPDATE comentarios SET oculto = ?, destacado = ?, respuesta = ?, respuesta_en = ? WHERE cliente = ? AND lanzamiento = ? AND id = ?')
      .bind(n.oculto ? 1 : 0, n.destacado ? 1 : 0, n.respuesta, n.respuestaEn, ...k).run();
    return n;
  }
  let out = null;
  await reintentando(async () => {
    const lista = (await leerJSON(clave(code), () => [])) || [];
    const i = lista.findIndex((x) => x.id === id);
    if (i < 0) throw noExiste();
    if (borrar) lista.splice(i, 1);
    else {
      lista[i] = { ...lista[i], ...cambios };
      if ('respuesta' in cambios) lista[i].respuestaEn = cambios.respuesta ? ahora : '';
      out = deFila(lista[i]);
    }
    await guardarJSON(clave(code), lista, { motivo: borrar ? 'Borrar comentario' : 'Moderar comentario' });
  });
  return out;
}
const noExiste = () => Object.assign(new Error('Comentario no encontrado'), { status: 404, publicMessage: 'Ese comentario ya no existe' });

// Lo que ven las leads de una clase: sin los ocultos, los destacados primero y después los más nuevos.
// Nunca sale el id del contacto; `mio` marca los suyos.
export function muroDe(lista, clase, contacto = '', max = 150) {
  const vis = lista.filter((c) => c.clase === clase && !c.oculto)
    .sort((a, b) => (b.destacado - a.destacado) || b.en.localeCompare(a.en));
  return {
    total: vis.length,
    comentarios: vis.slice(0, max).map((c) => ({ id: c.id, pregunta: c.pregunta, nombre: c.nombre, texto: c.texto, en: c.en, destacado: c.destacado, respuesta: c.respuesta, respuestaEn: c.respuestaEn, mio: Boolean(contacto) && c.contacto === contacto })),
  };
}

// Contactos que han comentado (para la puntuación y la ficha): { contacto → nº de comentarios }.
export const comentaristas = (lista) => lista.reduce((m, c) => { m[c.contacto] = (m[c.contacto] || 0) + 1; return m; }, {});
