// Impacto de los mensajes del grupo de WhatsApp (Métricas → Grupos de WhatsApp): qué pasa después de cada mensaje.
//
// REGLA DE ATRIBUCIÓN (último mensaje antes de la acción):
//   · Una venta, una reserva de llamada o un inicio de pago se atribuyen al ÚLTIMO mensaje enviado al grupo en las
//     3 horas anteriores. Si en esas 3 h no salió ningún mensaje, no se atribuye a ninguno («sin mensaje cerca»).
//   · Salidas del grupo: las de la PRIMERA HORA tras el mensaje, frente a lo normal (la media por hora de las 24 h
//     anteriores). Las de más son «salidas extra»; si duplican lo normal (y son 5 o más), se marca como fuga.
//   · Hora de cada acción: venta = la llegada a la página de pago del mismo día de la compra (GHL solo guarda el día
//     de la compra); reserva = cuándo se reservó la cita (no cuándo es); inicio de pago = primera llegada a la de pago.
// No es causalidad demostrada: es una señal (los mensajes que más ventas y menos salidas tienen detrás).

export const VENTANA_ACCION = 3 * 3_600_000;
export const VENTANA_SALIDAS = 3_600_000;
const HORA = 3_600_000;

// Mensajes enviados: [{ t (ms), titulo, tipo, origen }] ordenados y sin duplicados (mismo minuto = el mismo).
export function mensajesEnviados(lista = [], ahora = Date.now()) {
  const out = [];
  for (const m of [...lista].filter((x) => Number.isFinite(x?.t) && x.t <= ahora).sort((a, b) => a.t - b.t)) {
    const prev = out.at(-1);
    if (prev && Math.abs(prev.t - m.t) < 60_000) { if (!prev.titulo && m.titulo) Object.assign(prev, { titulo: m.titulo, tipo: m.tipo }); continue; }
    out.push({ ...m });
  }
  return out;
}

// El último mensaje en las 3 h anteriores a t (índice) o -1.
export function mensajeDe(mensajes, t) {
  for (let i = mensajes.length - 1; i >= 0; i--) {
    if (mensajes[i].t > t) continue;
    return t - mensajes[i].t <= VENTANA_ACCION ? i : -1;
  }
  return -1;
}

// Valor acumulado de salidas en el momento t (interpolando entre fotos [{ t, s }]); null si no hay fotos alrededor.
function salidasEn(serie, t) {
  let a = null; let b = null;
  for (const f of serie) { if (f.t <= t) a = f; else { b = f; break; } }
  if (!a || !b) return a && t - a.t < 20 * 60_000 ? a.s : null;
  return a.s + ((b.s - a.s) * (t - a.t)) / (b.t - a.t);
}
const salidasEntre = (serie, desde, hasta) => {
  const x = salidasEn(serie, desde); const y = salidasEn(serie, hasta);
  return x == null || y == null ? null : Math.max(0, Math.round(y - x));
};

// Impacto de cada mensaje.
//   mensajes: de mensajesEnviados · acciones: [{ t, tipo: 'venta' | 'reserva' | 'pago', importe }]
//   serie: fotos de la vigilancia [{ t, s }] (salidas acumuladas; opcional)
export function impactoMensajes(mensajes = [], acciones = [], serie = []) {
  const fotos = [...(serie || [])].filter((f) => Number.isFinite(f?.t) && Number.isFinite(f?.s)).sort((a, b) => a.t - b.t);
  const filas = mensajes.map((m) => ({ ...m, ventas: 0, importe: 0, reservas: 0, pagos: 0, salidas: null, normal: null, extra: null, fuga: false }));
  const sinMensaje = { ventas: 0, reservas: 0, pagos: 0 };
  const total = { ventas: 0, reservas: 0, pagos: 0, sinHora: 0 };
  const campo = { venta: 'ventas', reserva: 'reservas', pago: 'pagos' };
  for (const a of acciones) {
    const k = campo[a.tipo];
    if (!k) continue;
    if (!Number.isFinite(a.t)) { if (a.tipo === 'venta') total.sinHora++; continue; }
    total[k]++;
    const i = mensajeDe(mensajes, a.t);
    if (i < 0) { sinMensaje[k]++; continue; }
    filas[i][k]++;
    if (a.tipo === 'venta') filas[i].importe += Number(a.importe) || 0;
  }
  if (fotos.length > 1) {
    for (const f of filas) {
      f.salidas = salidasEntre(fotos, f.t, f.t + VENTANA_SALIDAS);
      const antes = salidasEntre(fotos, f.t - 24 * HORA, f.t);
      if (antes == null) continue;
      f.normal = Math.round((antes / 24) * 10) / 10;
      if (f.salidas == null) continue;
      f.extra = Math.max(0, Math.round(f.salidas - f.normal));
      f.fuga = f.salidas >= 5 && f.salidas >= 2 * Math.max(f.normal, 1);
    }
  }
  const conAccion = (k) => filas.reduce((n, f) => n + f[k], 0);
  return {
    filas, sinMensaje, total,
    atribuidas: { ventas: conAccion('ventas'), reservas: conAccion('reservas'), pagos: conAccion('pagos') },
    conSalidas: filas.some((f) => f.salidas != null),
  };
}

// Hora de la venta de un lead: su llegada a la página de pago del mismo día de la compra (Madrid). null si no la hay.
//   dia: 'AAAA-MM-DD' de la compra · pago: { primera, ultima } (ms) de la página de pago
export function horaVenta(dia, pago, diaDe) {
  if (!dia || !pago) return null;
  for (const t of [pago.ultima, pago.primera]) if (Number.isFinite(t) && diaDe(t) === dia) return t;
  return null;
}
