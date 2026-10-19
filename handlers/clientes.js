// Clientes del dashboard (solo superadmin).
//   GET  /api/clientes → lista con su estado de conexión y las variables de Cloudflare que necesita cada uno
//   POST { op: 'guardar', cliente: { id, nombre, locationId, metaAdAccount, color, labia } } → crea o edita (labia: LabIA contratado)
//   POST { op: 'probar', id } → comprueba que su GHL responde
//   POST { op: 'probar-meta', id } → comprueba que el token de Meta ve su cuenta publicitaria
//   POST { op: 'probar-sendflow', id } → comprueba el SendFlow que usa (lee sus campañas)
//   POST { op: 'probar-zoom', id } → comprueba el Zoom que usa (el de la agencia o el suyo)
//   POST { op: 'borrar', id } → lo quita del dashboard (no borra nada de su GHL)
import { requireSuperadmin } from '../lib/auth.js';
import { listClientes, saveClientes, sanitizeCliente, labiaActivo } from '../lib/clientes.js';
import { getConfig } from '../lib/config-store.js';
import { runCliente, sufijo } from '../lib/cliente.js';
import { ghlConectado, listTags } from '../lib/ghl.js';
import { probarCuentaMeta } from '../lib/meta.js';
import { probarZoom, zoomDeCliente } from '../lib/zoom.js';
import { sendflowDeCliente, campanasSendflow } from '../lib/sendflow.js';
import { env } from '../lib/env.js';
import { actualizarUsuarios } from '../lib/users.js';
import { json, readBody, errorResponse } from '../lib/http.js';

// Con LabIA o no (lo marcado o, en los de antes, si su setter IA está conectado): la casilla de su tarjeta.
const conEstados = (lista) => Promise.all(lista.map(async (c) => ({ ...conEstado(c), labiaActiva: typeof c.labia === 'boolean' ? c.labia : await runCliente(c, async () => labiaActivo(c, await getConfig().catch(() => null))) })));
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });

const conEstado = (c) => ({
  ...c,
  conectado: runCliente(c, () => ghlConectado(c)),
  variables: c.principal ? ['GHL_TOKEN', 'GHL_LOCATION_ID'] : [`GHL_TOKEN_${sufijo(c.id)}`],
  // Qué Zoom usa ahora y si ya tiene token de Meta propio (sin leer valores: solo si existen).
  zoomUsa: runCliente(c, () => zoomDeCliente(c).cual),
  sendflowUsa: runCliente(c, () => sendflowDeCliente(c).cual),
  sendflowListo: runCliente(c, () => Boolean(sendflowDeCliente(c).clave)),
  metaTokenPropio: !c.principal && Boolean(env[`META_ACCESS_TOKEN_${sufijo(c.id)}`]),
});

export async function GET(request) {
  try {
    await requireSuperadmin(request);
    return json({ clientes: await conEstados(await listClientes({ fresh: true })) });
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
        lista[i] = { ...lista[i], nombre: String(c.nombre || '').trim().slice(0, 60) || lista[i].nombre, color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : lista[i].color, ...(typeof c.labia === 'boolean' ? { labia: c.labia } : {}), ...(typeof c.implementa === 'boolean' ? { implementa: c.implementa } : {}) };
      } else if (i >= 0) {
        lista[i] = sanitizeCliente({ ...lista[i], ...c, id: lista[i].id, creado: lista[i].creado });
      } else {
        if (lista.length >= 50) throw bad('Máximo 50 clientes');
        const nuevo = sanitizeCliente(c);
        if (!nuevo.locationId) throw bad('Falta el ID de la subcuenta de GHL (Location ID)');
        lista.push(nuevo);
      }
      return json({ clientes: await conEstados(await saveClientes(lista)) });
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
    if (body.op === 'probar-meta') {
      try {
        return json(await runCliente(c, () => probarCuentaMeta()));
      } catch (e) {
        return json({ ok: false, error: e.publicMessage || 'Meta no responde: prueba otra vez en un minuto.' });
      }
    }
    if (body.op === 'probar-sendflow') {
      return json(await runCliente(c, async () => {
        const { cual, clave } = sendflowDeCliente(c);
        if (cual === 'ninguno') return { ok: true, cual, texto: 'Este cliente no usa SendFlow.' };
        if (!clave) return { ok: false, cual, error: `Falta en Cloudflare: ${cual === 'propio' ? `SENDFLOW_API_KEY_${sufijo(c.id)}` : 'SENDFLOW_API_KEY'}. Añádela (tipo Secret) y vuelve a desplegar (Deployments → ⋯ → Retry deployment).` };
        try {
          const lista = await campanasSendflow();
          return { ok: true, cual, texto: `${cual === 'propio' ? 'Su SendFlow' : 'El SendFlow de la agencia'} responde (${(lista || []).length} campañas).` };
        } catch (e) {
          return { ok: false, cual, error: e.publicMessage || 'SendFlow no acepta la clave: revisa que la copiaste entera, sin espacios, y que su plan incluye SendAPI.' };
        }
      }));
    }
    if (body.op === 'probar-zoom') {
      try {
        return json(await runCliente(c, () => probarZoom(c)));
      } catch (e) {
        return json({ ok: false, error: e.publicMessage || 'Zoom no responde: prueba otra vez en un minuto.' });
      }
    }
    if (body.op === 'borrar') {
      if (c.principal) throw bad('El cliente principal no se puede quitar');
      await actualizarUsuarios((users) => { for (const u of users) if (u.accesos?.[c.id]) delete u.accesos[c.id]; }, `Quitar el cliente ${c.id}`);
      return json({ clientes: await conEstados(await saveClientes(lista.filter((x) => x.id !== c.id))) });
    }
    throw bad('Operación no válida');
  } catch (e) {
    return errorResponse(e);
  }
}
