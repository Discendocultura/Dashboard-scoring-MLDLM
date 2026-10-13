// Biblioteca de procesos de la agencia (solo superadmin; común a todos los clientes). Cada proceso es como
// una tarea de Asana: responsable, fecha (que puede repetirse), descripción, subtareas, comentarios y actividad.
//   GET  /api/procesos                         → { secciones, procesos, equipo: [{ id, nombre, foto }], yo, proyectos: [{ id, nombre, color }] }
//   Cada proceso es general (para todos los proyectos) o de uno o varios proyectos (clientes del dashboard).
//   POST { op: 'nuevo', seccion, titulo }      → proceso nuevo
//   POST { op: 'campos', id, campos }          → título, sección, descripción (html), proyectos, responsable, fecha, repetir
//   POST { op: 'proyectos-lote', ids, proyectos } → varios procesos a la vez a esos proyectos ([] = generales)
//   POST { op: 'hecho', id, hecho }            → si se repite, pasa a la próxima fecha (y las subtareas se reinician)
//   POST { op: 'subtarea', id, sid?, texto?, hecha?, borrar? }
//   POST { op: 'comentar', id, texto } · { op: 'comentario-borrar', id, cid }
//   POST { op: 'borrar', id } · { op: 'seccion', titulo } · { op: 'importar', biblioteca }
import { requireSuperadmin } from '../lib/auth.js';
import { leerJSON, guardarJSON, reintentando, conVersion } from '../lib/store.js';
import { listUsersRaw } from '../lib/users.js';
import { listClientes } from '../lib/clientes.js';
import { sanitizeBiblioteca, sanitizeProceso, fusionar, idSeccion, proximaTrasHecho, textoRepetir, nuevoIdProceso, nuevoIdCorto, MAX_PROCESOS, MAX_SECCIONES, MAX_SUBTAREAS, MAX_COMENTARIOS } from '../public/js/procesos.js';
import { dayInMadrid } from '../public/js/scoring.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const NAME = 'lsd_procesos';
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, publicMessage: msg });
const leer = async () => sanitizeBiblioteca(await leerJSON(NAME, () => ({})));
const equipo = async () => (await listUsersRaw()).filter((u) => (u.agencia || u.superadmin) && u.activo !== false).map((u) => ({ id: u.id, nombre: u.nombre, foto: u.foto || null }));
const proyectos = async () => (await listClientes()).map((c) => ({ id: c.id, nombre: c.nombre, color: c.color || '' }));
const fechaTxt = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'sin fecha');

export async function GET(request) {
  try {
    const s = await requireSuperadmin(request);
    const [b, eq, pr] = await Promise.all([leer(), equipo(), proyectos()]);
    return json({ ...b, equipo: eq, yo: s.uid || '', proyectos: pr });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSuperadmin(request);
    const body = await readBody(request);
    const por = s.user?.nombre || 'Admin';
    const ahora = new Date().toISOString();
    const hoy = dayInMadrid(ahora);
    const eq = ['campos'].includes(body.op) ? await equipo() : [];
    const prs = ['campos', 'proyectos-lote'].includes(body.op) ? await proyectos() : [];
    const nombresProy = (ids) => (ids.length ? ids.map((id) => prs.find((x) => x.id === id)?.nombre || id).join(', ') : 'general (todos los proyectos)');
    const soloExistentes = (ids) => (Array.isArray(ids) ? ids : []).filter((id) => prs.some((x) => x.id === id));
    let extra = {};
    const out = await reintentando(async () => {
      const raw = await leerJSON(NAME, () => ({}));
      let b = sanitizeBiblioteca(raw);
      const buscar = () => {
        const p = b.procesos.find((x) => x.id === body.id);
        if (!p) throw bad('Proceso no encontrado', 404);
        return p;
      };
      const anotar = (p, txt) => { p.actividad.push({ en: ahora, por, txt }); p.actualizado = ahora; p.por = por; };
      if (body.op === 'nuevo') {
        if (b.procesos.length >= MAX_PROCESOS) throw bad(`Como mucho ${MAX_PROCESOS} procesos.`);
        const p = sanitizeProceso({ id: nuevoIdProceso(), seccion: body.seccion, titulo: body.titulo || 'Proceso nuevo', actualizado: ahora, por }, b.secciones);
        p.actividad.push({ en: ahora, por, txt: 'creó el proceso' });
        b.procesos.push(p);
        extra = { proceso: p };
      } else if (body.op === 'campos') {
        const p = buscar();
        const c = { ...(body.campos || {}) };
        if ('proyectos' in c) c.proyectos = soloExistentes(c.proyectos);
        const nuevo = sanitizeProceso({ ...p, ...c, id: p.id }, b.secciones);
        if ('titulo' in c && nuevo.titulo !== p.titulo) anotar(p, `cambió el título a «${nuevo.titulo}»`);
        if ('seccion' in c && nuevo.seccion !== p.seccion) anotar(p, `lo movió a «${b.secciones.find((x) => x.id === nuevo.seccion)?.titulo || ''}»`);
        if ('html' in c && nuevo.html !== p.html) anotar(p, 'cambió la descripción');
        if ('proyectos' in c && nuevo.proyectos.join() !== p.proyectos.join()) anotar(p, `lo puso en ${nombresProy(nuevo.proyectos)}`);
        if ('responsable' in c && nuevo.responsable !== p.responsable) anotar(p, nuevo.responsable ? `asignó a ${eq.find((u) => u.id === nuevo.responsable)?.nombre || 'alguien'}` : 'quitó el responsable');
        if ('fecha' in c && nuevo.fecha !== p.fecha) anotar(p, nuevo.fecha ? `puso la fecha el ${fechaTxt(nuevo.fecha)}` : 'quitó la fecha');
        if ('repetir' in c && JSON.stringify(nuevo.repetir) !== JSON.stringify(p.repetir)) anotar(p, nuevo.repetir.tipo ? `hizo que se repita: ${textoRepetir(nuevo.repetir).toLowerCase()}` : 'quitó la repetición');
        Object.assign(p, { titulo: nuevo.titulo, seccion: nuevo.seccion, html: nuevo.html, proyectos: nuevo.proyectos, responsable: nuevo.responsable, fecha: nuevo.fecha, repetir: nuevo.repetir });
        extra = { proceso: p };
      } else if (body.op === 'proyectos-lote') {
        const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
        const lista = soloExistentes(body.proyectos);
        let n = 0;
        for (const p of b.procesos) {
          if (!ids.has(p.id) || p.proyectos.join() === lista.join()) continue;
          p.proyectos = lista;
          anotar(p, `lo puso en ${nombresProy(lista)}`);
          n++;
        }
        extra = { cambiados: n };
      } else if (body.op === 'hecho') {
        const p = buscar();
        if (body.hecho !== false && p.repetir.tipo && p.fecha) {
          const sig = proximaTrasHecho(p.fecha, p.repetir, hoy);
          anotar(p, `lo marcó como hecho (${fechaTxt(p.fecha)}); el siguiente, el ${fechaTxt(sig)}`);
          p.fecha = sig;
          p.hechoEn = ahora;
          p.subtareas.forEach((x) => { x.hecha = false; });
        } else {
          p.hecho = body.hecho !== false;
          p.hechoEn = p.hecho ? ahora : '';
          anotar(p, p.hecho ? 'lo marcó como hecho' : 'lo marcó como pendiente');
        }
        extra = { proceso: p };
      } else if (body.op === 'subtarea') {
        const p = buscar();
        if (!body.sid) {
          const texto = String(body.texto || '').trim().slice(0, 300);
          if (!texto) throw bad('Escribe la subtarea.');
          if (p.subtareas.length >= MAX_SUBTAREAS) throw bad(`Como mucho ${MAX_SUBTAREAS} subtareas.`);
          p.subtareas.push({ id: nuevoIdCorto(), texto, hecha: false });
          anotar(p, `añadió la subtarea «${texto.slice(0, 80)}»`);
        } else {
          const st = p.subtareas.find((x) => x.id === body.sid);
          if (!st) throw bad('Subtarea no encontrada', 404);
          if (body.borrar) { p.subtareas = p.subtareas.filter((x) => x !== st); anotar(p, `quitó la subtarea «${st.texto.slice(0, 80)}»`); } else {
            if ('texto' in body && String(body.texto).trim()) st.texto = String(body.texto).trim().slice(0, 300);
            if ('hecha' in body && Boolean(body.hecha) !== st.hecha) { st.hecha = Boolean(body.hecha); anotar(p, `${st.hecha ? 'completó' : 'reabrió'} la subtarea «${st.texto.slice(0, 80)}»`); }
          }
        }
        extra = { proceso: p };
      } else if (body.op === 'comentar') {
        const p = buscar();
        const texto = String(body.texto || '').trim().slice(0, 4000);
        if (!texto) throw bad('Escribe el comentario.');
        p.comentarios.push({ id: nuevoIdCorto(), porId: s.uid || '', por, en: ahora, texto });
        if (p.comentarios.length > MAX_COMENTARIOS) p.comentarios = p.comentarios.slice(-MAX_COMENTARIOS);
        extra = { proceso: p };
      } else if (body.op === 'comentario-borrar') {
        const p = buscar();
        p.comentarios = p.comentarios.filter((c) => c.id !== body.cid);
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
        if (!body.biblioteca?.procesos?.length) throw bad('El archivo no trae procesos.');
        const r = fusionar(b, body.biblioteca);
        b = r.biblioteca;
        extra = { nuevos: r.nuevos, actualizados: r.actualizados };
      } else throw bad('Operación no válida');
      b = sanitizeBiblioteca(b);
      await guardarJSON(NAME, conVersion(b, raw), { motivo: `Biblioteca de procesos (${body.op})` });
      if (extra.proceso) extra.proceso = b.procesos.find((x) => x.id === extra.proceso.id) || null;
      return b;
    });
    return json({ ...out, ...extra });
  } catch (e) {
    return errorResponse(e);
  }
}
