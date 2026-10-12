// Herramientas del conector de Claude (/api/mcp). Fase 1: SOLO LECTURA. Cada una corre en el cliente elegido
// con la sesión de quien conectó (mismos permisos que en el dashboard) y nunca devuelve emails ni teléfonos de leads.
import { getConfig } from './config-store.js';
import { resumenEmbudo, metricasLanzamiento } from './resumen.js';
import { cacheCompartida } from './store.js';
import { leerMarca } from './marca.js';
import { getTareas, asignadoLabel } from './tareas.js';
import { listUsers } from './users.js';
import { getRoles } from './roles.js';
import { listaEmails, statsEmails, MAX_TANDA } from './emails.js';
import { componerEmails } from '../public/js/emails.js';
import { embudoDe } from './embudos.js';
import { clienteActual } from './cliente.js';
import { tienePermiso } from './auth.js';
import { ROL_CLIENTE } from '../public/js/roles.js';
import { resumenEncuesta } from '../public/js/metrics.js';
import { promptEncuesta } from '../public/js/encuesta-ia.js';
import { contextoMarca, disenoTexto, productoDeEmbudo, nombreDeProducto } from '../public/js/marca.js';
import { bloqueNarrativa, sanitizeNarrativa } from '../public/js/narrativa.js';
import { calendarioEmails, asuntosGanadores } from '../public/js/emails-ia.js';
import { nombreProducto } from '../public/js/producto.js';
import { FORMATOS } from '../public/js/videos.js';
import { dayInMadrid } from '../public/js/scoring.js';

export const MAX_SALIDA = 120_000;
const hoy = () => dayInMadrid(new Date().toISOString());
const fallo = (msg) => Object.assign(new Error(msg), { publico: msg });
const CLIENTE = { type: 'string', description: 'Id del cliente (ver «ver_embudos»). Si no se indica, el principal o el único al que tienes acceso.' };
const LANZ = { type: 'string', description: 'Código del lanzamiento (ver «ver_embudos»). Si no se indica, el último que ha empezado.' };

function estado(l, d = hoy()) {
  const cierre = String(l.cierreCarrito || '').slice(0, 10);
  if (cierre && d > cierre) return 'cerrado';
  if (l.fechaDirecto && d >= l.fechaDirecto) return 'carrito';
  if (l.inicioCaptacion && d >= l.inicioCaptacion) return 'captación';
  return 'preparación';
}

// Lanzamiento pedido o el último que ya ha empezado (si no hay, el más reciente).
function lanzamientoDe(config, code) {
  if (code) {
    if (!config.launches?.[code]) throw fallo(`No existe el lanzamiento «${code}». Usa «ver_embudos» para ver los códigos.`);
    return code;
  }
  const d = hoy();
  const todos = Object.entries(config.launches || {}).sort((a, b) => String(b[1].inicioCaptacion || '').localeCompare(String(a[1].inicioCaptacion || '')));
  const c = (todos.find(([, l]) => l.inicioCaptacion && l.inicioCaptacion <= d) || todos[0])?.[0];
  if (!c) throw fallo('Este cliente no tiene lanzamientos.');
  return c;
}

const sinClienteRol = (s) => { if (s.role === ROL_CLIENTE) throw fallo('Tu acceso es de solo lectura del resumen: esta consulta no está disponible.'); };
const conPermiso = (s, p) => { sinClienteRol(s); if (!tienePermiso(s, p)) throw fallo('Tu rol no tiene acceso a esto en el dashboard.'); };

async function marcaPara(config, embudoId) {
  const m = await leerMarca();
  const producto = productoDeEmbudo(m, embudoId);
  return { m, producto, nombre: producto ? nombreDeProducto(producto) : nombreProducto(config) };
}

export const TOOLS = [
  {
    name: 'ver_embudos',
    title: 'Ver clientes, embudos y lanzamientos',
    description: 'Lista los clientes a los que tienes acceso y, del elegido, sus embudos y lanzamientos (código, fechas, estado, formato, precios y narrativa). Empieza por aquí para saber qué códigos usar en el resto de herramientas.',
    inputSchema: { type: 'object', properties: { cliente: CLIENTE }, additionalProperties: false },
    async run(args, { s, clientes }) {
      const config = await getConfig();
      const d = hoy();
      const lanz = Object.entries(config.launches || {}).map(([code, l]) => ({
        code, nombre: l.name || code, embudo: l.embudo || '', formato: FORMATOS[l.formato || 'webinar']?.label || 'Webinar', estado: estado(l, d),
        captacion: [l.inicioCaptacion || '', l.finCaptacion || ''], directo: l.fechaDirecto ? `${l.fechaDirecto} ${l.horaDirecto || ''}`.trim() : '',
        carrito: [String(l.aperturaCarrito || '').replace('T', ' '), String(l.cierreCarrito || '').replace('T', ' ')],
        precioPrograma: Number(l.precioPrograma) || null, precioVip: Number(l.precioVip) || null, narrativa: l.narrativa?.titulo || '',
      })).sort((a, b) => String(b.captacion[0]).localeCompare(String(a.captacion[0])));
      return {
        hoy: d, tu: { nombre: s.user?.nombre || '', rol: s.role },
        cliente: { id: clienteActual().id, nombre: clienteActual().nombre, producto: nombreProducto(config) },
        otrosClientes: clientes.filter((c) => c.id !== clienteActual().id).map((c) => ({ id: c.id, nombre: c.nombre })),
        embudos: (config.embudos || []).map((e) => ({ id: e.id, nombre: e.nombre, tipo: e.tipo })),
        lanzamientos: s.role === ROL_CLIENTE ? lanz.map(({ code, nombre, embudo, estado: est, directo }) => ({ code, nombre, embudo, estado: est, directo })) : lanz,
        meteoricos: Object.entries(config.meteoricos || {}).map(([code, x]) => ({ code, nombre: x.name || code, apertura: x.apertura || '', cierre: x.cierre || '' })),
      };
    },
  },
  {
    name: 'metricas_embudo',
    title: 'Métricas de un lanzamiento o embudo',
    description: 'Cifras de un lanzamiento (registros, VIP, ventas, facturación, inversión, ROAS, CPL, CAC, embudo de conversión, objetivos y próximos hitos) o de una VSL / venta directa en un periodo. Las mismas que el dashboard, sin datos personales.',
    inputSchema: {
      type: 'object',
      properties: { cliente: CLIENTE, lanzamiento: LANZ, embudo: { type: 'string', description: 'Id del embudo (para VSL o venta directa).' }, periodo: { type: 'string', enum: ['hoy', '7d', '30d', '90d', 'mes-actual', 'mes-pasado'], description: 'Solo VSL / venta directa. Por defecto 30d.' } },
      additionalProperties: false,
    },
    async run(args, { s }) {
      if (!tienePermiso(s, ['metricas', 'resumen'])) throw fallo('Tu rol no tiene acceso a las métricas.');
      const config = await getConfig();
      let embudo = args.embudo || '';
      let l = '';
      if (!embudo || config.embudos?.find((e) => e.id === embudo)?.tipo === 'lanzamientos') {
        l = lanzamientoDe(config, args.lanzamiento);
        embudo = config.launches[l].embudo || config.embudos?.find((e) => e.tipo === 'lanzamientos')?.id || '';
      }
      return resumenEmbudo({ embudo, l, periodo: args.periodo || '30d' });
    },
  },
  {
    name: 'encuesta_para_copy',
    title: 'Encuesta: respuestas abiertas para sacar patrones y ganchos',
    description: 'Las respuestas de la encuesta de un lanzamiento listas para analizar: % de las preguntas de opciones y todas las respuestas de texto libre (anónimas, agrupadas, [COMPRÓ] en las de quien compró), con la ficha de marca/avatar, la narrativa y la guía del análisis (patrones, compradoras frente al resto, lenguaje literal del avatar, ganchos para anuncios, emails, WhatsApp y páginas). Ideal en el cierre del lanzamiento.',
    inputSchema: { type: 'object', properties: { cliente: CLIENTE, lanzamiento: LANZ }, additionalProperties: false },
    async run(args, { s }) {
      conPermiso(s, ['leads', 'avatar', 'metricas']);
      const config = await getConfig();
      const code = lanzamientoDe(config, args.lanzamiento);
      const l = config.launches[code];
      if (!(config.encuesta || []).length) throw fallo('Este cliente no tiene preguntas de encuesta configuradas.');
      // Cacheado 30 min y SIN nombres: descarga todos los registrados del lanzamiento.
      const r = await cacheCompartida(`mcp-encuesta|${code}`, 30 * 60_000, async () => {
        const { leads } = await metricasLanzamiento(config, code);
        const x = resumenEncuesta(leads, config.encuesta);
        return { ...x, preguntas: x.preguntas.map((q) => ({ ...q, libres: q.libres.map((y) => ({ texto: y.texto, compra: y.compra })) })) };
      });
      const mp = await marcaPara(config, l.embudo);
      return promptEncuesta(r, {
        marca: clienteActual().nombre, producto: mp.nombre, lanzamiento: l.name || code,
        contexto: contextoMarca(mp.m, mp.producto), narrativa: bloqueNarrativa(l.narrativa, 'anuncios'),
      }).prompt;
    },
  },
  {
    name: 'marca_y_narrativa',
    title: 'Ficha de marca, avatar y narrativa',
    description: 'La ficha de marca, producto y avatar del cliente (tono, cliente ideal, dolores, deseos, objeciones, oferta…), su estilo visual y, si se indica un lanzamiento, su narrativa (la gran idea de la que sale todo el copy y el diseño). Úsala antes de escribir cualquier copy.',
    inputSchema: { type: 'object', properties: { cliente: CLIENTE, lanzamiento: LANZ, embudo: { type: 'string', description: 'Id del embudo (si no hay lanzamiento).' } }, additionalProperties: false },
    async run(args, { s }) {
      sinClienteRol(s);
      const config = await getConfig();
      const code = args.lanzamiento || (args.embudo ? '' : lanzamientoDe(config, ''));
      if (code && !config.launches?.[code]) throw fallo(`No existe el lanzamiento «${code}».`);
      const l = code ? config.launches[code] : null;
      const mp = await marcaPara(config, args.embudo || l?.embudo || '');
      const ficha = contextoMarca(mp.m, mp.producto);
      const n = sanitizeNarrativa(l?.narrativa);
      return [
        `# ${clienteActual().nombre} · ${mp.nombre}${l ? ` · lanzamiento «${l.name || code}»` : ''}`,
        '', '## Ficha de marca, producto y avatar', ficha || '(Sin ficha: falta el cuestionario de marca en Equipo → Marca y avatar.)',
        disenoTexto(mp.m) ? `\n## Estilo visual\n${disenoTexto(mp.m)}` : '',
        l ? `\n## Narrativa del lanzamiento\n${n?.texto ? `${n.titulo ? `«${n.titulo}»\n` : ''}${n.texto}` : '(Este lanzamiento no tiene narrativa todavía.)'}` : '',
      ].filter((x) => x !== '').join('\n');
    },
  },
  {
    name: 'tareas_lanzamiento',
    title: 'Tareas de un lanzamiento',
    description: 'Las tareas del lanzamiento (Plan → Tareas): título, fase, fecha, a quién está asignada y su estado. Por defecto solo las pendientes.',
    inputSchema: { type: 'object', properties: { cliente: CLIENTE, lanzamiento: LANZ, incluir_hechas: { type: 'boolean', description: 'También las hechas (por defecto no).' } }, additionalProperties: false },
    async run(args, { s }) {
      sinClienteRol(s);
      const config = await getConfig();
      const code = lanzamientoDe(config, args.lanzamiento);
      const [tareas, users, roles] = await Promise.all([getTareas(code), listUsers(), getRoles()]);
      const d = hoy();
      const lista = tareas.filter((t) => args.incluir_hechas || !t.hecha)
        .sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')))
        .map((t) => ({ titulo: t.titulo, fase: t.fase, fecha: t.fecha || '', asignada: asignadoLabel(t.asignado, users, roles), estado: t.hecha ? 'hecha' : t.estado || 'pendiente', vencida: Boolean(!t.hecha && t.fecha && t.fecha < d) }));
      return { lanzamiento: config.launches[code].name || code, hoy: d, total: tareas.length, pendientes: tareas.filter((t) => !t.hecha).length, tareas: lista.slice(0, 300) };
    },
  },
  {
    name: 'emails_lanzamiento',
    title: 'Emails: calendario y resultados',
    description: 'El calendario de emails propuesto para el lanzamiento (fechas, horas, fase, qué comunicar, tono) y, si hay datos de GHL, cómo funcionaron los emails ya enviados (apertura, clics) y los asuntos que mejor funcionaron. Útil para escribir la secuencia de emails.',
    inputSchema: { type: 'object', properties: { cliente: CLIENTE, lanzamiento: LANZ }, additionalProperties: false },
    async run(args, { s }) {
      conPermiso(s, 'metricas');
      const config = await getConfig();
      const code = lanzamientoDe(config, args.lanzamiento);
      const l = config.launches[code];
      let enviados = null;
      try {
        // Como el dashboard: la lista y las estadísticas de los más recientes (una tanda: cabe en el límite de Cloudflare).
        const lista = await listaEmails(code, embudoDe(config, code));
        const recientes = [...(lista.items || [])].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))).slice(0, MAX_TANDA);
        const e = componerEmails({ ...lista, items: recientes }, await statsEmails(recientes.map((x) => x.key)));
        if ((lista.items || []).length > recientes.length) e.aviso = `Se leen las estadísticas de los ${recientes.length} emails más recientes de ${lista.items.length}.`;
        enviados = {
          resumen: e.resumen, aviso: e.aviso || '',
          emails: (e.emails || []).slice(0, 80).map((x) => ({ asunto: x.asunto || x.nombre || '', fecha: x.fecha || x.enviado || '', entregados: x.entregados, apertura: x.apertura, ctr: x.ctr, ctor: x.ctor })),
          asuntosGanadores: asuntosGanadores(e.emails || []),
        };
      } catch (e) {
        enviados = { aviso: `No se pudieron leer los emails de GHL: ${e.publicMessage || e.message}` };
      }
      return {
        lanzamiento: l.name || code,
        calendario: calendarioEmails(l).map((x) => ({ cuando: x.at ? x.at.replace('T', ' ') : 'inmediato', fase: x.fase, titulo: x.titulo, que: x.que, segmento: x.segmento || '', tono: x.tono || '' })),
        enviados,
      };
    },
  },
];

export const toolPublica = (t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: { title: t.title, readOnlyHint: true, openWorldHint: false } });

export function textoSalida(v) {
  const t = typeof v === 'string' ? v : JSON.stringify(v, null, 1);
  return t.length > MAX_SALIDA ? `${t.slice(0, MAX_SALIDA)}\n…(recortado)` : t;
}
