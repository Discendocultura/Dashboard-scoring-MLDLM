// Skool → AlquimIA: los miembros de la comunidad de pago (su CSV de miembros) como ventas reales, junto a las de
// ThriveCart y Hotmart. De cada miembro: email, nivel (Estándar, Premium, VIP…), fecha de alta, precio («$14/mes») y
// lo cobrado de verdad (LTV, «valor de por vida»). Con eso salen la facturación y el ROAS del lanzamiento, el reparto
// por nivel y la etiqueta de alumno en GHL (`alumno-claves-premium`).
import { leerCsv, importeTexto, fechaTexto } from './thrivecart.js';

const txt = (v, max = 160) => String(v ?? '').trim().slice(0, max);

// Qué columna es cada cosa (cabeceras de Skool en inglés o español). Por preferencia; `no` descarta cabeceras.
const COLS = {
  email: { si: [/^e-?mail$|correo/, /e-?mail/] },
  nombre: { si: [/^name$|^nombre$|full.?name|nombre.?completo/, /^first.?name$|^nombre$/] },
  apellido: { si: [/^last.?name$|apellido/] },
  fecha: { si: [/joined|join.?date|se.?uni[oó]|fecha.?(de )?(alta|uni[oó]n|ingreso)|member.?since|^date$|^fecha$/, /approved|fecha|date/], no: /renew|renuev|cancel|next|pr[oó]xim|birth|nacim|churn/ },
  nivel: { si: [/^tier$|^nivel$|^level$|membership.?(tier|level)|^plan$/, /tier|nivel|level|plan/], no: /price|precio|ltv|amount/ },
  precio: { si: [/^price$|^precio$|membership.?price|^amount$/, /price|precio|amount|importe|recurring/], no: /ltv|lifetime|vida|total/ },
  ltv: { si: [/^ltv$|lifetime|valor.?de.?por.?vida|total.?(paid|pagado)|revenue/] },
  intervalo: { si: [/interval|billing.?(period|cycle)|periodo|frecuencia|recurrence/] },
};
export function columnasSkool(cab = []) {
  const n = cab.map((h) => String(h).trim().toLowerCase());
  const out = {};
  for (const [k, { si, no }] of Object.entries(COLS)) {
    for (const re of si) {
      const i = n.findIndex((h, j) => !Object.values(out).includes(j) && re.test(h) && !(no && no.test(h)));
      if (i >= 0) { out[k] = i; break; }
    }
  }
  return out;
}

// «$14/mes», «€140 / year», «14 USD monthly» → { importe, intervalo: 'mes' | 'año' | '', moneda: 'USD' | 'EUR' | '' }.
export function precioSkool(v = '', intervaloTxt = '') {
  const s = String(v);
  const t = `${s} ${intervaloTxt}`.toLowerCase();
  const intervalo = /a[ñn]o|year|annual|anual|\/yr\b/.test(t) ? 'año' : /mes|month|mensual|\/mo\b/.test(t) ? 'mes' : '';
  const moneda = /€|eur/i.test(s) ? 'EUR' : /\$|usd/i.test(s) ? 'USD' : '';
  return { importe: importeTexto(s.replace(/\/.*$/, '')), intervalo, moneda };
}

// Nivel → trozo de etiqueta: «Premium» → «premium», «Estándar VIP» → «estandar-vip».
export const slugNivel = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
// Etiqueta de alumno en GHL: prefijo del lanzamiento + nivel → «alumno-claves-premium».
export function tagAlumno(prefijo, nivel) {
  const p = slugNivel(prefijo);
  const n = slugNivel(nivel);
  return p && n ? `${p}-${n}` : '';
}
export const TAG_ALUMNO_OK = /^[a-z0-9][a-z0-9-]{1,80}$/;

// CSV de miembros de Skool → { miembros: [{ email, nombre, fecha, nivel, precio, intervalo, ltv, moneda }], columnas, faltan }.
export function miembrosDeCsv(texto) {
  const filas = leerCsv(texto);
  if (filas.length < 2) return { miembros: [], columnas: {}, faltan: ['email'] };
  const cab = filas[0];
  const c = columnasSkool(cab);
  const faltan = ['email', 'fecha'].filter((k) => c[k] == null);
  if (faltan.includes('email')) return { miembros: [], columnas: c, faltan, cabecera: cab };
  const g = (f, k) => (c[k] == null ? '' : txt(f[c[k]], 200));
  // ¿Fechas con el mes delante (10/16/2026)? Si alguna tiene el segundo número > 12.
  const fechas = filas.slice(1).map((f) => g(f, 'fecha'));
  const mdy = fechas.some((v) => { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/.exec(v); return m && Number(m[2]) > 12; })
    && !fechas.some((v) => { const m = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/.exec(v); return m && Number(m[1]) > 12; });
  const vistos = new Set();
  const miembros = [];
  for (const f of filas.slice(1)) {
    const email = g(f, 'email').toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || vistos.has(email)) continue;
    vistos.add(email);
    const p = precioSkool(g(f, 'precio'), g(f, 'intervalo'));
    const ltv = c.ltv == null ? null : importeTexto(g(f, 'ltv'));
    miembros.push({
      email,
      nombre: [g(f, 'nombre'), g(f, 'apellido')].filter(Boolean).join(' ').slice(0, 80),
      fecha: fechaTexto(g(f, 'fecha'), { mdy }) || null,
      nivel: g(f, 'nivel') || 'Sin nivel',
      precio: p.importe,
      intervalo: p.intervalo,
      ltv,
      moneda: p.moneda || (/€/.test(g(f, 'ltv')) ? 'EUR' : /\$/.test(g(f, 'ltv')) ? 'USD' : ''),
    });
  }
  return { miembros, columnas: c, faltan, cabecera: cab };
}

// Miembro → venta como las de ThriveCart y Hotmart (fuente «skool»). El importe es lo cobrado de verdad (LTV) y, si el
// CSV no lo trae, el precio (un cobro). Los dólares se pasan a euros con `cambio` (1 $ = cambio €).
export function ventaSkool(m = {}, { cambio = 1 } = {}) {
  const email = txt(m.email, 200).toLowerCase();
  const fecha = Number(m.fecha);
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !Number.isFinite(fecha) || fecha < 1.5e12 || fecha > Date.now() + 86_400_000) return null;
  const k = String(m.moneda).toUpperCase() === 'USD' ? Number(cambio) || 1 : 1;
  const r2 = (x) => Math.round(x * 100) / 100;
  const precio = Number.isFinite(Number(m.precio)) && m.precio != null ? r2(Number(m.precio) * k) : null;
  const ltv = Number.isFinite(Number(m.ltv)) && m.ltv != null ? r2(Number(m.ltv) * k) : null;
  const importe = ltv ?? precio ?? 0;
  const nivel = txt(m.nivel, 60) || 'Sin nivel';
  return {
    id: `skool|${email}`, fuente: 'skool', evento: 'skool.miembro', tipo: 'cobro', pedido: '', email, nombre: txt(m.nombre, 80),
    importe, moneda: 'EUR', producto: `Skool · ${nivel}`, productoId: '', plan: nivel, precio, intervalo: m.intervalo === 'año' ? 'año' : m.intervalo === 'mes' ? 'mes' : '',
    ltv, monedaOriginal: k !== 1 ? 'USD' : (txt(m.moneda, 8).toUpperCase() || 'EUR'), cambio: k !== 1 ? k : null, prueba: false, fecha, importada: true,
  };
}

// Al volver a importar, cada miembro se sustituye por su versión nueva (el LTV crece con cada renovación).
export function juntarSkool(lista = [], nuevas = []) {
  const m = new Map(lista.map((v) => [v.email, v]));
  let nuevos = 0; let actualizados = 0;
  for (const v of nuevas) {
    if (m.has(v.email)) actualizados++; else nuevos++;
    m.set(v.email, v);
  }
  return { lista: [...m.values()].sort((a, b) => a.fecha - b.fecha), nuevos, actualizados };
}

// Reparto por nivel de los miembros que se unieron entre `desde` y `hasta` (ms): cuántos, %, lo cobrado y lo que
// suman al mes (MRR: los anuales, entre 12). `emails`: los de los leads del lanzamiento (cuántos estaban registrados).
export function resumenSkool(ventas = [], { desde = 0, hasta = Infinity, emails = null } = {}) {
  const dentro = ventas.filter((v) => v.fuente === 'skool' && v.fecha >= desde && v.fecha <= hasta);
  const total = dentro.length;
  const mrrDe = (v) => (v.precio == null ? 0 : v.intervalo === 'año' ? v.precio / 12 : v.precio);
  const r2 = (x) => Math.round(x * 100) / 100;
  const niveles = new Map();
  for (const v of dentro) {
    const x = niveles.get(v.plan) || { nivel: v.plan, n: 0, cobrado: 0, mrr: 0, registrados: 0 };
    x.n++; x.cobrado = r2(x.cobrado + v.importe); x.mrr = r2(x.mrr + mrrDe(v));
    if (emails?.has(v.email)) x.registrados++;
    niveles.set(v.plan, x);
  }
  const filas = [...niveles.values()].map((x) => ({ ...x, pct: total ? x.n / total : 0 })).sort((a, b) => b.n - a.n);
  return {
    total, filas,
    cobrado: r2(filas.reduce((t, f) => t + f.cobrado, 0)),
    mrr: r2(filas.reduce((t, f) => t + f.mrr, 0)),
    registrados: filas.reduce((t, f) => t + f.registrados, 0),
    sinLtv: dentro.filter((v) => v.ltv == null).length,
    miembros: dentro,
  };
}
