// Avisos del carrito abierto: ritmo de ventas frente al objetivo, bonus que caducan pronto y cierre.
// Los usan el resumen diario por email (servidor) y el aviso de Métricas (navegador).
import { momentosCarrito, ventanaBonus } from './oferta.js';

const HORA = 3_600_000;
const DIA = 24 * HORA;
const horaMadrid = (ms) => new Date(ms).toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
const diaMadrid = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

// [{ nivel: 'alta' | 'media', texto }] · `ventas`: ventas del lanzamiento hasta ahora.
export function alertasCarrito(launch, ventas, now = Date.now()) {
  const out = [];
  if (!launch) return out;
  const M = momentosCarrito(launch);
  if (M.apertura == null || M.cierre == null || now < M.apertura || now >= M.cierre) return out;
  const hoy = diaMadrid(now);
  if (diaMadrid(M.cierre) === hoy) out.push({ nivel: 'alta', texto: `Hoy cierra el carrito a las ${horaMadrid(M.cierre)}: último empujón (email y WhatsApp de cierre).` });
  // Ritmo frente al objetivo de ventas.
  const objetivo = Number(launch.objetivos?.ventas) || 0;
  if (objetivo && ventas < objetivo) {
    const diasPasados = Math.max(1, (now - M.apertura) / DIA);
    const diasQuedan = Math.max(1 / 24, (M.cierre - now) / DIA);
    const ritmo = ventas / diasPasados;
    const necesario = (objetivo - ventas) / diasQuedan;
    if (ritmo < necesario * 0.8) {
      out.push({ nivel: ritmo < necesario * 0.5 ? 'alta' : 'media', texto: `Ritmo por debajo del objetivo: llevas ${ventas} de ${objetivo} ventas (${ritmo.toFixed(1).replace('.', ',')} al día) y hacen falta ${necesario.toFixed(1).replace('.', ',')} al día hasta el cierre.` });
    }
  }
  // Bonus que caducan en las próximas 36 horas.
  for (const b of launch.oferta?.bonus || []) {
    if (b.tipo === 'bonus') continue;
    const w = ventanaBonus(b, launch);
    if (w.hasta == null || w.hasta <= now || w.hasta - now > 36 * HORA) continue;
    const cuando = diaMadrid(w.hasta) === hoy ? `hoy a las ${horaMadrid(w.hasta)}` : `mañana a las ${horaMadrid(w.hasta)}`;
    out.push({ nivel: 'media', texto: `El bonus «${b.nombre}» caduca ${cuando}: recuérdalo en los emails y WhatsApp (la fecha límite empuja la venta).` });
  }
  return out;
}
