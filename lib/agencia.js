// Vista de agencia: un resumen de cada cliente (embudos, lanzamiento en curso, próximo hito, registros,
// VIP, ventas, inversión, ROAS, críticos del auditor, tareas vencidas) y su alta guiada (qué falta
// para que el cliente esté listo). Lo usan el panel de agencia y el auditor automático de cada mañana.
import { importeVenta } from '../public/js/pago.js';
import { listClientes } from './clientes.js';
import { runCliente } from './cliente.js';
import { getConfig } from './config-store.js';
import { ghlConectado, listTags, countByTag, getPipelines } from './ghl.js';
import { adSpend, metaConfigured } from './meta.js';
import { zoomConfigured } from './zoom.js';
import { getTareas } from './tareas.js';
import { listUsers } from './users.js';
import { getRoles } from './roles.js';
import { currentLaunch } from './digest.js';
import { leerActividad } from './actividad.js';
import { auditarLanzamiento, auditarVsl, proximoHito } from '../public/js/auditor.js';
import { vencidasEquipo } from '../public/js/tareas.js';
import { dayInMadrid, tagFor } from '../public/js/scoring.js';
import { nombreProducto } from '../public/js/producto.js';
import { pestanaIds } from '../public/js/embudos-def.js';
import { PIPELINE_POR_DEFECTO } from '../public/js/llamadas.js';

const hoyMadrid = () => dayInMadrid(new Date().toISOString());
const restarDias = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const contarSeguro = (t) => (t ? countByTag(t).catch(() => null) : Promise.resolve(null));
const nivelCuenta = (lista) => ({
  critico: lista.filter((x) => x.nivel === 'critico').length,
  importante: lista.filter((x) => x.nivel === 'importante').length,
  aviso: lista.filter((x) => x.nivel === 'aviso').length,
  criticos: lista.filter((x) => x.nivel === 'critico').slice(0, 5).map((x) => x.titulo),
});

// Resumen de un cliente (dentro de su contexto: runCliente).
export async function resumenCliente(c, { hoy = hoyMadrid() } = {}) {
  const out = { id: c.id, nombre: c.nombre, color: c.color || '', principal: Boolean(c.principal), conectado: ghlConectado(c) };
  if (!out.conectado) return { ...out, alta: await altaCliente(c, null, { tags: null }) };
  const config = await getConfig();
  out.producto = nombreProducto(config);
  out.embudos = config.embudos.map((e) => ({ id: e.id, tipo: e.tipo, nombre: e.nombre, formato: e.formato }));
  let tags = null;
  try { tags = await listTags(); } catch (e) { out.errorGhl = String(e.publicMessage || e.message).slice(0, 200); }
  const [users, roles] = await Promise.all([listUsers().catch(() => []), getRoles().catch(() => [])]);

  // Lanzamiento en curso
  const code = currentLaunch(config, hoy);
  const l = code ? config.launches[code] : null;
  if (l) {
    const embudo = config.embudos.find((e) => e.id === l.embudo);
    const tareas = await getTareas(code).catch(() => []);
    const [registros, vipTotal, vipPrevio, compraTotal, compraPrevio] = await Promise.all([
      contarSeguro(l.registroTag), contarSeguro(l.vipTag), contarSeguro(l.vipTag ? tagFor(code, 'vip_previo') : ''),
      contarSeguro(l.compraTag), contarSeguro(l.compraTag ? tagFor(code, 'compra_previo') : ''),
    ]);
    const vip = vipTotal != null ? Math.max(0, vipTotal - (vipPrevio || 0)) : null;
    const ventas = compraTotal != null ? Math.max(0, compraTotal - (compraPrevio || 0)) : null;
    let inversion = Number(l.inversion) || 0;
    let inversion7 = null;
    if (metaConfigured() && l.inicioCaptacion) {
      try {
        inversion = (await adSpend({ since: l.inicioCaptacion, until: hoy < l.inicioCaptacion ? l.inicioCaptacion : hoy, filter: l.metaFiltro || code })).total || inversion;
        inversion7 = (await adSpend({ since: restarDias(hoy, 6), until: hoy, filter: l.metaFiltro || code })).total;
      } catch { /* sin Meta: la inversión manual */ }
    }
    // Estimación: sin mirar cada venta, el precio único (o el del primer plan si es suscripción).
    const facturacion = (vip || 0) * (Number(l.precioVip) || 0) + (ventas || 0) * importeVenta({}, l, { unico: l.precioPrograma, fraccionado: l.precioFraccionado });
    const auditoria = auditarLanzamiento({
      launch: l, code, otros: Object.entries(config.launches).filter(([k]) => k !== code), tareas, users, roles, hoy,
      tagsGhl: tags, leads: null, pestanas: embudo?.pestanas || null, zoom: zoomConfigured(), meta: null, llamadas: null,
    });
    const ph = proximoHito(l, hoy);
    out.lanzamiento = {
      code, nombre: l.name, embudo: embudo?.nombre || '', formato: l.formato || 'webinar',
      proximoHito: ph ? { label: ph.label, dia: ph.d } : null,
      registros, vip, ventas, inversion, inversion7, facturacion,
      cpl: inversion && registros ? inversion / registros : null,
      roas: inversion ? facturacion / inversion : null,
      objetivos: l.objetivos || {},
      auditor: nivelCuenta(auditoria),
      vencidas: vencidasEquipo(tareas, users, hoy, roles).length,
    };
  }
  // VSL: registros totales y auditor
  out.vsls = [];
  for (const [id, v] of Object.entries(config.vsls || {})) {
    const tareas = await getTareas(id).catch(() => []);
    const emb = config.embudos.find((e) => e.id === id);
    out.vsls.push({
      id, nombre: v.name, registros: await contarSeguro(v.registroTag), ventas: await contarSeguro(v.compraTag),
      auditor: nivelCuenta(auditarVsl({ vsl: v, code: id, hoy, tagsGhl: tags, pestanas: emb?.pestanas || null, tareas, users, roles })),
      vencidas: vencidasEquipo(tareas, users, hoy, roles).length,
    });
  }
  out.alta = await altaCliente(c, config, { tags, users });
  return out;
}

// Alta guiada: lo que tiene que estar listo en un cliente, comprobado solo.
export async function altaCliente(c, config, { tags, users = [] } = {}) {
  const pasos = [];
  const add = (id, label, ok, detalle = '') => pasos.push({ id, label, ok: Boolean(ok), detalle: ok && id !== 'registro' ? '' : detalle });
  const conectado = ghlConectado(c);
  add('ghl', 'GHL conectado (token y subcuenta)', conectado && tags != null, conectado ? (tags == null ? 'El token no responde: revisa sus permisos' : '') : `Falta la variable ${c.principal ? 'GHL_TOKEN' : `GHL_TOKEN_${c.id.toUpperCase().replace(/-/g, '_')}`} en Cloudflare`);
  if (!config) return { pasos, hechos: pasos.filter((p) => p.ok).length, total: 8 };
  add('marca', 'Nombre del producto y marca', Boolean(config.marca?.producto), 'Equipo → Marca');
  add('equipo', 'Equipo con acceso', users.some((u) => u.rol && !u.superadmin), 'Equipo → Miembros del equipo');
  add('embudo', 'Al menos un embudo', config.embudos.length > 0, '«＋ Nuevo embudo» en el menú lateral');
  // Etiquetas del embudo principal (lanzamiento en curso o la primera VSL) creadas en GHL.
  const code = currentLaunch(config);
  const l = code ? config.launches[code] : null;
  const v = Object.values(config.vsls || {})[0];
  const ref = l || v;
  const faltan = ref && tags ? [ref.registroTag, ref.compraTag].filter((t) => !t || !tags.map((x) => x.toLowerCase()).includes(String(t).toLowerCase())) : null;
  add('etiquetas', 'Etiquetas de registro y compra creadas en GHL', ref && faltan && !faltan.length, !ref ? 'Configura un lanzamiento o una VSL' : faltan?.length ? `Falta: ${faltan.map((t) => t || '(sin poner)').join(', ')}` : '');
  // Llamadas: calendario y pipeline (si algún embudo usa la pestaña).
  const conLlamadas = config.embudos.some((e) => (e.pestanas || pestanaIds(e.tipo)).includes('llamadas'));
  if (conLlamadas) {
    let pipeOk = false;
    const nombre = String((l?.llamadasPipeline || config.llamadasPipeline || v?.llamadasPipeline || PIPELINE_POR_DEFECTO)).trim().toLowerCase();
    try { pipeOk = (await getPipelines()).some((p) => String(p.name).trim().toLowerCase() === nombre); } catch { /* sin permiso */ }
    add('llamadas', 'Calendario y pipeline de llamadas', pipeOk && Boolean(l?.llamadaUrl || v?.llamadaUrl), !pipeOk ? `Falta el pipeline «${nombre}» en GHL` : 'Falta el enlace del calendario en la configuración');
  }
  const act = await leerActividad();
  add('paginas', 'Páginas de GHL con el código del dashboard', Boolean(act.pagina), act.pagina ? '' : 'Aún no ha llegado ninguna visita: pega los códigos de «Códigos para GHL»');
  const registros = ref?.registroTag ? await countByTag(ref.registroTag).catch(() => 0) : 0;
  add('registro', 'Primer registro recibido', registros > 0, registros ? `${registros} registros` : 'Haz un registro de prueba en el formulario');
  return { pasos, hechos: pasos.filter((p) => p.ok).length, total: pasos.length };
}

// Todos los clientes (para el panel de agencia y el resumen de cada mañana).
let cache = null;
export async function resumenAgencia({ fresh = false } = {}) {
  if (!fresh && cache && cache.at > Date.now() - 5 * 60_000) return cache.value;
  const hoy = hoyMadrid();
  const clientes = await listClientes({ fresh: true });
  const out = [];
  for (const c of clientes) {
    try {
      out.push(await runCliente(c, () => resumenCliente(c, { hoy })));
    } catch (e) {
      out.push({ id: c.id, nombre: c.nombre, error: String(e.publicMessage || e.message).slice(0, 200) });
    }
  }
  const value = { hoy, generado: new Date().toISOString(), clientes: out };
  cache = { at: Date.now(), value };
  return value;
}
