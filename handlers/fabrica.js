// Fábrica de anuncios (Crear → Anuncios → 🏭 Fábrica de variaciones). Ver public/js/fabrica.js.
//   GET  /api/fabrica                         → (equipo: Configuración, Ganadores o Métricas) { lotes } (los últimos 30)
//   GET  /api/fabrica?creatividades=<ids>     → { creatividades: { [ad_id]: { tipo, imagen, miniatura, video, texto, … } } }
//        (como mucho 100 anuncios; la imagen o el vídeo de cada ganador, desde Meta)
//   POST /api/fabrica { op: 'guardar', lote } → («config») crea o cambia un lote → { lote }
//   POST /api/fabrica { op: 'borrar', id }    → («config») lo quita
//   POST /api/fabrica { op: 'estado', id, estado, drive } → («config») pendiente / hecho, con el enlace de la carpeta de Drive
// Claude lee los lotes con la herramienta «lote_anuncios» del conector (lib/mcp-tools.js) y crea las variaciones con
// Magnific y Google Drive: AlquimIA no genera imágenes ni vídeos.
import { requireSession } from '../lib/auth.js';
import { leerJSON, guardarJSON, reintentando } from '../lib/store.js';
import { creatividadesMeta } from '../lib/meta.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { sanitizeLote } from '../public/js/fabrica.js';

export const CLAVE_LOTES = 'lsd_fabrica_lotes';
const MAX_LOTES = 30;
const PERMISO_VER = ['config', 'avatar', 'metricas'];
export const leerLotes = async () => ((await leerJSON(CLAVE_LOTES, () => ({ lotes: [] }))) || { lotes: [] }).lotes || [];

// Cambiar un lote ya guardado (estado y enlace de Drive): lo usan este handler y el conector de Claude.
export async function marcarLote(id, { estado, drive } = {}) {
  return reintentando(async () => {
    const dato = (await leerJSON(CLAVE_LOTES, () => ({ lotes: [] }))) || { lotes: [] };
    const l = (dato.lotes || []).find((x) => x.id === id);
    if (!l) throw Object.assign(new Error('Ese lote no existe'), { status: 404, publicMessage: 'Ese lote no existe' });
    const nuevo = sanitizeLote({ ...l, ...(estado ? { estado } : {}), ...(drive != null ? { drive } : {}), ...(estado === 'hecho' ? { hecho: Date.now() } : {}) });
    Object.assign(l, nuevo, estado === 'hecho' ? { hecho: Date.now() } : {});
    await guardarJSON(CLAVE_LOTES, dato, { motivo: `Fábrica de anuncios: lote «${l.nombre}» ${l.estado}` });
    return l;
  });
}

export async function GET(request) {
  try {
    await requireSession(request, { permiso: PERMISO_VER });
    const ids = new URL(request.url).searchParams.get('creatividades');
    // Nunca un error: lo que se pueda traer y, si algo falla, el motivo (para que el panel lo diga).
    if (ids != null) {
      const avisos = [];
      try { return json({ creatividades: await creatividadesMeta(ids.split(','), { avisos }), aviso: avisos.join(' · ') }); } catch (e) {
        console.error('Fábrica · creatividades', e);
        return json({ creatividades: {}, aviso: e.publicMessage || String(e.message || e).replace(/access_token=[^&\s]+/g, '…').slice(0, 300) });
      }
    }
    return json({ lotes: (await leerLotes()).slice(-MAX_LOTES).reverse() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    if (body.op === 'guardar') {
      const lote = sanitizeLote({ ...(body.lote || {}), por: s.user?.nombre || s.user?.email || s.role });
      if (!lote.items.length) return json({ error: 'Elige al menos un anuncio ganador' }, 400);
      const r = await reintentando(async () => {
        const dato = (await leerJSON(CLAVE_LOTES, () => ({ lotes: [] }))) || { lotes: [] };
        const lotes = (dato.lotes || []).filter((x) => x.id !== lote.id);
        lotes.push(lote);
        await guardarJSON(CLAVE_LOTES, { lotes: lotes.slice(-MAX_LOTES) }, { motivo: `Fábrica de anuncios: lote «${lote.nombre}»` });
        return lote;
      });
      return json({ lote: r });
    }
    if (body.op === 'borrar') {
      await reintentando(async () => {
        const dato = (await leerJSON(CLAVE_LOTES, () => ({ lotes: [] }))) || { lotes: [] };
        await guardarJSON(CLAVE_LOTES, { lotes: (dato.lotes || []).filter((x) => x.id !== body.id) }, { motivo: 'Fábrica de anuncios: lote borrado' });
      });
      return json({ ok: true });
    }
    if (body.op === 'estado') {
      const l = await marcarLote(String(body.id || ''), { estado: body.estado === 'hecho' ? 'hecho' : 'pendiente', drive: body.drive });
      return json({ lote: l });
    }
    return json({ error: 'Operación desconocida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
