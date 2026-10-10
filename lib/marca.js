// Marca y avatar del cliente (ver public/js/marca.js): un dato «lsd_marca» con las respuestas, los
// productos, la ficha de cada producto y la lista de documentos; el texto de cada documento va aparte
// («lsd_marca_doc_<id>», sin copias ni historial: puede ser grande).
// Los cambios se guardan por campos (los que llegan), así el cliente y el equipo pueden escribir a la vez
// sin pisarse.
import { leerJSON, guardarJSON, reintentando, storeGet, storeSet, storeGetPrefijo, usaD1, versionDe } from './store.js';
import { actorActual } from './cliente.js';
import { generatePassword, newId } from './users.js';
import {
  sanitizeMarcaCliente, limpiarRespuestas, sanitizeProducto, sanitizeDocMeta, nuevoIdProducto,
  MAX_PRODUCTOS, MAX_DOCS, MAX_DOC_CHARS, MAX_FICHA,
} from '../public/js/marca.js';

const CLAVE = 'lsd_marca';
const DOC = (id) => `lsd_marca_doc_${id}`;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

export const leerMarca = async () => sanitizeMarcaCliente(await leerJSON(CLAVE, () => ({})));

// Cambia el dato con `fn(m)` (que lo modifica) y lo guarda; reintenta si otra persona guardó a la vez.
async function cambiar(fn, por = '') {
  return reintentando(async () => {
    const raw = await leerJSON(CLAVE, () => ({}));
    const m = sanitizeMarcaCliente(raw);
    const r = await fn(m);
    m.actualizado = new Date().toISOString();
    m.actualizadoPor = String(por || actorActual() || '').slice(0, 60);
    const limpio = sanitizeMarcaCliente(m);
    // Con la versión leída: si otra persona guardó entretanto, Conflicto y se repite.
    await guardarJSON(CLAVE, limpio, { version: versionDe(raw), motivo: 'Marca y avatar' });
    return r === undefined ? limpio : r;
  });
}

// Campos de la marca o de un producto: { ambito: 'marca' | 'producto', productoId, campos: { id: valor } }.
// Un campo vacío lo borra.
export function guardarCampos({ ambito = 'marca', productoId = '', campos = {} }, por) {
  return cambiar((m) => {
    const destino = ambito === 'producto' ? m.productos.find((p) => p.id === productoId) : m;
    if (!destino) throw bad('Producto no encontrado', 404);
    // Lo que no llega se queda; lo que llega vacío se borra (limpiarRespuestas lo quita).
    destino.respuestas = limpiarRespuestas({ ...destino.respuestas, ...campos }, ambito === 'producto' ? 'producto' : 'marca');
  }, por);
}

export function crearProducto(nombre = '', por) {
  return cambiar((m) => {
    if (m.productos.length >= MAX_PRODUCTOS) throw bad(`Como mucho ${MAX_PRODUCTOS} productos`);
    const p = sanitizeProducto({ id: nuevoIdProducto(), respuestas: { nombre } });
    m.productos.push(p);
    return { producto: p };
  }, por);
}

export function borrarProducto(id, por) {
  return cambiar((m) => {
    m.productos = m.productos.filter((p) => p.id !== id);
    for (const [e, p] of Object.entries(m.embudos)) if (p === id) delete m.embudos[e];
    for (const d of m.docs) if (d.productoId === id) d.productoId = '';
  }, por);
}

export function guardarFicha(productoId, ficha, por) {
  return cambiar((m) => {
    const p = m.productos.find((x) => x.id === productoId);
    if (!p) throw bad('Producto no encontrado', 404);
    p.ficha = String(ficha || '').trim().slice(0, MAX_FICHA);
    p.fichaEn = p.ficha ? new Date().toISOString() : '';
  }, por);
}

export function productoDeEmbudoGuardar(embudoId, productoId, por) {
  return cambiar((m) => {
    if (!productoId) delete m.embudos[embudoId];
    else if (m.productos.some((p) => p.id === productoId)) m.embudos[embudoId] = productoId;
    else throw bad('Producto no encontrado', 404);
  }, por);
}

// Enlace del cliente: crea uno nuevo (el anterior deja de valer) o lo quita.
export function enlaceCliente(activar, por) {
  return cambiar((m) => { m.token = activar ? generatePassword(32).replace(/[^A-Za-z0-9]/g, '') : ''; }, por);
}

// ---- Documentos (solo el texto) ----
export async function subirDoc({ nombre, tipo, productoId = '', texto }, por) {
  if (!usaD1()) throw bad('Los documentos necesitan la base de datos D1 de Cloudflare.');
  const t = String(texto || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  if (t.length < 20) throw bad('No se ha podido leer texto de este documento (¿es un PDF escaneado o una imagen?).');
  const id = newId('d');
  const meta = sanitizeDocMeta({ id, nombre, tipo, productoId, chars: Math.min(t.length, MAX_DOC_CHARS), en: new Date().toISOString(), por: por || actorActual() });
  // Primero se comprueba el hueco; el texto se guarda antes que la lista (si falla la lista, queda un texto huérfano, no una entrada vacía).
  const antes = await leerMarca();
  if (antes.docs.length >= MAX_DOCS) throw bad(`Como mucho ${MAX_DOCS} documentos: borra alguno antes.`);
  if (meta.productoId && !antes.productos.some((p) => p.id === meta.productoId)) meta.productoId = '';
  await storeSet(DOC(id), t.slice(0, MAX_DOC_CHARS), { motivo: 'Documento de marca' });
  await cambiar((m) => {
    if (m.docs.length >= MAX_DOCS) throw bad(`Como mucho ${MAX_DOCS} documentos: borra alguno antes.`);
    m.docs.push(meta);
  }, por);
  return { doc: meta, recortado: t.length > MAX_DOC_CHARS };
}

export async function borrarDoc(id, por) {
  const r = await cambiar((m) => {
    const antes = m.docs.length;
    m.docs = m.docs.filter((d) => d.id !== id);
    if (m.docs.length === antes) throw bad('Documento no encontrado', 404);
  }, por);
  if (/^d[a-z0-9]{4,14}$/.test(id)) await storeSet(DOC(id), '', { motivo: 'Documento borrado' }).catch(() => {});
  return r;
}

// Texto de los documentos: { id → texto } (una sola consulta).
export async function textosDocs(ids = null) {
  if (!usaD1()) return {};
  const todos = await storeGetPrefijo('lsd_marca_doc_');
  const out = {};
  for (const [clave, valor] of Object.entries(todos)) {
    const id = clave.slice('lsd_marca_doc_'.length);
    if (valor && (!ids || ids.includes(id))) out[id] = valor;
  }
  return out;
}
export const leerDoc = async (id) => (await storeGet(DOC(id)))?.value || '';

// Lo que ve el cliente desde su enlace: sus respuestas, sus productos y la lista de documentos
// (sin fichas, sin token, sin quién lo cambió).
export function vistaPublica(m) {
  return {
    respuestas: m.respuestas,
    productos: m.productos.map((p) => ({ id: p.id, respuestas: p.respuestas })),
    docs: m.docs.map(({ id, nombre, tipo, productoId, chars, en }) => ({ id, nombre, tipo, productoId, chars, en })),
  };
}
