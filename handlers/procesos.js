// Biblioteca de procesos de la agencia (solo superadmin; común a todos los clientes).
//   GET  /api/procesos                                   → { secciones, procesos }
//   POST { op: 'guardar', proceso }                      → crea o cambia un proceso
//   POST { op: 'borrar', id }
//   POST { op: 'seccion', titulo }                       → sección nueva
//   POST { op: 'importar', biblioteca }                  → añade y sustituye por id (archivo de Asana)
import { requireSuperadmin } from '../lib/auth.js';
import { leerJSON, guardarJSON, reintentando, conVersion } from '../lib/store.js';
import { sanitizeBiblioteca, sanitizeProceso, fusionar, idSeccion, MAX_PROCESOS, MAX_SECCIONES } from '../public/js/procesos.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const NAME = 'lsd_procesos';
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const leer = async () => sanitizeBiblioteca(await leerJSON(NAME, () => ({})));

export async function GET(request) {
  try {
    await requireSuperadmin(request);
    return json(await leer());
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSuperadmin(request);
    const body = await readBody(request);
    const por = s.user?.nombre || 'superadmin';
    const ahora = new Date().toISOString();
    let extra = {};
    const out = await reintentando(async () => {
      const raw = await leerJSON(NAME, () => ({}));
      let b = sanitizeBiblioteca(raw);
      if (body.op === 'guardar') {
        const p = sanitizeProceso({ ...body.proceso, actualizado: ahora, por }, b.secciones);
        const i = b.procesos.findIndex((x) => x.id === p.id);
        if (i < 0 && b.procesos.length >= MAX_PROCESOS) throw bad(`Como mucho ${MAX_PROCESOS} procesos.`);
        if (i < 0) b.procesos.push(p); else b.procesos[i] = { ...p, asana: b.procesos[i].asana || p.asana };
        extra = { proceso: p };
      } else if (body.op === 'borrar') {
        b.procesos = b.procesos.filter((x) => x.id !== body.id);
      } else if (body.op === 'seccion') {
        const titulo = String(body.titulo || '').trim().slice(0, 60);
        if (!titulo) throw bad('Pon un nombre a la sección.');
        if (b.secciones.length >= MAX_SECCIONES) throw bad(`Como mucho ${MAX_SECCIONES} secciones.`);
        let id = idSeccion(titulo);
        while (b.secciones.some((x) => x.id === id)) id = `${id.slice(0, 36)}-${Math.random().toString(36).slice(2, 4)}`;
        b.secciones.push({ id, titulo });
        extra = { seccion: id };
      } else if (body.op === 'importar') {
        const r = fusionar(b, body.biblioteca);
        if (!body.biblioteca?.procesos?.length) throw bad('El archivo no trae procesos.');
        b = r.biblioteca;
        extra = { nuevos: r.nuevos, actualizados: r.actualizados };
      } else throw bad('Operación no válida');
      await guardarJSON(NAME, conVersion(b, raw), { motivo: `Biblioteca de procesos (${body.op})` });
      return b;
    });
    return json({ ...out, ...extra });
  } catch (e) {
    return errorResponse(e);
  }
}
