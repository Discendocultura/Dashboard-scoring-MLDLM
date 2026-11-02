// Agente de lanzamientos: del brief (objetivos) al plan (las piezas que tiene que haber y para cuándo) y al pilotaje
// (cada día mira cómo va y propone en la bandeja de decisiones lo que haría; tú apruebas o descartas).
// Aquí lo que no depende del servidor (lo usan lib/agente.js, el navegador y los tests).
import { hitosAuditor, diasHasta } from './auditor.js';
import { videosDe, nClases, conVip, esEnDirecto } from './videos.js';

const DAY = 86_400_000;
const dia = (v) => String(v || '').slice(0, 10);
const sumar = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const redondo = (n) => Math.round(Number(n) || 0);
const fechaTxt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\./g, '');

// Brief → objetivos. Con ventas e inversión y la conversión esperada (registro → venta) salen los registros y el CPL.
export function objetivosDeBrief({ ventas, inversion, conversion = 2 }) {
  const v = Math.max(0, redondo(ventas));
  const c = Math.min(50, Math.max(0.1, Number(conversion) || 2));
  const registros = v ? Math.ceil(v / (c / 100)) : 0;
  const inv = Math.max(0, redondo(inversion));
  return { ventas: v, registros, inversion: inv, cplObjetivo: registros && inv ? Math.round((inv / registros) * 100) / 100 : null, conversion: c };
}

// Ritmo de registros: los que tocarían hoy en línea recta desde el inicio de la captación hasta el día antes del directo.
export function ritmoRegistros({ registros, objetivo, inicio, fin, hoy }) {
  if (!objetivo || !inicio || !fin) return null;
  const total = Math.max(1, diasHasta(fin, inicio) + 1);
  const pasados = Math.min(total, Math.max(0, diasHasta(hoy, inicio) + 1));
  const quedan = Math.max(0, total - pasados);
  const esperado = Math.round((objetivo * pasados) / total);
  return {
    esperado, pct: esperado ? Math.round((registros / esperado) * 100) : null, quedan,
    actualDia: pasados ? Math.round(registros / pasados) : 0,
    necesarioDia: quedan ? Math.max(0, Math.ceil((objetivo - registros) / quedan)) : 0,
  };
}

// Las piezas del lanzamiento, cada una con para cuándo tiene que estar y si está.
//   extra: { mensajesGrupo: n, tareas: n, reglasActivas: n, emails: n|null }
export function piezasLanzamiento(l, extra = {}) {
  const H = hitosAuditor(l);
  const capt = H.captacion.d;
  const p = [];
  const add = (id, titulo, hecha, para, accion) => p.push({ id, titulo, hecha: Boolean(hecha), para: para || '', accion });
  const campo = (id) => ({ tipo: 'campo', id });
  const vista = (v) => ({ tipo: 'vista', v });
  add('objetivos', 'Objetivos del lanzamiento (ventas, registros, inversión)', l.objetivos?.ventas && l.objetivos?.registros, capt && sumar(capt, -10), { tipo: 'brief' });
  add('narrativa', 'Narrativa del lanzamiento (la gran idea)', l.narrativa?.texto, capt && sumar(capt, -7), vista('anuncios'));
  add('tareas', 'Tareas del lanzamiento cargadas y repartidas', extra.tareas > 0, capt && sumar(capt, -7), vista('tareas'));
  add('registro', 'Página de registro publicada', l.registroUrl || l.registroAdsUrl, capt && sumar(capt, -3), campo('cfg-registro-url'));
  add('gracias', 'Página de gracias', l.graciasUrl, capt && sumar(capt, -3), campo('cfg-gracias-url'));
  add('grupo', 'Grupo de WhatsApp', l.whatsappUrl, capt && sumar(capt, -2), campo('cfg-whatsapp-url'));
  if (extra.mensajesGrupo != null) add('mensajes', 'Mensajes del grupo de WhatsApp programados', extra.mensajesGrupo > 0, capt, vista('grupowa'));
  if (nClases(l) >= 1 || l.preclaseTipo === 'recursos') {
    add('login', 'Página de acceso (login)', l.loginUrl, H.clase1.d && sumar(H.clase1.d, -2), campo('cfg-login-url'));
    add('preclase', 'Página preclase', l.recursosUrl, H.clase1.d && sumar(H.clase1.d, -2), campo('cfg-recursos-url'));
  }
  for (const v of videosDe(l)) {
    const directo = esEnDirecto(v) || v.k === 1;
    if (directo) add(`zoom${v.k}`, `Sala de Zoom ${videosDe(l).length > 1 ? `del ${v.nombre}` : 'del directo'}`, v.zoomMeetingId, v.fecha && sumar(v.fecha, -5), { tipo: 'zoom', k: v.k });
  }
  if (conVip(l) && l.vipTag) add('vip', 'Enlace de pago de la VIP', l.vipUrl, capt, campo('cfg-vip-url'));
  add('venta', 'Página de venta', l.raicesUrl, H.carrito.d && sumar(H.carrito.d, -3), campo('cfg-raices'));
  add('pago', 'Página o enlace de pago', l.paginaPagoUrl || l.ventaUrl, H.carrito.d && sumar(H.carrito.d, -3), campo('cfg-pagina-pago'));
  add('replay', 'Página de la grabación', l.replayUrl, H.replay.d && sumar(H.replay.d, -1), campo('cfg-replay'));
  add('reglas', 'Reglas de seguimiento encendidas (pago, oferta del directo…)', extra.reglasActivas > 0, H.carrito.d, { tipo: 'bandeja', tab: 'reglas' });
  return p.sort((a, b) => (a.para || '9').localeCompare(b.para || '9'));
}

// Lo que propone el agente hoy. → [{ clave, titulo, detalle, accion }]
//   accion: { tipo: 'tareas', tareas: [{ titulo, rol, fecha, notas }] } · { tipo: 'regla', regla: {…} } · { tipo: 'brief' }
export function propuestasAgente({ l, hoy, registros = null, ventas = null, inversion = null, piezas = [], reglas = [] }) {
  const out = [];
  const H = hitosAuditor(l);
  const o = l.objetivos || {};
  const enCaptacion = H.captacion.d && H.captacion.d <= hoy && (!H.directo.d || hoy < H.directo.d);
  const enCarrito = H.carrito.d && H.carrito.d <= hoy && (!H.cierre.d || hoy <= H.cierre.d);
  if (!o.ventas || !o.registros) {
    out.push({ clave: 'brief', titulo: '🎯 Ponle objetivos al lanzamiento', detalle: 'Sin ventas y registros objetivo no puedo decirte si vas bien. Son dos números (y la inversión si hay anuncios).', accion: { tipo: 'brief' } });
  }
  // 1) Ritmo de registros en la captación
  if (enCaptacion && o.registros && registros != null) {
    const r = ritmoRegistros({ registros, objetivo: o.registros, inicio: H.captacion.d, fin: H.directo.d ? sumar(H.directo.d, -1) : H.captacion.d, hoy });
    if (r && r.pct != null && r.pct < 85 && diasHasta(hoy, H.captacion.d) >= 2) {
      out.push({
        clave: `ritmo|${hoy}`, titulo: `📉 Vas al ${r.pct} % del ritmo de registros`,
        detalle: `Tienes ${registros} y a estas alturas tocarían ${r.esperado}. Para llegar a ${o.registros} necesitas ${r.necesarioDia} al día (ahora haces ${r.actualDia}). Propongo una tarea para la persona de anuncios: subir presupuesto a los ganadores y preparar creatividades nuevas.`,
        accion: { tipo: 'tareas', tareas: [{ titulo: `Subir el ritmo de registros: de ${r.actualDia} a ${r.necesarioDia} al día`, rol: 'admin', fecha: hoy, notas: `Vamos al ${r.pct} % del ritmo (${registros} de ${r.esperado} esperados). Revisar en Anuncios los ganadores y los que se agotan, subir presupuesto a los que funcionan y preparar 2-3 creatividades nuevas.` }] },
      });
    }
    // 2) CPL por encima del previsto
    const cplObj = o.inversion && o.registros ? o.inversion / o.registros : null;
    if (cplObj && inversion && registros >= 30) {
      const cpl = inversion / registros;
      if (cpl > cplObj * 1.3) {
        out.push({
          clave: `cpl|${hoy}`, titulo: `💸 El coste por registro va a ${cpl.toFixed(2).replace('.', ',')} € (previsto ${cplObj.toFixed(2).replace('.', ',')} €)`,
          detalle: 'Un 30 % o más por encima de lo previsto. Propongo una tarea para pausar los anuncios caros y mover el presupuesto a los que traen registros más baratos.',
          accion: { tipo: 'tareas', tareas: [{ titulo: 'Bajar el coste por registro: pausar los anuncios caros', rol: 'admin', fecha: hoy, notas: `CPL actual ${cpl.toFixed(2)} € frente a ${cplObj.toFixed(2)} € previsto. En Anuncios, ordenar por CPL y pausar los peores.` }] },
        });
      }
    }
  }
  // 3) Piezas atrasadas o que vencen en 2 días
  const atrasadas = piezas.filter((p) => !p.hecha && p.para && p.para <= sumar(hoy, 2) && p.id !== 'objetivos' && p.id !== 'reglas');
  if (atrasadas.length) {
    out.push({
      clave: `piezas|${atrasadas.map((p) => p.id).sort().join(',')}`,
      titulo: `🧩 ${atrasadas.length} pieza${atrasadas.length === 1 ? '' : 's'} sin hacer ${atrasadas.some((p) => p.para < hoy) ? 'y ya atrasada' : 'para los próximos días'}`,
      detalle: atrasadas.map((p) => `${p.titulo} (para el ${fechaTxt(p.para)})`).join(' · '),
      accion: { tipo: 'tareas', tareas: atrasadas.map((p) => ({ titulo: `Hacer: ${p.titulo}`, rol: p.id.startsWith('zoom') || ['registro', 'gracias', 'login', 'preclase', 'venta', 'pago', 'replay'].includes(p.id) ? 'tecnico' : 'admin', fecha: p.para < hoy ? hoy : p.para, notas: 'Propuesta del agente de lanzamientos.' })) },
    });
  }
  // 4) Carrito: reglas de seguimiento apagadas
  if ((enCarrito || (H.carrito.d && diasHasta(H.carrito.d, hoy) <= 2 && diasHasta(H.carrito.d, hoy) >= 0)) && !reglas.some((r) => r.activa && r.id === 'pago')) {
    out.push({
      clave: 'regla-pago', titulo: '🛒 Enciende el seguimiento de quien llega al pago y no compra',
      detalle: 'Con el carrito abierto, quien llega a la página de pago y no compra es el lead más caliente. Propongo encender la regla en modo «Proponer» (te pedirá permiso antes de escribir a nadie) con una tarea de llamada para el setter.',
      accion: { tipo: 'regla', regla: { id: 'pago', activa: true, modo: 'proponer', max: 40, accion: { tipo: 'tarea', tag: '', rol: 'setter' } } },
    });
  }
  // 5) Carrito: ventas por debajo del ritmo a mitad del carrito
  if (enCarrito && o.ventas && ventas != null && H.cierre.d) {
    const total = Math.max(1, diasHasta(H.cierre.d, H.carrito.d) + 1);
    const pasados = Math.max(1, diasHasta(hoy, H.carrito.d) + 1);
    const pct = Math.round((ventas / o.ventas) * 100);
    if (pasados >= total / 2 && pct < 50) {
      out.push({
        clave: `ventas|${hoy}`, titulo: `🧯 Vas a mitad del carrito con el ${pct} % de las ventas (${ventas} de ${o.ventas})`,
        detalle: 'Propongo una tarea para preparar el empujón final: directo o emisión de preguntas, bonus por tiempo y mensajes a quienes vieron la oferta y no compraron (la regla «oferta del directo» de la bandeja).',
        accion: { tipo: 'tareas', tareas: [{ titulo: 'Empujón final del carrito: bonus, directo de preguntas y seguimiento', rol: 'admin', fecha: hoy, notas: `Ventas ${ventas} de ${o.ventas} a mitad del carrito.` }] },
      });
    }
  }
  return out;
}
