// Almacén de datos del dashboard (configuración, tareas, usuarios, llamadas…).
// · Con la base de datos D1 de Cloudflare (binding «DB»): cada dato es una fila (cliente, clave) con su
//   versión, quién lo cambió y cuándo; hay historial de cambios y una copia diaria automática.
//   La primera vez que se lee algo que aún no está en D1, se trae de GHL (migración automática).
// · Sin D1: como antes, en los «Custom Values» de GHL de cada cliente.
// Lo común a todos los clientes (usuarios, registro de clientes, fotos, seguridad) va en el cliente «_agencia».
import { bindings } from './env.js';
import { getCustomValue, listCustomValues, saveCustomValue } from './ghl.js';
import { clienteActual, enPrincipal, actorActual } from './cliente.js';

export const AGENCIA = '_agencia';
const COMUN_RE = /^(lsd_usuarios|lsd_clientes|lsd_seguridad|lsd_plantillas|lsd_foto_.+)$/;
const SIN_HISTORIAL_RE = /^(lsd_foto_.+|lsd_actividad|lsd_meteo_visitas_.+)$/; // fotos y actividad de las páginas: sin copias ni historial
const COPIAS_POR_CLAVE = 30;
const HORAS_ENTRE_COPIAS = 20;

export const esComun = (clave) => COMUN_RE.test(clave);
const clienteDe = (clave) => (esComun(clave) ? AGENCIA : clienteActual().id);
const enSuGhl = (clave, fn) => (esComun(clave) ? enPrincipal(fn) : fn());

export const db = () => bindings.DB || null;
export const usaD1 = () => Boolean(db());

// Otra persona guardó antes: el que llama vuelve a leer y a aplicar su cambio (ver reintentando).
export class Conflicto extends Error {
  constructor(clave) {
    super(`Conflicto al guardar ${clave}`);
    this.status = 409;
    this.conflicto = true;
    this.publicMessage = 'Otra persona ha cambiado esto a la vez que tú. Vuelve a cargar y repite el cambio.';
  }
}

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS datos (cliente TEXT NOT NULL, clave TEXT NOT NULL, valor TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, actualizado TEXT NOT NULL, por TEXT, PRIMARY KEY (cliente, clave))`,
  `CREATE TABLE IF NOT EXISTS historial (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT NOT NULL, clave TEXT NOT NULL,
    version INTEGER, por TEXT, en TEXT NOT NULL, motivo TEXT, bytes INTEGER)`,
  'CREATE INDEX IF NOT EXISTS historial_cliente ON historial (cliente, id)',
  `CREATE TABLE IF NOT EXISTS copias (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente TEXT NOT NULL, clave TEXT NOT NULL,
    version INTEGER, valor TEXT NOT NULL, en TEXT NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS copias_clave ON copias (cliente, clave, id)',
  `CREATE TABLE IF NOT EXISTS intentos (clave TEXT PRIMARY KEY, n INTEGER NOT NULL, desde INTEGER NOT NULL, bloqueo INTEGER NOT NULL DEFAULT 0)`,
];
const esquemas = new WeakMap();
export function esquema(d = db()) {
  if (!esquemas.has(d)) {
    const p = d.batch(ESQUEMA.map((sql) => d.prepare(sql))).catch((e) => { esquemas.delete(d); throw e; });
    esquemas.set(d, p);
  }
  return esquemas.get(d);
}

// Migración desde GHL: la primera vez que falta un dato de un cliente se copian a D1 de una vez todos sus
// «lsd_…» de los Custom Values de GHL y se apunta que ya está hecho. Desde entonces, un dato que no está
// en D1 es que no existe, sin preguntar a GHL en cada lectura (antes: una descarga de GHL por dato y
// por lectura, que con muchos lanzamientos saturaba GHL y el límite de peticiones de Cloudflare).
// Devuelve true si acaba de migrar (hay que volver a mirar D1).
const MIGRADO = '_migrado_desde_ghl';
const migracionesPorDb = new WeakMap(); // base de datos → (cliente → promesa), una sola a la vez en cada isolate
async function migrarDesdeGhl(d, cliente, clave) {
  if (!migracionesPorDb.has(d)) migracionesPorDb.set(d, new Map());
  const migraciones = migracionesPorDb.get(d);
  if (!migraciones.has(cliente)) {
    const p = (async () => {
      if (await d.prepare('SELECT 1 FROM datos WHERE cliente = ? AND clave = ?').bind(cliente, MIGRADO).first()) return false;
      const lista = await enSuGhl(clave, () => listCustomValues());
      const ahora = new Date().toISOString();
      const insertar = (k, v) => d.prepare('INSERT OR IGNORE INTO datos (cliente, clave, valor, version, actualizado, por) VALUES (?, ?, ?, 1, ?, ?)').bind(cliente, k, v, ahora, 'migración desde GHL');
      const stmts = lista
        .filter((v) => /^lsd_/.test(v.name || '') && esComun(v.name) === (cliente === AGENCIA) && v.value != null && v.value !== '')
        .map((v) => insertar(v.name, String(v.value)));
      stmts.push(insertar(MIGRADO, ahora));
      await d.batch(stmts);
      return true;
    })().then((r) => {
      migraciones.set(cliente, Promise.resolve(false)); // hecha: las lecturas siguientes ya no esperan nada
      return r;
    }, (e) => {
      migraciones.delete(cliente); // se reintenta en la próxima lectura
      console.error('Migración desde GHL', cliente, e.message);
      return false;
    });
    migraciones.set(cliente, p);
  }
  return migraciones.get(cliente); // quien espera a la misma migración también vuelve a mirar D1
}

// { value, version } | null
export async function storeGet(clave) {
  const d = db();
  if (!d) {
    const cv = await enSuGhl(clave, () => getCustomValue(clave));
    return cv?.value != null ? { value: cv.value, version: null } : null;
  }
  await esquema(d);
  const cliente = clienteDe(clave);
  const row = await d.prepare('SELECT valor, version FROM datos WHERE cliente = ? AND clave = ?').bind(cliente, clave).first();
  if (row) return { value: row.valor, version: row.version };
  // Migración: lo que aún estaba en GHL se copia a D1 (todo de una vez y solo la primera vez).
  if (!(await migrarDesdeGhl(d, cliente, clave))) return null;
  const again = await d.prepare('SELECT valor, version FROM datos WHERE cliente = ? AND clave = ?').bind(cliente, clave).first();
  return again ? { value: again.valor, version: again.version } : null;
}

// Todos los datos de este cliente cuya clave empieza por `prefijo` (p. ej. 'lsd_tareas_'), en una sola
// consulta: { clave → valor }. Para el calendario, que junta los de todos los embudos.
export async function storeGetPrefijo(prefijo) {
  const d = db();
  if (!d) {
    const lista = await enSuGhl(prefijo, () => listCustomValues());
    return Object.fromEntries(lista.filter((v) => String(v.name || '').startsWith(prefijo) && v.value != null).map((v) => [v.name, String(v.value)]));
  }
  await esquema(d);
  const cliente = clienteDe(prefijo);
  await migrarDesdeGhl(d, cliente, prefijo);
  const { results } = await d.prepare('SELECT clave, valor FROM datos WHERE cliente = ? AND substr(clave, 1, ?) = ?').bind(cliente, prefijo.length, prefijo).all();
  return Object.fromEntries((results || []).map((r) => [r.clave, r.valor]));
}

// Guarda. Con `version` (la que se leyó) solo guarda si nadie lo ha cambiado entretanto; si sí, lanza Conflicto.
// Devuelve la versión nueva (null sin D1).
export async function storeSet(clave, value, { version = null, motivo = '', forzarCopia = false } = {}) {
  const d = db();
  if (!d) {
    await enSuGhl(clave, () => saveCustomValue(clave, value));
    return null;
  }
  await esquema(d);
  const cliente = clienteDe(clave);
  const ahora = new Date().toISOString();
  const por = actorActual() || 'sistema';
  const prev = await d.prepare('SELECT valor, version FROM datos WHERE cliente = ? AND clave = ?').bind(cliente, clave).first();
  if (version != null && prev && prev.version !== version) throw new Conflicto(clave);
  if (prev && prev.valor === value) return prev.version; // sin cambios: ni versión nueva ni historial
  let nueva;
  if (!prev) {
    const r = await d.prepare('INSERT OR IGNORE INTO datos (cliente, clave, valor, version, actualizado, por) VALUES (?, ?, ?, 1, ?, ?)').bind(cliente, clave, value, ahora, por).run();
    if (!r.meta?.changes) throw new Conflicto(clave);
    nueva = 1;
  } else {
    const r = await d.prepare('UPDATE datos SET valor = ?, version = version + 1, actualizado = ?, por = ? WHERE cliente = ? AND clave = ? AND version = ?')
      .bind(value, ahora, por, cliente, clave, prev.version).run();
    if (!r.meta?.changes) throw new Conflicto(clave);
    nueva = prev.version + 1;
  }
  if (!SIN_HISTORIAL_RE.test(clave)) {
    const extra = [d.prepare('INSERT INTO historial (cliente, clave, version, por, en, motivo, bytes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(cliente, clave, nueva, por, ahora, String(motivo || '').slice(0, 200), value.length)];
    // Copia de seguridad del valor anterior, como mucho una cada ~día por dato, y se guardan las últimas 30.
    if (prev) {
      const ultima = await d.prepare('SELECT en FROM copias WHERE cliente = ? AND clave = ? ORDER BY id DESC LIMIT 1').bind(cliente, clave).first('en');
      if (forzarCopia || !ultima || Date.parse(ahora) - Date.parse(ultima) > HORAS_ENTRE_COPIAS * 3_600_000) {
        extra.push(
          d.prepare('INSERT INTO copias (cliente, clave, version, valor, en) VALUES (?, ?, ?, ?, ?)').bind(cliente, clave, prev.version, prev.valor, ahora),
          d.prepare(`DELETE FROM copias WHERE cliente = ? AND clave = ? AND id NOT IN (SELECT id FROM copias WHERE cliente = ? AND clave = ? ORDER BY id DESC LIMIT ${COPIAS_POR_CLAVE})`).bind(cliente, clave, cliente, clave),
        );
      }
    }
    await d.batch(extra).catch((e) => console.error('Historial', e.message));
  }
  return nueva;
}

// ---- JSON con versión «pegada» al objeto (para que guardarJSON sepa qué versión se leyó) ----
const versiones = new WeakMap();
export const versionDe = (o) => (o && typeof o === 'object' ? versiones.get(o) ?? null : null);
export function fijarVersion(obj, v) {
  if (v != null && obj && typeof obj === 'object') versiones.set(obj, v);
  return obj;
}
export function conVersion(nuevo, viejo) {
  const v = versionDe(viejo);
  if (v != null && nuevo && typeof nuevo === 'object') versiones.set(nuevo, v);
  return nuevo;
}

export async function leerJSON(clave, porDefecto = () => null) {
  const r = await storeGet(clave);
  let v = porDefecto();
  if (r?.value) {
    try { v = JSON.parse(r.value); } catch { console.error(`Dato corrupto: ${clave}`); }
  }
  // Versión 0 = «no existía»: si otra persona lo crea antes de que guardemos, también es conflicto.
  const version = r ? r.version : usaD1() ? 0 : null;
  if (v && typeof v === 'object' && version != null) versiones.set(v, version);
  return v;
}

// opts.version: undefined = la del objeto leído (guardado seguro); null = guardar sin comprobar.
export async function guardarJSON(clave, obj, opts = {}) {
  const version = opts.version !== undefined ? opts.version : versionDe(obj);
  const nueva = await storeSet(clave, JSON.stringify(obj), { ...opts, version });
  if (nueva != null && obj && typeof obj === 'object') versiones.set(obj, nueva);
  return nueva;
}

// Repite una operación de leer-cambiar-guardar si otra persona guardó a la vez.
export async function reintentando(fn, intentos = 4) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!e?.conflicto || i >= intentos - 1) throw e;
      await new Promise((r) => setTimeout(r, 30 + Math.random() * 80));
    }
  }
}

// ---- Historial y copias (pestaña Equipo → Historial) ----
// `cliente`: el id del cliente o AGENCIA. Sin D1 no hay nada que enseñar.
export async function historial(cliente, { limite = 200 } = {}) {
  const d = db();
  if (!d) return [];
  await esquema(d);
  const { results } = await d.prepare('SELECT id, clave, version, por, en, motivo, bytes FROM historial WHERE cliente = ? ORDER BY id DESC LIMIT ?')
    .bind(cliente, Math.min(Math.max(1, limite), 500)).all();
  return results;
}

export async function copias(cliente, clave) {
  const d = db();
  if (!d) return [];
  await esquema(d);
  const sql = `SELECT id, clave, version, en, length(valor) AS bytes FROM copias WHERE cliente = ?${clave ? ' AND clave = ?' : ''} ORDER BY id DESC LIMIT 300`;
  const { results } = await d.prepare(sql).bind(...(clave ? [cliente, clave] : [cliente])).all();
  return results;
}

export async function leerCopia(id) {
  const d = db();
  if (!d) return null;
  await esquema(d);
  return d.prepare('SELECT id, cliente, clave, version, valor, en FROM copias WHERE id = ?').bind(Number(id) || 0).first();
}

// Todos los datos de un cliente (para descargarlos). Sin las fotos, que pesan.
export async function exportar(cliente) {
  const d = db();
  if (!d) return [];
  await esquema(d);
  const { results } = await d.prepare("SELECT clave, valor, version, actualizado, por FROM datos WHERE cliente = ? AND clave NOT LIKE 'lsd_foto_%' ORDER BY clave").bind(cliente).all();
  return results;
}
