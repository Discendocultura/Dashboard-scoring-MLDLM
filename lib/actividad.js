// Última vez que las páginas de GHL del cliente han hablado con el dashboard (para el alta guiada:
// «páginas con código»). Se apunta como mucho una vez por hora y servidor, sin frenar la respuesta.
import { storeGet, storeSet } from './store.js';
import { clienteActual } from './cliente.js';

const NAME = 'lsd_actividad';
const vistos = new Map();

export async function marcarActividad(que) {
  const k = `${clienteActual().id}:${que}`;
  if ((vistos.get(k) || 0) > Date.now() - 3_600_000) return;
  vistos.set(k, Date.now());
  try {
    const cv = await storeGet(NAME);
    const v = cv?.value ? JSON.parse(cv.value) : {};
    v[que] = new Date().toISOString();
    await storeSet(NAME, JSON.stringify(v), { motivo: '' });
  } catch (e) {
    console.error('Actividad', e.message);
  }
}

export async function leerActividad() {
  try {
    const cv = await storeGet(NAME);
    return cv?.value ? JSON.parse(cv.value) : {};
  } catch {
    return {};
  }
}
