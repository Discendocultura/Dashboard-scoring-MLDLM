// Informe diario por email (Configuración → Informes).
//   GET  /api/informe-diario?key=DIGEST_KEY&c=<cliente> → tarea de cada mañana (cron-job.org): envía los pendientes
//   GET  /api/informe-diario?l=<código> → vista previa { asunto, fase, html } con los datos hasta ayer
//   POST { l } → lo envía ahora a los emails de la pestaña
import { requireSession, fallaClaveTarea } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { getConfig } from '../lib/config-store.js';
import { prepararInforme, enviarInformeAhora, informesDiariosPendientes } from '../lib/informe-diario.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    // Tarea programada (va aparte de la del resumen: cada una descarga los leads y no deben pasar juntas
    // del límite de peticiones de Cloudflare).
    if (url.searchParams.has('key')) {
      const falla = fallaClaveTarea(url.searchParams.get('key'), env.DIGEST_KEY);
      if (falla) return json({ error: 'No autorizado', motivo: falla }, 401);
      return json(await informesDiariosPendientes(url.origin));
    }
    // La vista previa lleva todas las cifras: además de configurar, hay que poder ver Métricas.
    await requireSession(request, { permiso: 'config' });
    await requireSession(request, { permiso: 'metricas' });
    const code = url.searchParams.get('l') || '';
    const config = await getConfig();
    if (!config.launches[code]) return json({ error: 'Lanzamiento no encontrado' }, 404);
    const inf = await prepararInforme(config, code, { url: `${url.origin}/`, guardarFoto: false });
    return json({ asunto: inf.asunto, fase: inf.fase, html: inf.html });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    return json(await enviarInformeAhora(String(body.l || ''), new URL(request.url).origin));
  } catch (e) {
    return errorResponse(e);
  }
}
