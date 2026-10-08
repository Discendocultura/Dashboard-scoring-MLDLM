// Copia de los leads en el navegador (IndexedDB): al abrir un lanzamiento se enseñan al momento los de la
// última vez y, mientras, se descargan los de ahora de GHL y se sustituyen. Caduca a las 24 h y se borra
// al cerrar sesión. Si el navegador no deja (modo privado…), simplemente no hay copia.
const DB = 'lsd-cache';
const STORE = 'leads';
const CADUCA_MS = 24 * 3_600_000;

function abrir() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('Sin IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function op(modo, fn) {
  const db = await abrir();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, modo);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(r?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

// { at, contacts } o null.
export async function leerLeads(clave) {
  try {
    const v = await op('readonly', (s) => s.get(clave));
    return v && Date.now() - v.at < CADUCA_MS && Array.isArray(v.contacts) ? v : null;
  } catch { return null; }
}
export async function guardarLeads(clave, contacts) {
  try { await op('readwrite', (s) => s.put({ at: Date.now(), contacts }, clave)); } catch { /* sin copia */ }
}
export async function borrarCopias() {
  try { await op('readwrite', (s) => s.clear()); } catch { /* nada que borrar */ }
}
