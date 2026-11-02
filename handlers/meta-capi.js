// Conexiones → Meta · Conversions API (permiso de configuración).
//   GET                                   → { config, eventos, token: bool, log }
//   POST { op: 'guardar', metaCapi }      → guarda el píxel, los eventos y el código de prueba
//   POST { op: 'prueba', metaCapi? }      → manda «PruebaAlquimIA» con tu email y tu navegador (para verlo en «Probar eventos»)
import { requireSession } from '../lib/auth.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { reintentando, versionDe } from '../lib/store.js';
import { EVENTOS_CAPI, sanitizeMetaCapi, tokenCapi, ultimosEnvios, enviarEventoMeta, datosNavegador } from '../lib/meta-capi.js';
import { env } from '../lib/env.js';
import { json, readBody, errorResponse } from '../lib/http.js';

export async function GET(request) {
  try {
    await requireSession(request, { permiso: 'config' });
    const config = await getConfig({ fresh: true });
    return json({ config: sanitizeMetaCapi(config.metaCapi), eventos: EVENTOS_CAPI, token: Boolean(tokenCapi()) || env.GHL_MOCK === '1', log: await ultimosEnvios() });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request, { permiso: 'config' });
    const body = await readBody(request);
    const guardar = () => reintentando(async () => {
      const actual = await getConfig({ fresh: true });
      return saveConfig({ ...actual, metaCapi: sanitizeMetaCapi(body.metaCapi) }, { version: versionDe(actual), motivo: 'Meta · Conversions API' });
    });
    if (body.op === 'guardar') { const c = await guardar(); return json({ config: c.metaCapi }); }
    if (body.op === 'prueba') {
      const config = body.metaCapi ? await guardar() : await getConfig({ fresh: true });
      const r = await enviarEventoMeta({ tipo: 'prueba', eventId: `prueba-${Date.now()}`, config, url: request.headers.get('referer') || '',
        datos: { email: s.user?.email || '', nombre: s.user?.nombre || '', externalId: s.uid || 'admin', ...datosNavegador(request) } });
      return json({ ...r, config: config.metaCapi });
    }
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
