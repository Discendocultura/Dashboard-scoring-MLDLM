import { requireRole, requireSession, tienePermiso } from '../lib/auth.js';
import { PERMISOS_DATOS } from '../public/js/roles.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { zoomConfigured } from '../lib/zoom.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { versionDe, reintentando } from '../lib/store.js';

const EQUIPO_FIELDS = ['name', 'inicioCaptacion', 'finCaptacion', 'fechaDirecto', 'horaDirecto', 'clase1At', 'clase2At', 'replayAt', 'aperturaCarrito', 'cierreCarrito', 'createdAt', 'formato', 'videos', 'embudo', 'clase3At', 'nClases', 'vip'];
function equipoConfig(config) {
  const launches = {};
  for (const [code, l] of Object.entries(config.launches)) launches[code] = Object.fromEntries(EQUIPO_FIELDS.map((k) => [k, l[k] ?? '']));
  return { launches, templates: {}, accesos: [], digestEmail: '', marca: { producto: config.marca?.producto || '' }, defaultCountryCode: config.defaultCountryCode, vsls: Object.fromEntries(Object.entries(config.vsls || {}).map(([id, v]) => [id, { name: v.name }])), embudos: config.embudos };
}

export async function GET(request) {
  try {
    const ses = await requireSession(request, { cliente: true });
    const role = ses.role;
    const config = await getConfig({ fresh: new URL(request.url).searchParams.has('fresh') });
    // El equipo solo ve las tareas: le basta con el nombre y las fechas de cada lanzamiento.
    // `version`: el navegador la devuelve al guardar, para no pisar lo que otra persona guardó entretanto.
    const version = versionDe(config);
    if (!tienePermiso(ses, [...PERMISOS_DATOS, 'config', 'carrito'])) return json({ role, config: equipoConfig(config), zoomConfigured: false, version });
    return json({ role, config, zoomConfigured: zoomConfigured(), version });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    // Solo los mensajes de WhatsApp (Setting hoy): basta con el permiso «Editar mensajes de WhatsApp».
    if (body.op === 'plantillas') {
      await requireRole(request, { permiso: 'mensajes' });
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        const templates = { ...actual.templates };
        for (const k of Object.keys(templates)) if (typeof body.templates?.[k] === 'string') templates[k] = body.templates[k];
        return saveConfig({ ...actual, templates, defaultCountryCode: body.defaultCountryCode ?? actual.defaultCountryCode }, { version: versionDe(actual), motivo: 'Mensajes de WhatsApp' });
      });
      return json({ templates: config.templates, defaultCountryCode: config.defaultCountryCode, version: versionDe(config) });
    }
    // Marca del cliente (Equipo → Marca): producto, colores y encuesta del avatar. Solo admin.
    if (body.op === 'marca') {
      await requireRole(request, { admin: true });
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        return saveConfig({ ...actual, marca: body.marca ?? actual.marca, encuesta: body.encuesta ?? actual.encuesta }, { version: versionDe(actual), motivo: 'Marca del cliente' });
      });
      return json({ config, version: versionDe(config) });
    }
    const rol = await requireRole(request, { permiso: 'config' });
    // Pesos de la puntuación (Métricas → Vídeos y conversión → «Qué predice la compra»). null = de serie.
    if (body.op === 'pesos') {
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        return saveConfig({ ...actual, pesosScore: body.pesos ?? null }, { version: versionDe(actual), motivo: body.pesos ? 'Pesos de la puntuación' : 'Pesos de la puntuación de serie' });
      });
      return json({ config, version: versionDe(config) });
    }
    // Logo del lanzamiento (Plan → Anuncios): URL de la imagen, para los anuncios de captación.
    if (body.op === 'logoLanzamiento') {
      const code = String(body.l || '');
      const url = String(body.url || '').trim();
      if (url && !/^https:\/\/\S+$/i.test(url)) return json({ error: 'El enlace del logo debe empezar por https://' }, 400);
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: { ...actual.launches[code], logoUrl: url } } }, { version: versionDe(actual), motivo: 'Logo del lanzamiento' });
      });
      return json({ config, version: versionDe(config) });
    }
    // Objetivos y supuestos de la calculadora de un lanzamiento (pestaña Plan → Planificador).
    if (body.op === 'objetivos') {
      const code = String(body.l || '');
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        const l = { ...actual.launches[code], objetivos: body.objetivos ?? actual.launches[code].objetivos, calculadora: body.calculadora ?? actual.launches[code].calculadora };
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: l } }, { version: versionDe(actual), motivo: 'Objetivos' });
      });
      return json({ config, version: versionDe(config) });
    }
    // Calculadora: los lanzamientos anteriores metidos a mano, guardados en su embudo.
    if (body.op === 'historico') {
      const id = String(body.embudo || '');
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.embudos.some((e) => e.id === id && e.tipo === 'lanzamientos')) throw Object.assign(new Error('Embudo no encontrado'), { status: 404, publicMessage: 'Embudo no encontrado' });
        const embudos = actual.embudos.map((e) => (e.id === id ? { ...e, historico: Array.isArray(body.historico) ? body.historico : [] } : e));
        return saveConfig({ ...actual, embudos }, { version: versionDe(actual), motivo: 'Histórico de la calculadora' });
      });
      return json({ config, version: versionDe(config) });
    }
    // Si no vienen los embudos (p. ej. un navegador con la versión anterior), se conservan los guardados.
    const actual = !('vsls' in body) || !('embudos' in body) || rol !== 'admin' ? await getConfig({ fresh: true }) : null;
    // La marca, la encuesta del avatar y el email del resumen diario solo los cambia un admin.
    if (rol !== 'admin') Object.assign(body, { marca: actual.marca, encuesta: actual.encuesta, digestEmail: actual.digestEmail });
    // Con `_version` (la que tenía el navegador): si otra persona guardó después, se avisa en vez de pisarlo.
    const version = Number.isInteger(body._version) ? body._version : null;
    const config = await saveConfig(
      actual ? { vsls: 'vsls' in body ? body.vsls : actual.vsls, embudos: 'embudos' in body ? body.embudos : actual.embudos, ...body, ...('vsl' in body && !('vsls' in body) ? { vsls: { ...actual.vsls, vsl: body.vsl } } : {}) } : body,
      { version },
    );
    return json({ config, version: versionDe(config) });
  } catch (e) {
    return errorResponse(e);
  }
}
