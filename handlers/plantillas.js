// Plantillas de embudo de la agencia (solo superadmin): se guarda un embudo de un cliente y se aplica
// a otro con un clic, sin configurar todo desde cero.
//   GET  /api/plantillas                                   → lista
//   POST { op: 'guardar', embudo, nombre, desc }           → plantilla a partir de un embudo del cliente actual
//   POST { op: 'aplicar', id, nombre, mensajes?, habituales? } → crea el embudo en el cliente actual
//        (mensajes / habituales: false = no sustituir los del cliente)
//   POST { op: 'borrar', id }
// Una plantilla lleva: tipo y formato, pestañas, mensajes de WhatsApp, tareas habituales (lanzamientos),
// la base de los lanzamientos (precios, textos y barra de la página) o la configuración de la VSL sin
// lo propio del cliente (etiquetas, enlaces, campos de GHL).
import { requireSuperadmin } from '../lib/auth.js';
import { getConfig, saveConfig, sanitizeBase, EMBUDO_ID_RE } from '../lib/config-store.js';
import { getHabituales, saveHabituales } from '../lib/habituales.js';
import { leerJSON, guardarJSON, reintentando, versionDe } from '../lib/store.js';
import { clienteActual } from '../lib/cliente.js';
import { newId } from '../lib/users.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const NAME = 'lsd_plantillas';
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
// De la VSL solo pasa lo que no es del cliente.
const VSL_PLANTILLA = ['subtipo', 'botonSegundos', 'textoCompra', 'textoLlamada', 'precioPrograma', 'precioFraccionado', 'llamadasPipeline'];

const listar = () => leerJSON(NAME, () => []);
const resumen = (p) => ({ id: p.id, nombre: p.nombre, desc: p.desc, tipo: p.tipo, formato: p.formato, subtipo: p.vsl?.subtipo || null, pestanas: p.pestanas, origen: p.origen, creada: p.creada, mensajes: Object.keys(p.mensajes || {}).length, habituales: (p.habituales || []).length });

export async function GET(request) {
  try {
    await requireSuperadmin(request);
    return json({ plantillas: (await listar()).map(resumen) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSuperadmin(request);
    const body = await readBody(request);
    if (body.op === 'guardar') {
      const config = await getConfig({ fresh: true });
      const e = config.embudos.find((x) => x.id === body.embudo);
      if (!e) throw bad('Embudo no encontrado', 404);
      const p = {
        id: newId('p'), nombre: String(body.nombre || e.nombre).trim().slice(0, 60), desc: String(body.desc || '').trim().slice(0, 300),
        tipo: e.tipo, formato: e.formato || null, clases: e.clases || null, vip: e.vip, preclase: e.preclase, pestanas: e.pestanas || null,
        mensajes: { ...config.templates },
        origen: clienteActual().nombre, creada: new Date().toISOString(), por: s.user?.nombre || 'superadmin',
      };
      if (e.tipo === 'lanzamientos') {
        const ultimo = Object.values(config.launches).filter((l) => l.embudo === e.id)
          .sort((a, b) => String(b.inicioCaptacion || b.createdAt).localeCompare(String(a.inicioCaptacion || a.createdAt)))[0];
        p.base = sanitizeBase(ultimo || e.base || {});
        p.habituales = await getHabituales();
      } else {
        const v = config.vsls[e.id] || {};
        p.vsl = Object.fromEntries(VSL_PLANTILLA.map((k) => [k, v[k] ?? '']));
      }
      await reintentando(async () => {
        const lista = await listar();
        if (lista.length >= 50) throw bad('Máximo 50 plantillas');
        lista.unshift(p);
        await guardarJSON(NAME, lista, { motivo: `Plantilla «${p.nombre}»` });
      });
      return json({ plantilla: resumen(p) });
    }
    if (body.op === 'borrar') {
      await reintentando(async () => {
        const lista = await listar();
        await guardarJSON(NAME, lista.filter((x) => x.id !== body.id), { motivo: 'Plantilla borrada', version: versionDe(lista) });
      });
      return json({ ok: true });
    }
    if (body.op === 'aplicar') {
      const p = (await listar()).find((x) => x.id === body.id);
      if (!p) throw bad('Plantilla no encontrada', 404);
      const nombre = String(body.nombre || p.nombre).trim().slice(0, 40) || p.nombre;
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        const usados = new Set([...actual.embudos.map((e) => e.id), ...Object.keys(actual.launches)]);
        const baseId = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || (p.tipo === 'vsl' ? 'vsl' : 'lanz');
        let id = /^[a-z]/.test(baseId) ? baseId : `e-${baseId}`.slice(0, 20);
        for (let n = 2; usados.has(id) || !EMBUDO_ID_RE.test(id); n++) id = `${baseId.slice(0, 18)}-${n}`.replace(/^[^a-z]/, 'e');
        const embudo = { id, tipo: p.tipo, nombre, ...(p.formato ? { formato: p.formato } : {}), ...(p.clases ? { clases: p.clases } : {}), ...(p.vip === false ? { vip: false } : {}), ...(p.preclase === false ? { preclase: false } : {}), ...(p.pestanas ? { pestanas: p.pestanas } : {}), ...(p.base ? { base: p.base } : {}) };
        const next = {
          ...actual,
          embudos: [...actual.embudos, embudo],
          templates: body.mensajes === false ? actual.templates : { ...actual.templates, ...(p.mensajes || {}) },
          vsls: p.tipo === 'vsl' ? { ...actual.vsls, [id]: { ...(p.vsl || {}), name: nombre } } : actual.vsls,
        };
        const saved = await saveConfig(next, { version: versionDe(actual), motivo: `Embudo desde la plantilla «${p.nombre}»` });
        return { saved, id };
      });
      if (p.habituales?.length && body.habituales !== false) await saveHabituales(p.habituales);
      return json({ config: config.saved, embudo: config.id, version: versionDe(config.saved) });
    }
    throw bad('Operación no válida');
  } catch (e) {
    return errorResponse(e);
  }
}
