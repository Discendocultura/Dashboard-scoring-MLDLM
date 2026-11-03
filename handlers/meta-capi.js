// Conexiones → Meta · Conversions API (permiso de configuración).
//   GET                                   → { config, eventos, token: { hay, origen, final }, log }
//   GET  ?key=DIGEST_KEY[&c=]             → tarea programada (cada 30-60 min): señales de calidad (lib/meta-capi-senales.js)
//   POST { op: 'guardar', metaCapi }      → guarda el píxel, los eventos y el código de prueba
//   POST { op: 'token', token }           → guarda el token de la Conversions API (cifrado; no se vuelve a mostrar)
//   POST { op: 'quitar-token' }           → lo borra
//   POST { op: 'comprobar', metaCapi? }   → ¿este token puede escribir en este píxel? (no manda ningún evento)
//   POST { op: 'prueba', metaCapi? }      → manda «PruebaAlquimIA» con tu email y tu navegador (para verlo en «Probar eventos»)
//   POST { op: 'csv', filas }             → clientes de un CSV: compras de los últimos 7 días a Meta + audiencia con su valor
import { requireSession, fallaClaveTarea } from '../lib/auth.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { reintentando, versionDe } from '../lib/store.js';
import { EVENTOS_CAPI, sanitizeMetaCapi, tokenCapi, guardarTokenCapi, quitarTokenCapi, comprobarConexion, ultimosEnvios, enviarEventoMeta, datosNavegador, importarClientesCsv } from '../lib/meta-capi.js';
import { enviarSenales } from '../lib/meta-capi-senales.js';
import { env } from '../lib/env.js';
import { json, readBody, errorResponse } from '../lib/http.js';

const infoToken = async () => { const t = await tokenCapi(); return { hay: Boolean(t.token), origen: t.origen, final: t.final }; };

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.has('key')) {
      const falla = fallaClaveTarea(url.searchParams.get('key') || '', env.DIGEST_KEY);
      if (falla) return json({ error: 'No autorizado', motivo: falla }, 401);
      return json(await enviarSenales());
    }
    await requireSession(request, { permiso: 'config' });
    const config = await getConfig({ fresh: true });
    return json({ config: sanitizeMetaCapi(config.metaCapi), eventos: EVENTOS_CAPI, token: await infoToken(), log: await ultimosEnvios() });
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
    if (body.op === 'token') { await guardarTokenCapi(body.token); return json({ ok: true, token: await infoToken() }); }
    if (body.op === 'quitar-token') { await quitarTokenCapi(); return json({ ok: true, token: await infoToken() }); }
    if (body.op === 'comprobar') {
      const config = body.metaCapi ? await guardar() : await getConfig({ fresh: true });
      return json(await comprobarConexion(sanitizeMetaCapi(config.metaCapi).pixelId));
    }
    if (body.op === 'prueba') {
      const config = body.metaCapi ? await guardar() : await getConfig({ fresh: true });
      const r = await enviarEventoMeta({ tipo: 'prueba', eventId: `prueba-${Date.now()}`, config, url: request.headers.get('referer') || '',
        datos: { email: s.user?.email || '', nombre: s.user?.nombre || '', externalId: s.uid || 'admin', ...datosNavegador(request) } });
      return json({ ...r, config: config.metaCapi });
    }
    if (body.op === 'csv') {
      if (!Array.isArray(body.filas) || !body.filas.length) return json({ error: 'El CSV no trae filas con email y fecha' }, 400);
      return json(await importarClientesCsv(body.filas));
    }
    return json({ error: 'Operación no válida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
