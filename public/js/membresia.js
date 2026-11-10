// Membresía de Skool: el panel de alumnos (Configuración → 🎓 Membresía). Skool no tiene API: los miembros se leen
// de su página de Miembros, en el navegador de quien tiene la sesión iniciada (ver skool-lector.js), y llegan aquí
// como filas «planas» ({ 'user.email': '…', 'member.tier': 'VIP', … }). Con eso:
//   · qué columna es cada dato (se adivina y se puede corregir: `adivinarMapa`, `normalizar`);
//   · altas, bajas y cambios de plan entre una lectura y la siguiente (`aplicarFoto`);
//   · las cifras de negocio: MRR, churn por plan, ARPU, LTV, vida media, más activos, en riesgo (`metricasMembresia`);
//   · la etiqueta de GHL de cada plan (`tagDePlan`) y los segmentos para escribirles.
// Lo usan el navegador (panel) y el servidor (handlers/membresia.js) y las pruebas.

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

// La membresía es de Discendo: solo existe en su cliente (la ven quienes tienen acceso a Discendo).
export const CLIENTES_MEMBRESIA = ['discendo'];
export const conMembresia = (clienteId) => CLIENTES_MEMBRESIA.includes(String(clienteId || ''));
const txt = (v, max = 160) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const DIA = 86_400_000;

// Los datos de cada alumno. `buscar`: claves que suelen traer ese dato (sobre la última parte de la clave y la clave
// entera, en minúsculas); `no`: claves que no son.
export const CAMPOS = [
  { id: 'email', label: 'Email', buscar: [/(^|\.)e-?mail$/, /email/], obligatorio: true },
  { id: 'nombre', label: 'Nombre', buscar: [/(^|\.)first_?name$/, /(^|\.)(full_?name|display_?name)$/, /(^|\.)name$/], no: /group|community|tier|plan|level|product|price|question/ },
  { id: 'apellido', label: 'Apellido', buscar: [/(^|\.)last_?name$/] },
  { id: 'telefono', label: 'Teléfono', buscar: [/phone|tel[eé]fono|m[oó]vil|whatsapp/] },
  { id: 'plan', label: 'Plan', buscar: [/(^|\.)(tier|plan|membership_?(tier|level|type|name)|price_?name|product_?name)$/, /tier_?name|plan_?name|tier|plan/], no: /price|amount|cents|level$|points|id$/ },
  { id: 'planAlt', label: 'Plan, si no viene el anterior', buscar: [] },
  { id: 'precio', label: 'Precio', buscar: [/^tarjeta\.precio$/, /(^|\.)(price|amount|unit_?amount|recurring_?amount)$/, /price|amount|mrr/], no: /ltv|lifetime|total|paid|name|id$|currency/ },
  { id: 'intervalo', label: 'Cada cuánto paga', buscar: [/interval|billing_?(period|cycle)|recurr|frecuencia|periodo/], no: /count|amount/ },
  { id: 'ltv', label: 'Lo cobrado (LTV)', buscar: [/ltv|lifetime|total_?(paid|spent|revenue)|revenue/] },
  { id: 'alta', label: 'Fecha de alta', buscar: [/^tarjeta\.alta$/, /(^|\.)(joined|joined_?at|approved_?at|member_?since|created_?at)$/, /joined|approved|since|created/], no: /group|post|last|update|renew|cancel|churn/ },
  { id: 'puntos', label: 'Puntos (actividad)', buscar: [/(^|\.)points$/, /points|puntos/] },
  { id: 'nivelSkool', label: 'Nivel de Skool', buscar: [/(^|\.)level$/, /level$/], no: /tier|plan/ },
  { id: 'ultima', label: 'Última conexión', buscar: [/^tarjeta\.ultima$/, /last_?(active|seen|online|login|visit)/, /last_?activity|online_?at/] },
  { id: 'renueva', label: 'Próxima renovación', buscar: [/^tarjeta\.renueva$/, /renew|next_?(billing|payment|charge)|period_?end|current_?period/], no: /count|auto|cancel/ },
  { id: 'renovacion', label: 'No renueva (canceló)', buscar: [/^tarjeta\.renovacion$/, /cancel_?at_?period_?end|cancel_?at$|will_?cancel/] },
  { id: 'estado', label: 'Estado', buscar: [/(^|\.)(status|state|membership_?status)$/, /churn|cancel/], no: /email|phone/ },
];

// Las claves de las filas, con ejemplos (para el desplegable de «qué columna es cada dato»).
export function clavesDe(filas = [], max = 400) {
  const m = new Map();
  for (const f of filas.slice(0, max)) {
    for (const [k, v] of Object.entries(f || {})) {
      const x = m.get(k) || { clave: k, n: 0, ejemplos: [] };
      x.n++;
      const s = txt(v, 40);
      if (s && x.ejemplos.length < 3 && !x.ejemplos.includes(s)) x.ejemplos.push(s);
      m.set(k, x);
    }
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave));
}

// ¿Qué clave es cada dato? → { email: 'user.email', plan: 'member.tier', … } (sin las que no se encuentran).
export function adivinarMapa(filas = []) {
  const claves = clavesDe(filas);
  const usadas = new Set();
  const mapa = {};
  const esEmail = (c) => c.ejemplos.length && c.ejemplos.every((e) => EMAIL_RE.test(e));
  for (const campo of CAMPOS) {
    let elegida = null;
    if (campo.id === 'plan') {
      // El plan: la clave que viene en casi todos, con pocos valores de texto (nombres de plan) y nombre de plan/tier.
      const c = candidatosPlan(filas).find((x) => x.pista && !usadas.has(x.clave));
      if (c) { mapa.plan = c.clave; usadas.add(c.clave); }
      continue;
    }
    if (campo.id === 'planAlt') continue;
    if (campo.id === 'email') elegida = claves.find((c) => esEmail(c) && /mail/i.test(c.clave)) || claves.find(esEmail);
    for (const re of campo.buscar) {
      if (elegida) break;
      elegida = claves.find((c) => {
        const k = c.clave.toLowerCase();
        return !usadas.has(c.clave) && re.test(k) && !(campo.no && campo.no.test(k)) && (campo.id === 'email' || !esEmail(c));
      });
    }
    if (elegida) { mapa[campo.id] = elegida.clave; usadas.add(elegida.clave); }
  }
  // Céntimos: un precio «1400» con monedas que suelen ir en céntimos (Stripe, como Skool).
  const p = mapa.precio ? filas.map((f) => Number(f?.[mapa.precio])).filter((x) => Number.isFinite(x) && x > 0) : [];
  // (se ve en la vista previa y se puede cambiar: «los importes vienen en céntimos»).
  if (p.length && (/cent/i.test(mapa.precio) || p.every((x) => Number.isInteger(x) && x >= 1000))) mapa.centimos = true;
  return mapa;
}

// Claves de las filas que podrían ser el PLAN: texto (no números, emails, fechas ni enlaces), entre 1 y 25 valores
// distintos y en al menos el 20 % de los alumnos. Ordenadas: primero las que tienen nombre de plan/tier/nivel de
// pago (`pista`) y luego por cuántos alumnos la traen. → [{ clave, cobertura (0-1), valores: [{ valor, n }], pista }]
// Código interno (id de Skool o de Stripe): «c852af5034d04f7f…», un uuid, «price_1Ab…». No es un nombre de plan.
export const esCodigo = (v) => { const t = String(v ?? '').trim(); return /^[a-f0-9]{16,}$/i.test(t) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(t) || /^(price|prod|plan|sub|si|pi)_[A-Za-z0-9]{8,}$/.test(t) || (/^[A-Za-z0-9_-]{20,}$/.test(t) && /\d/.test(t) && !/\s/.test(t)); };
// Nombre de un plan: el puesto a mano (Planes y etiquetas), el que trae Skool en su lista de planes o el valor tal cual.
export function nombrePlan(v, { nombres = {}, catalogo = {} } = {}) {
  const t = String(v ?? '').trim();
  return txt(nombres[t], 60) || txt(catalogo[t]?.nombre ?? catalogo[t], 60) || t;
}
const PISTA_PLAN = /tier|plan|membership|price|product|subscription|suscrip|nivel|package|paquete|access|acceso/i;
const NO_PLAN = /mail|first_?name|last_?name|full_?name|display_?name|(^|\.)name$|nombre|phone|tel|bio|avatar|image|photo|picture|url|link|href|location|city|country|pais|ciudad|lang|locale|timezone|tz$|(^|\.)id$|_id$|uuid|token|slug|handle|ip$|color|theme|question|answer|respuesta|pregunta/i;
// «…tier.name», «membership.plan.title»: el nombre DEL PLAN (no de una persona), aunque acabe en «name».
const NOMBRE_DE_PLAN = /(tier|plan|product|membership|price|level|subscription|package)[^.]*\.(name|title|label|display_?name)$/i;
const PERIODO_RE = /^(month|monthly|year|yearly|annual|annually|week|weekly|day|daily|quarter|quarterly|mes|mensual|año|anual|semana|semanal|trimestral)$/i;
export function candidatosPlan(filas = []) {
  const total = filas.length || 1;
  const m = new Map();
  for (const f of filas) {
    for (const [k, v] of Object.entries(f || {})) {
      if (NO_PLAN.test(k) && !NOMBRE_DE_PLAN.test(k)) continue;
      const t = txt(v, 80);
      if (!t) continue;
      const x = m.get(k) || { clave: k, n: 0, valores: new Map(), malos: 0, codigos: 0 };
      x.n++;
      if (esCodigo(t)) x.codigos++;
      if (/^-?[\d.,]+$/.test(t) || EMAIL_RE.test(t) || /^https?:/i.test(t) || /^\d{4}-\d{2}-\d{2}/.test(t) || /^(true|false|null|undefined)$/i.test(t) || PERIODO_RE.test(t)) x.malos++;
      if (x.valores.size <= 40) x.valores.set(t, (x.valores.get(t) || 0) + 1);
      m.set(k, x);
    }
  }
  return [...m.values()]
    .filter((x) => x.malos / x.n < 0.1 && x.valores.size >= 1 && x.valores.size <= 25 && x.n / total >= 0.2)
    .map((x) => ({ clave: x.clave, cobertura: x.n / total, pista: PISTA_PLAN.test(x.clave), nombreDePlan: NOMBRE_DE_PLAN.test(x.clave), codigos: x.codigos / x.n > 0.5, valores: [...x.valores.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n) }))
    // Primero los que traen NOMBRES de plan; los de códigos (ids), al final: solo valen si no hay otra cosa.
    .sort((a, b) => (a.codigos - b.codigos) || (b.pista - a.pista) || (b.nombreDePlan - a.nombreDePlan) || (b.cobertura - a.cobertura) || (a.valores.length - b.valores.length));
}

// Cómo se reparten los alumnos por plan con un mapa (para verlo antes de guardar). → [{ valor, n }] (con «Sin plan»)
export function repartoPlan(filas = [], mapa = {}, opts = {}) {
  const c = new Map();
  for (const f of filas) {
    const a = normalizar(f, mapa, opts);
    if (!a) continue;
    c.set(a.plan, (c.get(a.plan) || 0) + 1);
  }
  return [...c.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => (a.valor === 'Sin plan') - (b.valor === 'Sin plan') || b.n - a.n);
}

// Resumen de las claves que trae Skool SIN datos personales (para pedir ayuda): cuántos la traen, de qué tipo y, solo
// en las que no son personales, unos valores de ejemplo.
export function diagnosticoSkool(filas = []) {
  const total = filas.length;
  const personal = /mail|name|nombre|phone|tel|bio|avatar|image|photo|picture|url|link|location|city|address|direcci|ip$|token|answer|respuesta|question|pregunta|handle|slug/i;
  const lineas = clavesDe(filas, 5000).map((c) => {
    const vals = filas.map((f) => f?.[c.clave]).filter((v) => v != null && v !== '');
    const nums = vals.filter((v) => /^-?[\d.,]+$/.test(String(v))).length;
    const tipo = nums === vals.length ? 'número' : vals.some((v) => EMAIL_RE.test(String(v))) ? 'email' : vals.some((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v))) ? 'fecha' : 'texto';
    const distintos = new Set(vals.map(String)).size;
    const ver = !personal.test(c.clave) && tipo !== 'email' && distintos <= 25;
    const ej = ver ? [...new Set(vals.map((v) => txt(v, 30)))].slice(0, 8).join(' | ') : '(oculto)';
    return `${c.clave} · ${c.n}/${total} · ${tipo} · ${distintos} distintos · ${ej}`;
  });
  return [`Skool: ${total} filas, ${lineas.length} claves`, ...lineas].join('\n');
}

// Fecha de Skool → epoch ms: ISO, «2026-10-16 10:00:00», segundos o ms.
export function fechaDe(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) {
    const ms = n < 1e11 ? n * 1000 : n < 1e14 ? n : n / 1000; // segundos, ms o µs
    return ms > 1e12 && ms < 4.1e12 ? Math.round(ms) : null;
  }
  const t = Date.parse(String(v).trim().replace(' ', 'T'));
  return Number.isFinite(t) && t > 1e12 ? t : null;
}

// «€14/mes», «14», 1400 (céntimos) → número.
export function importeDe(v, centimos = false) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? r2(centimos ? v / 100 : v) : null;
  const s = String(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const norm = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(norm);
  if (!Number.isFinite(n)) return null;
  return r2(centimos && !/[.,]/.test(s) ? n / 100 : n);
}

export function intervaloDe(...vals) {
  const t = vals.map((v) => String(v ?? '')).join(' ').toLowerCase();
  if (/a[ñn]o|year|annual|anual|\/yr\b/.test(t)) return 'año';
  if (/mes|month|mensual|\/mo\b/.test(t)) return 'mes';
  return '';
}

const BAJA_RE = /churn|cancel|baja|inactive|expired|removed|banned|left|unpaid|past_?due/i;

// Fila plana + mapa → alumno { email, nombre, telefono, plan, precio, intervalo, ltv, alta, puntos, nivelSkool, ultima, baja }.
// `opts`: { nombres, catalogo } para traducir los códigos de plan a su nombre (ver nombrePlan); el código queda en `planId`.
export function normalizar(fila = {}, mapa = {}, opts = {}) {
  const g = (k) => (mapa[k] ? fila[mapa[k]] : undefined);
  const email = txt(g('email'), 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const nombre = limpiarNombre([txt(g('nombre'), 80), mapa.apellido && mapa.apellido !== mapa.nombre ? txt(g('apellido'), 80) : ''].filter(Boolean).join(' ')).slice(0, 80);
  const tel = txt(g('telefono'), 30).replace(/[^\d+]/g, '');
  const precioTxt = g('precio');
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const estado = txt(g('estado'), 40);
  return {
    email,
    nombre,
    telefono: tel.replace(/\D/g, '').length >= 8 ? tel : '',
    ...(() => {
      const crudo = txt(g('plan'), 80) || txt(g('planAlt'), 80);
      if (!crudo) return { plan: 'Sin plan' };
      const plan = nombrePlan(crudo, opts).slice(0, 60);
      return { plan, ...(esCodigo(crudo) ? { planId: crudo } : {}) };
    })(),
    precio: importeDe(precioTxt, !!mapa.centimos),
    intervalo: intervaloDe(g('intervalo'), typeof precioTxt === 'string' ? precioTxt : '') || (mapa.intervaloFijo === 'año' ? 'año' : 'mes'),
    ltv: (() => {
      const l = importeDe(g('ltv'), !!mapa.centimos);
      const p = importeDe(precioTxt, !!mapa.centimos);
      // Un LTV en céntimos (12000 = 120 $) junto a un precio en unidades (44 $/mes): más de 5 años de cuotas
      // en un número entero redondo es que viene en céntimos.
      const entero = Number.isInteger(Number(g('ltv')));
      // Los importes de los datos internos de Skool (la ficha) van en céntimos; los de la tarjeta, en unidades.
      if (l != null && !mapa.centimos && entero && /^ficha\./.test(mapa.ltv || '') && /^tarjeta\./.test(mapa.precio || '')) return r2(l / 100);
      if (l != null && p && !mapa.centimos && entero && l > p * 60 && l % 100 === 0) return r2(l / 100);
      return l;
    })(),
    alta: fechaDe(g('alta')),
    puntos: num(g('puntos')),
    nivelSkool: num(g('nivelSkool')),
    ultima: fechaDe(g('ultima')),
    renueva: fechaDe(g('renueva')),
    // Canceló la renovación: sigue dentro hasta que acabe lo pagado (no es una baja todavía).
    noRenueva: (() => { const v = String(g('renovacion') ?? '').trim().toLowerCase(); return Boolean(v) && v !== 'false' && v !== '0' && v !== 'null'; })(),
    moneda: /\$|usd/i.test(String(precioTxt ?? '')) ? 'USD' : /€|eur/i.test(String(precioTxt ?? '')) ? 'EUR' : '',
    baja: estado ? BAJA_RE.test(estado) : false,
  };
}

// Planes que siguen siendo un código (sin nombre): cuántos alumnos y lo que suelen pagar al mes, para reconocerlos.
// `alumnos`: normalizados o guardados. → [{ codigo, n, mes (el precio al mes más repetido) }]
// Con `todos`, también los que ya tienen nombre (para poder cambiarlo o juntarlos). → [{ codigo, n, mes, nombre }]
export function codigosSinNombre(alumnos = [], { todos = false } = {}) {
  const m = new Map();
  for (const a of alumnos) {
    const c = esCodigo(a.plan) ? (a.planId || a.plan) : todos && a.planId ? a.planId : '';
    if (!c) continue;
    const x = m.get(c) || { codigo: c, n: 0, precios: new Map(), nombre: esCodigo(a.plan) ? '' : a.plan };
    x.n++;
    const p = precioMes(a);
    if (p) x.precios.set(p, (x.precios.get(p) || 0) + 1);
    // Lo que paga tal cual (44 € al mes, 367 € al año): así se reconoce mejor el plan.
    if (a.precio != null) { const k = `${a.precio}|${a.intervalo === 'año' ? 'año' : 'mes'}`; x.pagos = x.pagos || new Map(); x.pagos.set(k, (x.pagos.get(k) || 0) + 1); }
    m.set(c, x);
  }
  return [...m.values()].map(({ precios, pagos, ...x }) => {
    const [pk] = [...(pagos || new Map()).entries()].sort((a, b) => b[1] - a[1])[0] || [];
    const [precio, intervalo] = pk ? pk.split('|') : [];
    return { ...x, mes: [...precios.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null, ...(pk ? { precio: Number(precio), intervalo } : {}) };
  }).sort((a, b) => b.n - a.n);
}

// Precio al mes de un alumno (los anuales, entre 12). Sin precio en Skool, el del plan (Membresía → Planes).
export function precioMes(a = {}, precios = {}) {
  const p = a.precio != null ? { importe: a.precio, intervalo: a.intervalo } : precios[a.plan];
  if (!p || p.importe == null || !Number.isFinite(Number(p.importe))) return 0;
  return r2(p.intervalo === 'año' ? Number(p.importe) / 12 : Number(p.importe));
}

// Lectura nueva de Skool → qué cambia. `estado`: { alumnos: { email: alumno }, eventos: [...] }; `foto`: alumnos
// normalizados; `completa`: la lectura trae TODOS los miembros activos (solo así, quien falta es una baja).
// → { estado (nuevo), altas, bajas, cambios, vuelven, iguales }. No modifica el estado de entrada.
export function aplicarFoto(estado = {}, foto = [], { ahora = Date.now(), completa = true } = {}) {
  const antes = estado.alumnos || {};
  const alumnos = Object.fromEntries(Object.entries(antes).map(([k, v]) => [k, { ...v }]));
  const eventos = [...(estado.eventos || [])];
  const primera = !Object.keys(antes).length;
  const vistos = new Set();
  const altas = []; const bajas = []; const cambios = []; const vuelven = [];
  let iguales = 0;
  for (const n of foto) {
    if (!n?.email || vistos.has(n.email)) continue;
    vistos.add(n.email);
    const a = alumnos[n.email];
    const datos = Object.fromEntries(Object.entries(n).filter(([k, v]) => k !== 'baja' && v != null && v !== ''));
    if (!a) {
      alumnos[n.email] = { ...datos, alta: n.alta || ahora, primeraVez: ahora, visto: ahora, activo: !n.baja, ...(n.baja ? { bajaEn: ahora } : {}) };
      if (!n.baja) { altas.push(n.email); if (!primera) eventos.push({ t: ahora, tipo: 'alta', email: n.email, plan: n.plan, mes: precioMes(n) }); }
      continue;
    }
    const plan0 = a.plan;
    Object.assign(a, datos, { visto: ahora });
    if (n.baja) {
      if (a.activo !== false) { a.activo = false; a.bajaEn = ahora; bajas.push(n.email); eventos.push({ t: ahora, tipo: 'baja', email: n.email, plan: a.plan, mes: precioMes(a) }); }
      continue;
    }
    if (a.activo === false) {
      a.activo = true; delete a.bajaEn; vuelven.push(n.email);
      eventos.push({ t: ahora, tipo: 'vuelve', email: n.email, plan: a.plan, mes: precioMes(a) });
    } else if (plan0 && n.plan && plan0 !== n.plan && plan0 !== 'Sin plan' && n.plan !== 'Sin plan' && !esCodigo(plan0) && !esCodigo(n.plan)) {
      cambios.push({ email: n.email, de: plan0, a: n.plan });
      eventos.push({ t: ahora, tipo: 'cambio', email: n.email, de: plan0, plan: n.plan, mes: precioMes(a) });
    } else iguales++;
  }
  if (completa && !primera) {
    for (const [email, a] of Object.entries(alumnos)) {
      if (vistos.has(email) || a.activo === false) continue;
      a.activo = false; a.bajaEn = ahora; bajas.push(email);
      eventos.push({ t: ahora, tipo: 'baja', email, plan: a.plan, mes: precioMes(a) });
    }
  }
  return {
    estado: { ...estado, alumnos, eventos: eventos.slice(-4000), ultimaLectura: ahora, lecturas: (estado.lecturas || 0) + 1 },
    altas, bajas, cambios, vuelven, iguales, primera,
  };
}

const mesesEntre = (a, b) => Math.max(0, (b - a) / (30.44 * DIA));

// Cifras de negocio. `precios`: precio por plan cuando Skool no lo trae; `ltvExtra`: { email: € } de otras
// plataformas (Hotmart, ThriveCart) para el LTV total; `ventana`: días del churn (30).
export function metricasMembresia(estado = {}, { ahora = Date.now(), precios = {}, ltvExtra = {}, ventana = 30, riesgoDias = 14 } = {}) {
  const lista = Object.values(estado.alumnos || {});
  const activos = lista.filter((a) => a.activo !== false);
  const desde = ahora - ventana * DIA;
  const ev = (estado.eventos || []).filter((e) => e.t >= desde);
  const ltvDe = (a) => r2((a.ltv ?? 0) + (ltvExtra[a.email] || 0));
  const planes = new Map();
  const plan = (p) => {
    if (!planes.has(p)) planes.set(p, { plan: p, activos: 0, cancelados: 0, noRenuevan: 0, mrr: 0, altas: 0, bajas: 0, mrrPerdido: 0, ltvSuma: 0, ltvN: 0, vidaSuma: 0, vidaN: 0 });
    return planes.get(p);
  };
  for (const a of lista) {
    const x = plan(a.plan || 'Sin plan');
    if (a.activo !== false) { x.activos++; x.mrr = r2(x.mrr + precioMes(a, precios)); if (a.noRenueva) x.noRenuevan++; } else x.cancelados++;
    const l = ltvDe(a);
    if (l > 0) { x.ltvSuma += l; x.ltvN++; }
    if (a.alta) { x.vidaSuma += mesesEntre(a.alta, a.activo === false ? (a.bajaEn || ahora) : ahora); x.vidaN++; }
  }
  for (const e of ev) {
    const x = plan(e.plan || 'Sin plan');
    if (e.tipo === 'alta' || e.tipo === 'vuelve') x.altas++;
    if (e.tipo === 'baja') { x.bajas++; x.mrrPerdido = r2(x.mrrPerdido + (e.mes || 0)); }
  }
  const filas = [...planes.values()].map((x) => {
    const base = x.activos + x.bajas; // los que había al empezar el periodo (aprox.: activos de hoy + los que se fueron)
    const churn = base ? x.bajas / base : 0;
    const arpu = x.activos ? r2(x.mrr / x.activos) : 0;
    return {
      plan: x.plan, activos: x.activos, cancelados: x.cancelados, noRenuevan: x.noRenuevan, mrr: x.mrr, altas: x.altas, bajas: x.bajas, churn, mrrPerdido: x.mrrPerdido, arpu,
      ltvMedio: x.ltvN ? r2(x.ltvSuma / x.ltvN) : 0,
      vidaMeses: x.vidaN ? Math.round((x.vidaSuma / x.vidaN) * 10) / 10 : 0,
      // LTV esperado de un alumno nuevo: lo que paga al mes ÷ el churn mensual (con poco churn, sin cifra).
      ltvEsperado: churn >= 0.005 && arpu ? r2(arpu / (churn * (30 / ventana))) : null,
    };
  }).sort((a, b) => b.mrr - a.mrr || b.activos - a.activos);
  const t = (k) => filas.reduce((s, f) => s + f[k], 0);
  const bajas = t('bajas');
  const nActivos = t('activos');
  const mrr = r2(t('mrr'));
  const conActividad = activos.some((a) => a.puntos != null || a.ultima);
  const masActivos = conActividad ? [...activos].sort((a, b) => (b.puntos ?? -1) - (a.puntos ?? -1) || (b.ultima || 0) - (a.ultima || 0)).slice(0, 10) : [];
  const enRiesgo = activos.filter((a) => a.ultima && ahora - a.ultima > riesgoDias * DIA).sort((a, b) => a.ultima - b.ultima);
  const antiguedad = [['< 1 mes', 0, 1], ['1-3 meses', 1, 3], ['3-6 meses', 3, 6], ['6-12 meses', 6, 12], ['+1 año', 12, Infinity]]
    .map(([label, d, h]) => ({ label, n: activos.filter((a) => { const m = a.alta ? mesesEntre(a.alta, ahora) : 0; return m >= d && m < h; }).length }));
  // Hace `ventana` días: el MRR de hoy sin lo que entró y con lo que salió desde entonces (aprox.: los cambios de plan no cuentan).
  const entra = ev.filter((e) => e.tipo === 'alta' || e.tipo === 'vuelve').reduce((s2, e) => s2 + (e.mes || 0), 0);
  const sale = ev.filter((e) => e.tipo === 'baja').reduce((s2, e) => s2 + (e.mes || 0), 0);
  const mrrAntes = r2(Math.max(0, mrr - entra + sale));
  // Altas y bajas por semana (las últimas 12), para la gráfica de evolución.
  const semanas = [];
  for (let i = 11; i >= 0; i--) {
    const fin = ahora - i * 7 * DIA;
    const ini = fin - 7 * DIA;
    const en = (estado.eventos || []).filter((e) => e.t > ini && e.t <= fin);
    semanas.push({ ini, fin, altas: en.filter((e) => e.tipo === 'alta' || e.tipo === 'vuelve').length, bajas: en.filter((e) => e.tipo === 'baja').length });
  }
  return {
    mrrAntes, crecimiento: mrrAntes ? (mrr - mrrAntes) / mrrAntes : null, semanas,
    activos: nActivos, total: lista.length, mrr, arr: r2(mrr * 12), arpu: nActivos ? r2(mrr / nActivos) : 0,
    altas: t('altas'), bajas, neto: t('altas') - bajas, churn: nActivos + bajas ? bajas / (nActivos + bajas) : 0,
    mrrPerdido: r2(t('mrrPerdido')),
    ltvMedio: (() => { const l = lista.map(ltvDe).filter((x) => x > 0); return l.length ? r2(l.reduce((s, x) => s + x, 0) / l.length) : 0; })(),
    ltvTotal: r2(lista.reduce((s, a) => s + ltvDe(a), 0)),
    filas, masActivos, enRiesgo, antiguedad, conActividad,
    // % de los alumnos activos en cada plan (no del dinero: eso es el % del MRR).
    reparto: filas.filter((f) => f.activos).map((f) => ({ plan: f.plan, n: f.activos, pct: nActivos ? f.activos / nActivos : 0 })).sort((a, b) => b.n - a.n),
    // Cancelados (ya fuera) y no renovados (cancelaron la renovación y se irán al acabar lo pagado).
    cancelados: lista.filter((a) => a.activo === false).length,
    noRenuevan: activos.filter((a) => a.noRenueva).length,
    bajasRecientes: lista.filter((a) => a.activo === false && a.bajaEn && a.bajaEn >= desde).sort((a, b) => b.bajaEn - a.bajaEn),
    sinPrecio: activos.filter((a) => !precioMes(a, precios)).length,
    ventana,
  };
}

// Etiqueta de GHL de un plan: la elegida en Membresía → Planes o, si no, «<prefijo>-<plan>» («alumno-vip»).
export const slug = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const TAG_OK = /^[a-z0-9][a-z0-9 _-]{1,80}$/;
export function tagDePlan(cfg = {}, plan = '') {
  const t = txt(cfg.etiquetas?.[plan], 80).toLowerCase();
  if (t && TAG_OK.test(t)) return t;
  if (esCodigo(plan)) return ''; // un código sin nombre no da etiqueta («alumno-c852af…» no le sirve a nadie)
  const p = slug(cfg.prefijo || 'alumno');
  const n = slug(plan);
  return p && n && n !== 'sin-plan' ? `${p}-${n}` : '';
}

// Qué hay que tocar en GHL para que las etiquetas cuadren: cada activo con la de su plan (y sin la del plan anterior);
// cada baja con la de baja (si hay) y sin la de su plan. → [{ email, poner: [], quitar: [] }]
export function etiquetasPendientes(estado = {}, cfg = {}) {
  const out = [];
  const tagBaja = TAG_OK.test(txt(cfg.tagBaja, 80).toLowerCase()) ? txt(cfg.tagBaja, 80).toLowerCase() : '';
  for (const a of Object.values(estado.alumnos || {})) {
    if (a.enGhl === false) continue; // no está en GHL: no hay a quién ponérsela (se crea antes su ficha)
    const puestas = a.tags || [];
    const quiere = a.activo === false ? (tagBaja ? [tagBaja] : []) : [tagDePlan(cfg, a.plan)].filter(Boolean);
    const poner = quiere.filter((t) => !puestas.includes(t));
    const quitar = puestas.filter((t) => !quiere.includes(t));
    if (poner.length || quitar.length) out.push({ email: a.email, poner, quitar });
  }
  return out;
}

// Segmentos para escribir (WhatsApp / email) desde el panel.
export const SEGMENTOS = [
  { id: 'todos', label: 'Todos los activos', ico: '🎓', f: (a) => a.activo !== false },
  { id: 'nuevos', label: 'Nuevos (últimos 30 días)', ico: '🌱', f: (a, ahora) => a.activo !== false && a.alta && ahora - a.alta < 30 * DIA },
  { id: 'activos', label: 'Más activos', ico: '🔥', f: (a) => a.activo !== false && (a.puntos ?? 0) > 0, orden: (a, b) => (b.puntos ?? 0) - (a.puntos ?? 0) },
  { id: 'riesgo', label: 'En riesgo (sin entrar 14+ días)', ico: '⚠️', f: (a, ahora) => a.activo !== false && a.ultima && ahora - a.ultima > 14 * DIA },
  { id: 'ltv', label: 'Por lo que han pagado', ico: '💎', f: (a) => a.activo !== false && (a.ltv ?? 0) > 0, orden: (a, b) => (b.ltv ?? 0) - (a.ltv ?? 0) },
  { id: 'singhl', label: 'No están en GHL', ico: '🔗', f: (a) => a.enGhl === false },
  { id: 'renuevan', label: 'Renuevan en 30 días', ico: '🔁', f: (a, ahora) => a.activo !== false && !a.noRenueva && a.renueva && a.renueva >= ahora && a.renueva - ahora <= 30 * DIA, orden: (a, b) => a.renueva - b.renueva },
  { id: 'norenuevan', label: 'Han cancelado la renovación', ico: '⏳', f: (a) => a.activo !== false && a.noRenueva, orden: (a, b) => (a.renueva || 0) - (b.renueva || 0) },
  { id: 'bajas', label: 'Bajas (para recuperar)', ico: '👋', f: (a) => a.activo === false, orden: (a, b) => (b.bajaEn || 0) - (a.bajaEn || 0) },
];

// Cruce con GHL (por el email de Skool): cuántos tienen ficha, cuántos no, cuántos faltan por cruzar y con móvil.
export function resumenGhl(alumnos = []) {
  const l = Array.isArray(alumnos) ? alumnos : Object.values(alumnos);
  return {
    total: l.length,
    enGhl: l.filter((a) => a.enGhl === true).length,
    noEsta: l.filter((a) => a.enGhl === false).length,
    sinCruzar: l.filter((a) => a.enGhl == null).length,
    conMovil: l.filter((a) => waDe(a.telefono)).length,
  };
}

// Mensaje con {nombre} (nombre de pila) y {plan}.
// Nombre de persona: si viene el usuario de Skool («jose-luis-garcia-4175 Garcia»), se convierte en «Jose Luis Garcia»
// (sin el número y sin repetir los apellidos que ya estaban).
const SLUG_RE = /^[a-z0-9\u00e0-\u00ff]+(?:-[a-z0-9\u00e0-\u00ff]+)+$/;
export function limpiarNombre(n = '') {
  const partes = String(n || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length || !SLUG_RE.test(partes[0])) return partes.join(' ');
  const pal = partes[0].split('-').filter((x) => !/^\d+$/.test(x)).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
  const ya = new Set(pal.map((x) => x.toLowerCase()));
  const resto = partes.slice(1).filter((x) => !ya.has(x.toLowerCase()));
  return [...pal, ...resto].join(' ');
}
// ¿Son usuarios de Skool (slugs) los valores de esa clave? (para no usarla como nombre si hay otra mejor)
export const pareceSlug = (filas = [], clave = '') => { const v = filas.slice(0, 200).map((f) => String(f?.[clave] ?? '').trim()).filter(Boolean); return v.length > 0 && v.filter((x) => SLUG_RE.test(x)).length / v.length > 0.6; };

export const rellenar = (plantilla, a = {}) => String(plantilla || '')
  .replace(/\{nombre\}/g, limpiarNombre(a.nombre || '').split(' ')[0] || '')
  .replace(/\{plan\}/g, a.plan || '');

// Teléfono → número para wa.me (sin + ni espacios; sin prefijo, España).
export function waDe(tel = '') {
  const d = String(tel).replace(/\D/g, '');
  if (d.length < 8) return '';
  if (String(tel).trim().startsWith('+') || d.length > 10) return d.replace(/^00/, '');
  return d.length === 9 ? `34${d}` : d;
}
