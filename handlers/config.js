import { requireRole, requireSession, tienePermiso } from '../lib/auth.js';
import { PERMISOS_DATOS } from '../public/js/roles.js';
import { getConfig, saveConfig } from '../lib/config-store.js';
import { zoomConfigured } from '../lib/zoom.js';
import { sendflowConfigurado } from '../lib/sendflow.js';
import { sanitizeNarrativa } from '../public/js/narrativa.js';
import { sanitizeAutomatizaciones } from '../public/js/automatizaciones.js';
import { claveResumenSetter } from '../lib/setter-ia.js';
import { json, readBody, errorResponse } from '../lib/http.js';
import { versionDe, reintentando, leerJSON } from '../lib/store.js';
import { cargarCatalogo, CLAVE_PRODUCTOS } from '../lib/productos.js';
import { configDeEmbudos } from '../lib/embudos.js';

const EQUIPO_FIELDS = ['name', 'inicioCaptacion', 'finCaptacion', 'fechaDirecto', 'horaDirecto', 'clase1At', 'clase2At', 'replayAt', 'aperturaCarrito', 'cierreCarrito', 'createdAt', 'formato', 'videos', 'embudo', 'clase3At', 'nClases', 'vip'];
function equipoConfig(config) {
  const launches = {};
  for (const [code, l] of Object.entries(config.launches)) launches[code] = Object.fromEntries(EQUIPO_FIELDS.map((k) => [k, l[k] ?? '']));
  return { launches, templates: {}, mensajesEmbudo: {}, accesos: [], digestEmail: '', marca: { producto: config.marca?.producto || '' }, defaultCountryCode: config.defaultCountryCode, setterIa: config.setterIa, vsls: Object.fromEntries(Object.entries(config.vsls || {}).map(([id, v]) => [id, { name: v.name }])), embudos: config.embudos };
}

export async function GET(request) {
  try {
    const ses = await requireSession(request, { cliente: true });
    const role = ses.role;
    const completa = await getConfig({ fresh: new URL(request.url).searchParams.has('fresh') });
    // Con embudos asignados, solo los suyos (el menú lateral, Inicio y los selectores salen ya filtrados).
    const config = configDeEmbudos(completa, ses.embudos);
    // El equipo solo ve las tareas: le basta con el nombre y las fechas de cada lanzamiento.
    // `version`: el navegador la devuelve al guardar, para no pisar lo que otra persona guardó entretanto.
    const version = versionDe(completa);
    if (!tienePermiso(ses, [...PERMISOS_DATOS, 'config', 'carrito'])) return json({ role, config: equipoConfig(config), zoomConfigured: false, version });
    return json({ role, config, zoomConfigured: zoomConfigured(), sendflowConfigured: sendflowConfigurado(), setterResumen: Boolean(claveResumenSetter()), version });
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
        const claves = Object.keys(actual.templates);
        const pais = body.defaultCountryCode ?? actual.defaultCountryCode;
        // Con «embudo»: solo los de ese embudo (Comercial → Mensajes de WhatsApp); los demás embudos no cambian.
        if (body.embudo) {
          if (!actual.embudos.some((e) => e.id === body.embudo)) throw Object.assign(new Error('Embudo no encontrado'), { status: 404, publicMessage: 'Ese embudo ya no existe: recarga la página.' });
          const propios = { ...(actual.mensajesEmbudo?.[body.embudo] || {}) };
          for (const k of claves) if (typeof body.templates?.[k] === 'string') propios[k] = body.templates[k];
          return saveConfig({ ...actual, mensajesEmbudo: { ...(actual.mensajesEmbudo || {}), [body.embudo]: propios }, defaultCountryCode: pais }, { version: versionDe(actual), motivo: 'Mensajes de WhatsApp del embudo' });
        }
        const templates = { ...actual.templates };
        for (const k of claves) if (typeof body.templates?.[k] === 'string') templates[k] = body.templates[k];
        return saveConfig({ ...actual, templates, defaultCountryCode: pais }, { version: versionDe(actual), motivo: 'Mensajes de WhatsApp' });
      });
      return json({ templates: config.templates, mensajesEmbudo: config.mensajesEmbudo || {}, defaultCountryCode: config.defaultCountryCode, version: versionDe(config) });
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
    const ses = await requireSession(request, { permiso: 'config' });
    const rol = ses.role;
    // Quien solo ve algunos embudos tiene una configuración recortada: guardarla entera borraría los demás.
    if (ses.embudos && !body.op) return json({ error: 'Solo tienes asignados algunos embudos: la configuración general la guarda el admin.' }, 403);
    // Pesos de la puntuación (Métricas → Vídeos y conversión → «Qué predice la compra»). null = de serie.
    if (body.op === 'pesos') {
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        return saveConfig({ ...actual, pesosScore: body.pesos ?? null }, { version: versionDe(actual), motivo: body.pesos ? 'Pesos de la puntuación' : 'Pesos de la puntuación de serie' });
      });
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
    }
    // Logo del lanzamiento (Anuncios → Crear con IA): URL de la imagen, para los anuncios de captación.
    // Narrativa del lanzamiento (Anuncios → Crear con IA, Páginas y WhatsApp, o el asistente de nuevo lanzamiento).
    // Automatizaciones de GHL (Crear → Automatizaciones): { tipo, l, datos: { origen, items }, workflow?: { nombre, url } }.
    // La URL de un workflow creado pasa también a Configuración → Accesos y enlaces (tipo «workflow»).
    if (body.op === 'automatizaciones') {
      const code = String(body.l || '');
      const grupo = { lanzamientos: 'launches', vsl: 'vsls', directa: 'directas', meteorico: 'meteoricos', cruzadas: 'cruzadas' }[body.tipo];
      if (!grupo) return json({ error: 'Tipo de embudo no válido' }, 400);
      const datos = sanitizeAutomatizaciones(body.datos);
      const wf = body.workflow && /^https:\/\/\S+$/i.test(String(body.workflow.url || '').trim())
        ? { tipo: 'workflow', nombre: String(body.workflow.nombre || 'Workflow').trim().slice(0, 60), url: String(body.workflow.url).trim().slice(0, 600) } : null;
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual[grupo]?.[code]) throw Object.assign(new Error('Embudo no encontrado'), { status: 404, publicMessage: 'Embudo no encontrado' });
        const { automatizaciones: _, ...resto } = actual[grupo][code];
        let accesos = actual.accesos || [];
        if (wf) accesos = [...accesos.filter((a) => a.url !== wf.url && !(a.tipo === 'workflow' && a.nombre === wf.nombre)), wf];
        return saveConfig({ ...actual, accesos, [grupo]: { ...actual[grupo], [code]: datos ? { ...resto, automatizaciones: datos } : resto } }, { version: versionDe(actual), motivo: 'Automatizaciones de GHL' });
      });
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
    }
    if (body.op === 'narrativa') {
      const code = String(body.l || '');
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        const { narrativa: _, ...resto } = actual.launches[code];
        const n = sanitizeNarrativa(body.narrativa);
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: n ? { ...resto, narrativa: n } : resto } }, { version: versionDe(actual), motivo: 'Narrativa del lanzamiento' });
      });
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
    }
    if (body.op === 'logoLanzamiento') {
      const code = String(body.l || '');
      const url = String(body.url || '').trim();
      if (url && !/^https:\/\/\S+$/i.test(url)) return json({ error: 'El enlace del logo debe empezar por https://' }, 400);
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        // campo 'producto': el logo del producto que se vende (va en lo de venta: carrito, página de venta…).
        const campo = body.campo === 'producto' ? 'logoProductoUrl' : 'logoUrl';
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: { ...actual.launches[code], [campo]: url } } }, { version: versionDe(actual), motivo: campo === 'logoUrl' ? 'Logo del lanzamiento' : 'Logo del producto' });
      });
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
    }
    // Productos de ThriveCart del lanzamiento (Métricas → Cobrado en ThriveCart → «Productos de este lanzamiento»).
    if (body.op === 'tcProductos') {
      const code = String(body.l || '');
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        const lista = Array.isArray(body.productos) ? body.productos : [];
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: { ...actual.launches[code], tcProductos: lista } } }, { version: versionDe(actual), motivo: 'Productos de ThriveCart del lanzamiento' });
      });
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
    }
    // Objetivos y supuestos de la calculadora de un lanzamiento (pestaña Plan → Planificador).
    // Resultados de un lanzamiento ya calculados (Planificador): se guardan con él para cualquier dispositivo.
    if (body.op === 'resultados') {
      const code = String(body.l || '');
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        const l = { ...actual.launches[code], resultados: { ...(body.resultados || {}), at: new Date().toISOString() } };
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: l } }, { version: versionDe(actual), motivo: 'Resultados del lanzamiento' });
      });
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
    }
    if (body.op === 'objetivos') {
      const code = String(body.l || '');
      const config = await reintentando(async () => {
        const actual = await getConfig({ fresh: true });
        if (!actual.launches[code]) throw Object.assign(new Error('Lanzamiento no encontrado'), { status: 404, publicMessage: 'Lanzamiento no encontrado' });
        const l = { ...actual.launches[code], objetivos: body.objetivos ?? actual.launches[code].objetivos, calculadora: body.calculadora ?? actual.launches[code].calculadora };
        return saveConfig({ ...actual, launches: { ...actual.launches, [code]: l } }, { version: versionDe(actual), motivo: 'Objetivos' });
      });
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
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
      return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config) });
    }
    // Si no vienen los embudos (p. ej. un navegador con la versión anterior), se conservan los guardados.
    const actual = await getConfig({ fresh: true });
    // La marca, la encuesta del avatar, el email del resumen diario y los del informe diario (llevan todas las cifras)
    // solo los cambia un admin.
    if (rol !== 'admin') Object.assign(body, { marca: actual.marca, encuesta: actual.encuesta, digestEmail: actual.digestEmail, informes: actual.informes });
    // Con `_version` (la que tenía el navegador): si otra persona guardó después, se avisa en vez de pisarlo.
    const version = Number.isInteger(body._version) ? body._version : null;
    const config = await saveConfig(
      { ...actual, ...body, ...('vsl' in body && !('vsls' in body) ? { vsls: { ...actual.vsls, vsl: body.vsl } } : {}) },
      { version },
    );
    // Los productos de las ventas cruzadas entran solos en Mi negocio → Productos (si falla, se reintenta al leerlo).
    let catalogoNuevos = 0;
    if (Object.keys(config.cruzadas || {}).length) {
      try {
        const antes = (await leerJSON(CLAVE_PRODUCTOS, () => null))?.productos?.length ?? 0;
        catalogoNuevos = Math.max(0, (await cargarCatalogo()).productos.length - antes);
      } catch (err) { console.error('Productos de ventas cruzadas', err.message); }
    }
    return json({ config: configDeEmbudos(config, ses.embudos), version: versionDe(config), catalogoNuevos });
  } catch (e) {
    return errorResponse(e);
  }
}
