// Prompt para analizar en Claude el avatar comprador (Análisis → Avatar comprador): todo lo que sabe AlquimIA de quién
// compra la entrada VIP y el producto según la encuesta, el tráfico y el origen. Sin pantalla: app.js y las pruebas.
import { perfilesCompradoras, porRespuesta, describirAvatar } from './metrics.js';
import { cruceVipCompra } from './utms.js';

const pc = (n, t) => (t ? `${(Math.round((n / t) * 1000) / 10).toLocaleString('es-ES')} %` : '–');
const eur = (n) => (n == null || !Number.isFinite(Number(n)) || !Number(n) ? '' : `${Number(n).toLocaleString('es-ES')} €`);
const limpia = (t) => String(t ?? '').replace(/\|/g, '/');

// ctx: { negocio, embudo, producto, precioVip, precioPrograma, alcance, conVip }
export function promptAvatar(leads = [], preguntas = [], ctx = {}) {
  const producto = ctx.producto || 'el producto';
  const conVip = ctx.conVip !== false;
  const total = leads.length;
  const respondieron = leads.filter((l) => preguntas.some((p) => porRespuesta([l], p).some((r) => r.respuesta && !r.otras))).length;
  const vip = leads.filter((l) => l.s?.vip).length;
  const compras = leads.filter((l) => l.s?.compra).length;
  const grupo = (fn) => { const g = leads.filter(fn); return `${g.length} leads · ${conVip ? `${g.filter((l) => l.s?.vip).length} VIP (${pc(g.filter((l) => l.s?.vip).length, g.length)}) · ` : ''}${g.filter((l) => l.s?.compra).length} compran ${producto} (${pc(g.filter((l) => l.s?.compra).length, g.length)})`; };
  // Cada pregunta: todas sus respuestas con cuántas la dieron, cuántas compran la VIP y cuántas el producto.
  const tablas = preguntas.map((p) => {
    const rows = porRespuesta(leads, p);
    const con = rows.filter((r) => r.respuesta).reduce((t, r) => t + r.leads, 0);
    return `### ${p.name}
| Respuesta | Personas | % de las que respondieron |${conVip ? ' Compran VIP | % VIP |' : ''} Compran ${limpia(producto)} | % compra |
| --- | --- | --- |${conVip ? ' --- | --- |' : ''} --- | --- |
${rows.map((r) => `| ${r.respuesta ? limpia(r.respuesta) : 'Sin respuesta'} | ${r.leads} | ${r.respuesta ? pc(r.leads, con) : '–'} |${conVip ? ` ${r.vip} | ${pc(r.vip, r.leads)} |` : ''} ${r.compras} | ${pc(r.compras, r.leads)} |`).join('\n')}`;
  }).join('\n\n');
  // Perfiles (combinaciones de respuestas) que más compran, y el que menos: para la VIP y para el producto.
  const perfiles = (objetivo) => {
    const r = perfilesCompradoras(leads, preguntas, objetivo);
    if (!r.leads) return '';
    const que = objetivo === 'vip' ? 'la entrada VIP' : producto;
    const linea = (a, i) => `${i + 1}. ${a.traits.map(([, v]) => v).join(' · ')} — ${describirAvatar(a.traits, preguntas)} · ${a.compras} de ${a.leads} compran (${pc(a.compras, a.leads)}, ×${(Math.round(a.indice * 10) / 10).toLocaleString('es-ES')} la media) · son el ${pc(a.pesoLeads, 1)} de las registradas y el ${pc(a.pesoCompras, 1)} de las compradoras`;
    return `### Quién compra ${que} (${r.compras} de ${r.leads} que respondieron: ${pc(r.compras, r.leads)})
${r.avatares.length ? r.avatares.map(linea).join('\n') : '- Aún no hay perfiles con datos suficientes.'}
${r.anti ? `- Perfil que menos compra: ${r.anti.traits.map(([, v]) => v).join(' · ')} — ${r.anti.compras} de ${r.anti.leads} (${pc(r.anti.compras, r.anti.leads)}), el ${pc(r.anti.pesoLeads, 1)} de las registradas` : ''}`;
  };
  const cr = conVip ? cruceVipCompra(leads) : null;
  return `Eres estratega de marketing y copywriter de lanzamientos de infoproductos. Con estos datos reales de ${ctx.negocio || 'mi negocio'}, dime quién es de verdad mi cliente ideal (avatar comprador) y cómo usarlo para vender más. Responde en español de España, claro y directo.

## Contexto
- Embudo: ${ctx.embudo || '–'}${ctx.alcance ? ` · datos de ${ctx.alcance}` : ''}
- Producto principal: ${producto}${eur(ctx.precioPrograma) ? ` · ${eur(ctx.precioPrograma)}` : ''}${conVip ? ` · entrada VIP${eur(ctx.precioVip) ? ` ${eur(ctx.precioVip)}` : ''}` : ''}
- Registradas: ${total} · respondieron la encuesta: ${respondieron} (${pc(respondieron, total)})${conVip ? ` · compraron la VIP: ${vip} (${pc(vip, total)})` : ''} · compraron ${producto}: ${compras} (${pc(compras, total)})

## Por tipo de tráfico y origen
- Tráfico frío (nuevas): ${grupo((l) => l.s?.trafico === 'frio')}
- Tráfico templado (ya estaban en la base de datos): ${grupo((l) => l.s?.trafico === 'templado')}
- Publicidad: ${grupo((l) => l.s?.origen === 'publi')}
- Orgánico: ${grupo((l) => l.s?.origen === 'organico')}
- Rellenaron la encuesta: ${grupo((l) => preguntas.some((p) => porRespuesta([l], p).some((r) => r.respuesta && !r.otras)))}
${cr && cr.vip.n ? `- Entrada VIP → compra: con VIP compran ${cr.vip.compran} de ${cr.vip.n} (${pc(cr.vip.compran, cr.vip.n)}); sin VIP, ${cr.noVip.compran} de ${cr.noVip.n} (${pc(cr.noVip.compran, cr.noVip.n)}).` : ''}

## Encuesta: cada pregunta con todas sus respuestas
${tablas || 'No hay preguntas de encuesta configuradas.'}

## Perfiles que más compran (combinaciones de 2-3 respuestas)
${[conVip ? perfiles('vip') : '', perfiles('compra')].filter(Boolean).join('\n\n') || 'Aún no hay respuestas suficientes.'}

## Qué necesito
1. **El avatar comprador**, en una ficha: quién es, qué le pasa, qué ha probado, qué cree que la frena y qué la hace comprar. Uno para la entrada VIP y otro para ${producto} si son distintos.
2. **Qué respuestas predicen la compra** (y cuáles la alejan), con cuántas veces más compra cada una y si los datos son suficientes.
3. **El perfil que llega mucho y compra poco:** si conviene atraerlo con otro mensaje o dejar de pagar por él.
4. **Mensajes y ángulos**: 5 ganchos de anuncio, 3 titulares de página de registro y 3 de página de venta hablando a ese avatar con sus palabras.
5. **Segmentación y seguimiento**: a quién dar prioridad en el WhatsApp / la setter y en los emails según sus respuestas.
6. **La encuesta**: qué pregunta sobra, cuál falta y cómo reformularías las que no distinguen a quien compra.
7. **Cualquier otra cosa** que veas en los datos.

## Reglas
- Con pocas personas por respuesta (menos de 10, o menos de 3 compras) dilo y no saques conclusiones fuertes.
- Empieza con un resumen de 5 puntos y termina con un plan de acción priorizado.`;
}
