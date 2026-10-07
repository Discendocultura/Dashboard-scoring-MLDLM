// Historial de cambios y copias de seguridad (Equipo → Historial). Solo con la base de datos D1.
//   GET  /api/historial?ambito=cliente|agencia            → últimos cambios (quién, qué, cuándo) y copias guardadas
//   GET  /api/historial?ambito=…&exportar=1               → descarga de todos los datos (JSON)
//   POST { op: 'restaurar', id, ambito }                   → vuelve a poner una copia (lo actual queda a su vez copiado)
// «cliente» = los datos del cliente elegido (admin); «agencia» = equipo, clientes y seguridad (solo superadmin).
import { requireSession } from '../lib/auth.js';
import { clienteActual } from '../lib/cliente.js';
import { AGENCIA, usaD1, esComun, historial, copias, leerCopia, exportar, storeSet } from '../lib/store.js';
import { getConfig } from '../lib/config-store.js';
import { listUsersRaw } from '../lib/users.js';
import { getRoles } from '../lib/roles.js';
import { listClientes } from '../lib/clientes.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

// Nombre comprensible de cada dato.
export function etiquetaClave(clave) {
  const fijos = {
    lead_scoring_dashboard_config: 'Configuración',
    lsd_usuarios: 'Equipo (personas y accesos)',
    lsd_clientes: 'Clientes',
    lsd_seguridad: 'Seguridad',
    lsd_roles: 'Roles y permisos',
    lsd_tareas_habituales: 'Tareas habituales',
    lsd_kanban_columnas: 'Columnas del tablero de tareas',
  };
  if (fijos[clave]) return fijos[clave];
  const m = /^lsd_(tareas|eventos|llamadas)_(.+)$/.exec(clave);
  if (m) return `${{ tareas: 'Tareas', eventos: 'Eventos del calendario', llamadas: 'Resultados de llamadas' }[m[1]]} · ${m[2]}`;
  return clave;
}

async function ambitoDe(request, valor) {
  const s = await requireSession(request, { admin: true });
  if (valor === 'agencia') {
    if (!s.superadmin) throw bad('Solo el superadmin puede ver el historial de la agencia', 403);
    return { s, cliente: AGENCIA };
  }
  return { s, cliente: clienteActual().id };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const { cliente } = await ambitoDe(request, url.searchParams.get('ambito'));
    if (!usaD1()) return json({ disponible: false });
    if (url.searchParams.has('exportar')) {
      const datos = (await exportar(cliente)).map((d) => {
        let valor = d.valor;
        try { valor = JSON.parse(d.valor); } catch { /* texto tal cual */ }
        return { ...d, valor };
      });
      const nombre = `${cliente === AGENCIA ? 'agencia' : cliente}-${new Date().toISOString().slice(0, 10)}.json`;
      return new Response(JSON.stringify({ cliente, exportado: new Date().toISOString(), datos }, null, 2), {
        headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}"`, 'cache-control': 'no-store' },
      });
    }
    const [cambios, lista] = await Promise.all([historial(cliente), copias(cliente)]);
    const conEtiqueta = (x) => ({ ...x, etiqueta: etiquetaClave(x.clave) });
    return json({ disponible: true, cambios: cambios.map(conEtiqueta), copias: lista.map(conEtiqueta) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    if (body.op !== 'restaurar') throw bad('Operación no válida');
    const { cliente } = await ambitoDe(request, body.ambito);
    if (!usaD1()) throw bad('El historial necesita la base de datos D1');
    const copia = await leerCopia(body.id);
    // La copia tiene que ser del ámbito que se está viendo (no se puede restaurar lo de otro cliente).
    if (!copia || copia.cliente !== cliente || esComun(copia.clave) !== (cliente === AGENCIA)) throw bad('Copia no encontrada', 404);
    await storeSet(copia.clave, copia.valor, { motivo: `Restaurada la copia del ${copia.en.slice(0, 16).replace('T', ' ')} (versión ${copia.version})`, forzarCopia: true });
    // Que lo restaurado se vea ya (las cachés duran 30 s).
    await Promise.all([getConfig({ fresh: true }), listUsersRaw({ fresh: true }), getRoles({ fresh: true }), listClientes({ fresh: true })]).catch(() => {});
    return json({ ok: true, clave: copia.clave, etiqueta: etiquetaClave(copia.clave) });
  } catch (e) {
    return errorResponse(e);
  }
}
