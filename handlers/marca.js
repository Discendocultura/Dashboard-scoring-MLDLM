// Marca y avatar del cliente (cuestionario, productos, documentos y ficha). Ver lib/marca.js.
//   GET  /api/marca                       (equipo) → todo
//   GET  /api/marca?textos=1              (equipo) → { textos: { docId → texto } } para los prompts
//   GET  /api/marca?t=<enlace>            (cliente, sin cuenta: página /marca.html) → sus respuestas
//   POST { op, … }                        (equipo con permiso «config», o el cliente con { t })
//     campos { ambito: 'marca' | 'producto', productoId, campos }   → guarda esos campos
//     producto-nuevo { nombre } · doc-subir { nombre, tipo, productoId, texto } · doc-borrar { id }
//     Solo equipo: producto-borrar { id } · ficha { productoId, ficha } · embudo { embudo, productoId }
//                  · enlace { activar }
import { requireSession, safeEqual, tienePermiso } from '../lib/auth.js';
import { ROL_CLIENTE } from '../public/js/roles.js';
import { clienteActual, setActor, actorActual } from '../lib/cliente.js';
import { usaD1 } from '../lib/store.js';
import {
  leerMarca, guardarCampos, crearProducto, borrarProducto, guardarFicha, productoDeEmbudoGuardar,
  enlaceCliente, subirDoc, borrarDoc, textosDocs, vistaPublica, guardarPaso, terminarAsistente, reabrirAsistente,
} from '../lib/marca.js';
import { progresoTotal } from '../public/js/marca.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const POR_CLIENTE = 'Cliente (enlace)';
// Lo que puede hacer el cliente (desde su enlace o con su acceso «Cliente» al dashboard).
const OPS_CLIENTE = ['campos', 'producto-nuevo', 'doc-subir', 'doc-borrar', 'paso', 'terminar'];

async function enlaceValido(t) {
  const m = await leerMarca();
  return m.token && typeof t === 'string' && safeEqual(t, m.token) ? m : null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const t = url.searchParams.get('t');
    if (t != null) {
      const m = await enlaceValido(t);
      if (!m) return json({ error: 'Este enlace no es válido o ya no está activo. Pide uno nuevo a tu equipo.' }, 403);
      return json({ cliente: clienteActual().nombre, ...vistaPublica(m), progreso: progresoTotal(m), docsActivos: usaD1() });
    }
    const s = await requireSession(request, { cliente: true });
    // El cliente con su acceso al dashboard: lo mismo que desde el enlace.
    if (s.role === ROL_CLIENTE) {
      const m = await leerMarca();
      return json({ cliente: clienteActual().nombre, ...vistaPublica(m), progreso: progresoTotal(m), docsActivos: usaD1() });
    }
    if (url.searchParams.get('textos') === '1') return json({ textos: await textosDocs() });
    const m = await leerMarca();
    return json({ marca: m, progreso: progresoTotal(m), docsActivos: usaD1() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    let por;
    let comoCliente = body.t != null;
    if (body.t != null) {
      if (!(await enlaceValido(body.t))) return json({ error: 'Este enlace no es válido o ya no está activo.' }, 403);
      if (!OPS_CLIENTE.includes(body.op)) return json({ error: 'Operación no válida' }, 400);
      por = POR_CLIENTE;
      setActor(POR_CLIENTE); // en el historial de cambios
    } else {
      const s = await requireSession(request, { cliente: true });
      if (s.role === ROL_CLIENTE) {
        if (!OPS_CLIENTE.includes(body.op)) return json({ error: 'Operación no válida' }, 400);
        comoCliente = true;
      } else if (!tienePermiso(s, 'config')) {
        return json({ error: 'Tu rol no tiene acceso a esto. Pide a la administradora que te lo active en Equipo → Roles y permisos.' }, 403);
      }
      por = actorActual();
    }
    const op = body.op;
    let r;
    if (op === 'campos') r = await guardarCampos({ ambito: body.ambito, productoId: String(body.productoId || ''), campos: body.campos && typeof body.campos === 'object' ? body.campos : {} }, por);
    else if (op === 'producto-nuevo') r = await crearProducto(String(body.nombre || '').slice(0, 200), por);
    else if (op === 'doc-subir') r = await subirDoc({ nombre: body.nombre, tipo: body.tipo, productoId: body.productoId, texto: String(body.texto || '').slice(0, 400_000) }, por);
    else if (op === 'doc-borrar') r = await borrarDoc(String(body.id || ''), por);
    else if (op === 'producto-borrar') r = await borrarProducto(String(body.id || ''), por);
    else if (op === 'ficha') r = await guardarFicha(String(body.productoId || ''), body.ficha, por);
    else if (op === 'embudo') r = await productoDeEmbudoGuardar(String(body.embudo || '').slice(0, 24), String(body.productoId || ''), por);
    else if (op === 'enlace') r = await enlaceCliente(Boolean(body.activar), por);
    else if (op === 'paso') r = await guardarPaso(body.paso, por);
    else if (op === 'terminar') {
      try { r = await terminarAsistente(por); } catch (e) { if (e.faltan) return json({ error: e.publicMessage, faltan: e.faltan }, 400); throw e; }
    } else if (op === 'reabrir') r = await reabrirAsistente(por);
    else return json({ error: 'Operación no válida' }, 400);
    const m = await leerMarca();
    return json({ ok: true, ...(r && !r.respuestas ? r : {}), ...(comoCliente ? vistaPublica(m) : { marca: m }), progreso: progresoTotal(m) });
  } catch (e) {
    return errorResponse(e);
  }
}
