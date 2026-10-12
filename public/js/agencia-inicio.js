// Inicio de la agencia (superadmin): todos los clientes a la vez, a partir del resumen guardado de cada uno
// (lib/agencia.js → resumenCliente). Sin pedir nada más a GHL: el semáforo de cada cliente, lo urgente de hoy,
// la agenda de los próximos días, las tareas vencidas por persona y las cifras de la agencia.

const roasObjetivo = (l) => {
  const f = Number(l?.objetivos?.facturacion); const i = Number(l?.objetivos?.inversion);
  return f > 0 && i > 0 ? f / i : null;
};
const x2 = (n) => n.toFixed(2).replace('.', ',');
const auditores = (c) => [c.lanzamiento?.auditor, ...(c.vsls || []).map((v) => v.auditor)].filter(Boolean);
const vencidasDe = (c) => (c.lanzamiento?.vencidas || 0) + (c.vsls || []).reduce((t, v) => t + (v.vencidas || 0), 0);

// Semáforo de un cliente: rojo (algo roto o crítico), ámbar (cosas que vigilar), verde (todo en orden), gris (sin datos).
export function saludCliente(c) {
  if (!c || c.pendiente) return { nivel: 'gris', motivos: ['Calculando…'] };
  const rojo = []; const ambar = [];
  if (c.error) rojo.push(c.error);
  else if (!c.conectado) rojo.push('GHL sin conectar');
  if (c.errorGhl) rojo.push('GHL no responde');
  const crit = auditores(c).reduce((t, a) => t + (a.critico || 0), 0);
  const imp = auditores(c).reduce((t, a) => t + (a.importante || 0), 0);
  if (crit) rojo.push(`${crit} crítico${crit === 1 ? '' : 's'} del auditor`);
  const l = c.lanzamiento;
  const obj = roasObjetivo(l);
  if (l?.roas != null && obj && l.inversion > 0) {
    if (l.roas < obj * 0.7) rojo.push(`ROAS ${x2(l.roas)}x muy por debajo del objetivo (${x2(obj)}x)`);
    else if (l.roas < obj) ambar.push(`ROAS ${x2(l.roas)}x por debajo del objetivo (${x2(obj)}x)`);
  }
  if (imp) ambar.push(`${imp} aviso${imp === 1 ? '' : 's'} importante${imp === 1 ? '' : 's'}`);
  const venc = vencidasDe(c);
  if (venc) ambar.push(`${venc} tarea${venc === 1 ? '' : 's'} vencida${venc === 1 ? '' : 's'}`);
  if (c.alta && c.alta.hechos < c.alta.total) ambar.push(`Alta: ${c.alta.hechos}/${c.alta.total}`);
  if (rojo.length) return { nivel: 'rojo', motivos: [...rojo, ...ambar] };
  if (ambar.length) return { nivel: 'ambar', motivos: ambar };
  return { nivel: 'verde', motivos: ['Todo en orden'] };
}
const PESO = { rojo: 0, ambar: 1, gris: 2, verde: 3 };
export const ordenSalud = (a, b) => PESO[saludCliente(a).nivel] - PESO[saludCliente(b).nivel] || String(a.nombre).localeCompare(String(b.nombre), 'es');

// Cifras de la agencia: lanzamientos en curso de todos los clientes.
export function totalesAgencia(clientes = []) {
  const t = { facturacion: 0, inversion: 0, registros: 0, ventas: 0, vip: 0, enCurso: 0, clientes: clientes.length, sanos: 0, salud: { rojo: 0, ambar: 0, verde: 0, gris: 0 } };
  for (const c of clientes) {
    const s = saludCliente(c).nivel;
    t.salud[s]++;
    if (s === 'verde') t.sanos++;
    const l = c.lanzamiento;
    if (!l) continue;
    t.enCurso++;
    t.facturacion += l.facturacion || 0;
    t.inversion += l.inversion || 0;
    t.registros += l.registros || 0;
    t.ventas += l.ventas || 0;
    t.vip += l.vip || 0;
  }
  t.roas = t.inversion ? t.facturacion / t.inversion : null;
  return t;
}

// Lo urgente de hoy en todos los clientes, de más a menos grave.
//   → [{ nivel: 'critico' | 'importante' | 'aviso', cliente, nombreCliente, color, texto, detalle }]
export function urgentesAgencia(clientes = [], { max = 14 } = {}) {
  const out = [];
  const add = (c, nivel, texto, detalle = '') => out.push({ nivel, cliente: c.id, nombreCliente: c.nombre, color: c.color || '', texto, detalle });
  for (const c of clientes) {
    if (c.pendiente) continue;
    if (c.error) { add(c, 'critico', 'No se pudo calcular su resumen', c.error); continue; }
    if (!c.conectado) { add(c, 'critico', 'GHL sin conectar', 'Falta el token de su subcuenta'); continue; }
    if (c.errorGhl) add(c, 'critico', 'GHL no responde', c.errorGhl);
    for (const t of c.lanzamiento?.auditor?.criticos || []) add(c, 'critico', t, c.lanzamiento.nombre);
    for (const v of c.vsls || []) if (v.auditor?.critico) add(c, 'critico', `${v.auditor.critico} crítico${v.auditor.critico === 1 ? '' : 's'} en «${v.nombre}»`, 'Ábrelo en el auditor');
    const l = c.lanzamiento;
    const obj = roasObjetivo(l);
    if (l?.roas != null && obj && l.inversion > 0 && l.roas < obj) add(c, l.roas < obj * 0.7 ? 'critico' : 'importante', `ROAS ${x2(l.roas)}x por debajo del objetivo (${x2(obj)}x)`, l.nombre);
    for (const x of c.equipo?.lista || []) add(c, x.dias >= 3 ? 'importante' : 'aviso', `Tarea vencida hace ${x.dias} día${x.dias === 1 ? '' : 's'}: ${x.titulo}`, `${x.quien} · ${x.nombre}`);
    const imp = (l?.auditor?.importante || 0) + (c.vsls || []).reduce((t, v) => t + (v.auditor?.importante || 0), 0);
    if (imp) add(c, 'aviso', `${imp} aviso${imp === 1 ? '' : 's'} importante${imp === 1 ? '' : 's'} del auditor`, '');
    if (c.alta && c.alta.hechos < c.alta.total) add(c, 'aviso', `Alta sin terminar (${c.alta.hechos}/${c.alta.total})`, c.alta.pasos?.find((p) => !p.ok)?.label || '');
  }
  const N = { critico: 0, importante: 1, aviso: 2 };
  return out.sort((a, b) => N[a.nivel] - N[b.nivel]).slice(0, max);
}

const sumar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
// Agenda de los próximos `dias` días: cada día con los hitos de todos los clientes.
export function agendaAgencia(clientes = [], hoy, dias = 14) {
  const out = Array.from({ length: dias }, (_, i) => ({ dia: sumar(hoy, i), eventos: [] }));
  const porDia = new Map(out.map((d) => [d.dia, d]));
  for (const c of clientes) {
    for (const h of c.agenda || []) {
      const d = porDia.get(h.dia);
      if (d) d.eventos.push({ cliente: c.id, nombreCliente: c.nombre, color: c.color || '', titulo: h.titulo, icon: h.icon, nombre: h.nombre, hora: h.hora, tipo: h.tipo });
    }
  }
  for (const d of out) d.eventos.sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  return out;
}

// Tareas vencidas por persona, sumando todos los clientes → [{ quien, n, clientes: [nombres] }].
export function equipoAgencia(clientes = []) {
  const m = new Map();
  for (const c of clientes) {
    for (const [quien, n] of Object.entries(c.equipo?.porQuien || {})) {
      const x = m.get(quien) || { quien, n: 0, clientes: [] };
      x.n += n;
      if (!x.clientes.includes(c.nombre)) x.clientes.push(c.nombre);
      m.set(quien, x);
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}
