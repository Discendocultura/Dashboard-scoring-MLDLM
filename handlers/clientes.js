// Clientes del dashboard (solo superadmin).
//   GET  /api/clientes → lista con su estado de conexión y las variables de Cloudflare que necesita cada uno
//   POST { op: 'guardar', cliente: { id, nombre, locationId, metaAdAccount, color } } → crea o edita
//   POST { op: 'probar', id } → comprueba que su GHL responde
//   POST { op: 'borrar', id } → lo quita del dashboard (no borra nada de su GHL)
import { requireSuperadmin } from '../lib/auth.js';
import { listClientes, saveClientes, sanitizeCliente } from '../lib/clientes.js';
import { runCliente, sufijo } from '../lib/cliente.js';
import { ghlConectado, listTags } from '../lib/ghl.js';
import { actualizarUsuarios } from '../lib/users.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

const conEstado = (c) => ({
  ...c,
  conectado: runCliente(c, () => ghlConectado(c)),
  variables: c.principal ? ['GHL_TOKEN', 'GHL_LOCATION_ID'] : [`GHL_TOKEN_${sufijo(c.id)}`],
});

export async function GET(request) {
  try {
    await requireSuperadmin(request);
    return json({ clientes: (await listClientes({ fresh: true })).map(conEstado) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSuperadmin(request);
    const body = await readBody(request);
    const lista = await listClientes({ fresh: true });
    if (body.op === 'guardar') {
      const c = body.cliente || {};
      const i = lista.findIndex((x) => x.id === String(c.id || '').trim().toLowerCase());
      if (i >= 0 && lista[i].principal) {
        lista[i] = { ...lista[i], nombre: String(c.nombre || '').trim().slice(0, 60) || lista[i].nombre, color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : lista[i].color };
      } else if (i >= 0) {
        lista[i] = sanitizeCliente({ ...lista[i], ...c, id: lista[i].id, creado: lista[i].creado });
      } else {
        if (lista.length >= 50) throw bad('Máximo 50 clientes');
        const nuevo = sanitizeCliente(c);
        if (!nuevo.locationId) throw bad('Falta el ID de la subcuenta de GHL (Location ID)');
        lista.push(nuevo);
      }
      return json({ clientes: (await saveClientes(lista)).map(conEstado) });
    }
    const c = lista.find((x) => x.id === body.id);
    if (!c) throw bad('Cliente no encontrado', 404);
    if (body.op === 'probar') {
      try {
        const tags = await runCliente(c, () => listTags());
        return json({ ok: true, etiquetas: tags.length });
      } catch (e) {
        return json({ ok: false, error: e.publicMessage || String(e.message || e).slice(0, 300) });
      }
    }
    if (body.op === 'borrar') {
      if (c.principal) throw bad('El cliente principal no se puede quitar');
      await actualizarUsuarios((users) => { for (const u of users) if (u.accesos?.[c.id]) delete u.accesos[c.id]; }, `Quitar el cliente ${c.id}`);
      return json({ clientes: (await saveClientes(lista.filter((x) => x.id !== c.id))).map(conEstado) });
    }
    throw bad('Operación no válida');
  } catch (e) {
    return errorResponse(e);
  }
}
