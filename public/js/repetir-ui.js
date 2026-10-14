// Editor de «Se repite» (Operativa y Procesos): el tipo y el día concreto. Semanal → qué días (uno o varios);
// cada 2 semanas → qué día; mensual → el mismo día que la fecha, un día del mes (el 5, el último…) o «el primer
// lunes», «el último viernes»… Cada panel escucha los cambios en [data-rep] / [data-rep-dsem] y guarda leerRepetir().
import { REPETIR, DIAS_SEMANA, ORDINALES, sanitizeRepetir } from './procesos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const opt = (v, txt, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(txt)}</option>`;

export function editorRepetir(rep) {
  const r = sanitizeRepetir(rep);
  const chips = (multi) => `<span class="rep-dias" role="group" aria-label="${multi ? 'Qué días' : 'Qué día'}">${DIAS_SEMANA.map((d) => `<button type="button" class="rep-dsem${r.dias?.includes(d.id) ? ' on' : ''}" data-rep-dsem="${d.id}"${multi ? ' data-multi="1"' : ''} title="${esc(d.nombre)}" aria-pressed="${r.dias?.includes(d.id) ? 'true' : 'false'}">${d.corto}</button>`).join('')}</span>`;
  const modo = r.ord ? 'ord' : r.dia ? 'dia' : '';
  let extra = '';
  if (r.tipo === 'dias') extra = `<label class="rep-n">cada <input type="number" min="1" max="365" data-rep="n" value="${r.n}" aria-label="Cada cuántos días"> días</label>`;
  if (r.tipo === 'semanal') extra = `<span class="rep-l">Qué días:</span>${chips(true)}`;
  if (r.tipo === 'quincenal') extra = `<span class="rep-l">Qué día:</span>${chips(false)}`;
  if (r.tipo === 'mensual') {
    extra = `<select data-rep="modo" aria-label="Qué día del mes">${opt('', 'El mismo día que su fecha', !modo)}${opt('dia', 'Un día concreto (el 5, el último…)', modo === 'dia')}${opt('ord', 'Un día de la semana (el primer lunes…)', modo === 'ord')}</select>`;
    if (modo === 'dia') extra += `<select data-rep="dia" aria-label="Día del mes">${Array.from({ length: 31 }, (_, i) => opt(i + 1, `el día ${i + 1}`, r.dia === i + 1)).join('')}${opt(-1, 'el último día', r.dia === -1)}</select>`;
    if (modo === 'ord') extra += `<select data-rep="ord" aria-label="Cuál">${ORDINALES.map((o) => opt(o.id, `el ${o.label}`, r.ord === o.id)).join('')}</select><select data-rep="dsem" aria-label="Día de la semana">${DIAS_SEMANA.map((d) => opt(d.id, d.nombre, r.dsem === d.id)).join('')}</select>`;
  }
  return `<span class="rep-ed" data-rep-ed><select data-rep="tipo" aria-label="Se repite">${REPETIR.map((x) => opt(x.id, x.label, x.id === r.tipo)).join('')}</select>${extra}</span>`;
}

// Al pulsar un día de la semana: en «cada semana» se marcan varios; en «cada 2 semanas», uno.
export function pulsarDsem(btn) {
  if (!btn.dataset.multi) btn.closest('.rep-dias').querySelectorAll('.rep-dsem.on').forEach((b) => b !== btn && b.classList.remove('on'));
  btn.classList.toggle('on');
}

// Lo que hay en el editor → { tipo, n, dias | dia | ord + dsem }. fecha: para proponer el día al cambiar de modo.
export function leerRepetir(box, fecha = '') {
  const val = (k) => box.querySelector(`[data-rep="${k}"]`)?.value;
  const tipo = val('tipo') || '';
  const r = { tipo, n: Number(val('n')) || 7 };
  const f = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? new Date(`${fecha}T12:00:00Z`) : new Date();
  const dias = [...box.querySelectorAll('.rep-dsem.on')].map((b) => Number(b.dataset.repDsem));
  if (dias.length) r.dias = dias;
  else if ((tipo === 'semanal' || tipo === 'quincenal') && !box.querySelector('.rep-dias')) r.dias = [f.getUTCDay()]; // recién elegido: el día de su fecha
  const modo = val('modo');
  if (tipo === 'mensual' && modo === 'dia') r.dia = Number(val('dia') ?? f.getUTCDate());
  if (tipo === 'mensual' && modo === 'ord') { r.ord = Number(val('ord') ?? Math.min(4, Math.ceil(f.getUTCDate() / 7))); r.dsem = Number(val('dsem') ?? f.getUTCDay()); }
  return sanitizeRepetir(r);
}
