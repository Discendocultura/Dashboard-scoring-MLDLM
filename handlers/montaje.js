// 🚀 Montaje con IA (Crear → Montaje), para todos los clientes. Permiso de configuración; aprobar y reabrir, solo admin.
//   GET  /api/montaje?l=<código>                 → { montaje, admin, nombre, brief: { [fase]: encargo para Claude }, piezas: { [fase]: [...] } }
//   GET  /api/montaje?resumen=<c1,c2…>           → { resumenes: { código: { texto, n, estado, hecho } } } (menú lateral)
//   POST { op: 'empezar', l }                    → empieza el montaje (sin nada hecho)
//   POST { op: 'guardar', l, fase, piezas, nota?, listo? } → lo que edita una persona
//   POST { op: 'aprobar' | 'reabrir', l, fase }  → solo admin
//   POST { op: 'cambios', l, fase, texto }       → pide cambios a la IA
import { requireSession } from '../lib/auth.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { leerMontaje, empezar, guardarFase, aprobarFase, pedirCambios, reabrirFase, ctxBrief, resumenes } from '../lib/montaje.js';
import { FASES, briefFase, piezasDe } from '../public/js/montaje.js';

const quienEs = (s) => s.user?.nombre || s.user?.email || (s.role === 'admin' ? 'Admin' : 'Equipo');
const soloAdmin = (s) => { if (s.role !== 'admin') throw json({ error: 'Solo una persona admin puede aprobar o reabrir una fase.' }, 403); };

export async function GET(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const url = new URL(request.url);
    if (url.searchParams.has('resumen')) {
      const codes = String(url.searchParams.get('resumen') || '').split(',').map((c) => c.trim()).filter(Boolean);
      return json({ resumenes: await resumenes(codes) });
    }
    const code = url.searchParams.get('l') || '';
    const { montaje, l } = await leerMontaje(code);
    const ctx = await ctxBrief(code);
    const brief = Object.fromEntries(FASES.map((f) => [f.id, briefFase(f.id, montaje, ctx)]));
    const piezas = Object.fromEntries(FASES.map((f) => [f.id, piezasDe(f.id, ctx)]));
    return json({ montaje, admin: s.role === 'admin', brief, piezas, nombre: l.name || code });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    const code = String(body.l || '');
    const fase = String(body.fase || '');
    const quien = quienEs(s);
    switch (body.op) {
      case 'empezar': return json({ montaje: await empezar(code, quien) });
      case 'guardar': return json(await guardarFase(code, fase, { piezas: body.piezas || {}, nota: body.nota, listo: Boolean(body.listo) }, { quien, origen: 'persona' }));
      case 'aprobar': soloAdmin(s); return json({ montaje: await aprobarFase(code, fase, quien) });
      case 'reabrir': soloAdmin(s); return json({ montaje: await reabrirFase(code, fase, quien) });
      case 'cambios': return json({ montaje: await pedirCambios(code, fase, body.texto, quien) });
      default: return json({ error: 'Operación desconocida' }, 400);
    }
  } catch (e) {
    return errorResponse(e);
  }
}
