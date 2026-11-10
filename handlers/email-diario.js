// 📬 Email diario evergreen (solo los clientes de CLIENTES_EMAIL_DIARIO; hoy, Discendo).
//   GET  /api/email-diario?mes=AAAA-MM            → { estado, emails (del mes y una semana a cada lado), registro, hoy,
//        manana, admin }. Actualiza antes las métricas de lo ya enviado.
//   GET  /api/email-diario?audiencia=1            → { contactos (de la etiqueta de audiencia), etiquetas } (de GHL)
//   GET  /api/email-diario?key=DIGEST_KEY&c=<cliente>&tarea=programar → tarea de las 20:00 (cron-job.org): programa
//        en GHL el email aprobado de mañana, en lotes (o lo simula). tarea=revisar → aviso si mañana aún no está listo.
//   POST { op: 'email', dia, email }      → guarda el texto de un día (vuelve a borrador si estaba aprobado)
//   POST { op: 'saltar', dia, skip }      → salta o reactiva un día
//   POST { op: 'aprobar' | 'desaprobar', dia }       → solo admin
//   POST { op: 'ajustes', config?, entregables?, ctas?, bloqueos? } → solo admin
//   POST { op: 'programar-ahora' | 'simular' }       → solo admin: la tarea de las 20:00 ahora (o solo simularla)
import { requireSession, fallaClaveTarea } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { clienteActual } from '../lib/cliente.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { conEmailDiario, sumarDias } from '../public/js/email-diario.js';
import { leerEstado, guardarEstado, emailsEntre, guardarEmail, aprobar, quitarAprobacion, leerRegistro, tareaProgramar, tareaRevisar, actualizarMetricas, hoyMadrid } from '../lib/email-diario.js';
import { countByTag, listTags } from '../lib/ghl.js';

const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const noDisponible = () => json({ error: 'El email diario no está activado en este cliente.' }, 404);
const quienEs = (s) => s.user?.nombre || s.user?.email || (s.role === 'admin' ? 'Admin' : 'Equipo');
const soloAdmin = (s) => { if (s.role !== 'admin') throw json({ error: 'Solo una persona admin puede hacer esto.' }, 403); };

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.has('tarea')) {
      const malaClave = fallaClaveTarea(url.searchParams.get('key'), env.DIGEST_KEY);
      if (malaClave) return json({ error: malaClave }, 401);
      if (!conEmailDiario(clienteActual().id)) return noDisponible();
      const tarea = url.searchParams.get('tarea');
      if (tarea === 'revisar') return json(await tareaRevisar());
      if (tarea !== 'programar') return json({ error: 'Tarea desconocida (programar o revisar)' }, 400);
      const r = await tareaProgramar();
      const m = await actualizarMetricas().catch((e) => ({ error: e.message }));
      return json({ ...r, metricas: m });
    }
    const s = await requireSession(request);
    if (!conEmailDiario(clienteActual().id)) return noDisponible();
    if (url.searchParams.has('audiencia')) {
      const { config } = await leerEstado();
      const [contactos, etiquetas] = await Promise.all([config.audienceTag ? countByTag(config.audienceTag) : null, listTags()]);
      return json({ contactos, etiquetas });
    }
    const hoy = hoyMadrid();
    const mes = MES_RE.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : hoy.slice(0, 7);
    await actualizarMetricas().catch((e) => console.error('Email diario: métricas', e.message));
    const [estado, emails, registro] = await Promise.all([leerEstado(), emailsEntre(sumarDias(`${mes}-01`, -7), sumarDias(`${mes}-28`, 10)), leerRegistro()]);
    return json({ estado, emails, registro, hoy, manana: sumarDias(hoy, 1), mes, admin: s.role === 'admin' });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const s = await requireSession(request);
    if (!conEmailDiario(clienteActual().id)) return noDisponible();
    const body = await readBody(request);
    const dia = String(body.dia || '');
    const quien = quienEs(s);
    switch (body.op) {
      case 'email': return json({ email: await guardarEmail(dia, body.email || {}, { quien }) });
      case 'saltar': return json({ email: await guardarEmail(dia, { skip: Boolean(body.skip) }, { quien }) });
      case 'aprobar': soloAdmin(s); return json({ email: await aprobar(dia, quien) });
      case 'desaprobar': soloAdmin(s); return json({ email: await quitarAprobacion(dia, quien) });
      case 'ajustes': soloAdmin(s); return json({ estado: await guardarEstado(body) });
      case 'programar-ahora': soloAdmin(s); return json({ resultado: await tareaProgramar(), registro: await leerRegistro() });
      case 'simular': soloAdmin(s); return json({ resultado: await tareaProgramar({ simular: true }), registro: await leerRegistro() });
      default: return json({ error: 'Operación desconocida' }, 400);
    }
  } catch (e) {
    return errorResponse(e);
  }
}
