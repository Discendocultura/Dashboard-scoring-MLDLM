// Membresía de Skool: el panel de alumnos (Configuración → 🎓 Membresía). Skool no tiene API: los miembros se leen
// de su página de Miembros, en el navegador de quien tiene la sesión iniciada (ver skool-lector.js), y llegan aquí
// como filas «planas» ({ 'user.email': '…', 'member.tier': 'VIP', … }). Con eso:
//   · qué columna es cada dato (se adivina y se puede corregir: `adivinarMapa`, `normalizar`);
//   · altas, bajas y cambios de plan entre una lectura y la siguiente (`aplicarFoto`);
//   · las cifras de negocio: MRR, churn por plan, ARPU, LTV, vida media, más activos, en riesgo (`metricasMembresia`);
//   · la etiqueta de GHL de cada plan (`tagDePlan`) y los segmentos para escribirles.
// Lo usan el navegador (panel) y el servidor (handlers/membresia.js) y las pruebas.

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const txt = (v, max = 160) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
const DIA = 86_400_000;

// Los datos de cada alumno. `buscar`: claves que suelen traer ese dato (sobre la última parte de la clave y la clave
// entera, en minúsculas); `no`: claves que no son.
export const CAMPOS = [
  { id: 'email', label: 'Email', buscar: [/(^|\.)e-?mail$/, /email/], obligatorio: true },
  { id: 'nombre', label: 'Nombre', buscar: [/(^|\.)(full_?name|display_?name|name)$/, /(^|\.)first_?name$/], no: /group|community|tier|plan|level|product|price|question/ },
  { id: 'apellido', label: 'Apellido', buscar: [/(^|\.)last_?name$/] },
  { id: 'telefono', label: 'Teléfono', buscar: [/phone|tel[eé]fono|m[oó]vil|whatsapp/] },
  { id: 'plan', label: 'Plan', buscar: [/(^|\.)(tier|plan|membership_?(tier|level|type|name)|price_?name|product_?name)$/, /tier_?name|plan_?name|tier|plan/], no: /price|amount|cents|level$|points|id$/ },
  { id: 'precio', label: 'Precio', buscar: [/(^|\.)(price|amount|unit_?amount|recurring_?amount)$/, /price|amount|mrr/], no: /ltv|lifetime|total|paid|name|id$|currency/ },
  { id: 'intervalo', label: 'Cada cuánto paga', buscar: [/interval|billing_?(period|cycle)|recurr|frecuencia|periodo/], no: /count|amount/ },
  { id: 'ltv', label: 'Lo cobrado (LTV)', buscar: [/ltv|lifetime|total_?(paid|spent|revenue)|revenue/] },
  { id: 'alta', label: 'Fecha de alta', buscar: [/(^|\.)(joined|joined_?at|approved_?at|member_?since|created_?at)$/, /joined|approved|since|created/], no: /group|post|last|update|renew|cancel|churn/ },
  { id: 'puntos', label: 'Puntos (actividad)', buscar: [/(^|\.)points$/, /points|puntos/] },
  { id: 'nivelSkool', label: 'Nivel de Skool', buscar: [/(^|\.)level$/, /level$/], no: /tier|plan/ },
  { id: 'ultima', label: 'Última conexión', buscar: [/last_?(active|seen|online|login|visit)/, /last_?activity|online_?at/] },
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
export function normalizar(fila = {}, mapa = {}) {
  const g = (k) => (mapa[k] ? fila[mapa[k]] : undefined);
  const email = txt(g('email'), 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const nombre = [txt(g('nombre'), 80), mapa.apellido && mapa.apellido !== mapa.nombre ? txt(g('apellido'), 80) : ''].filter(Boolean).join(' ').slice(0, 80);
  const tel = txt(g('telefono'), 30).replace(/[^\d+]/g, '');
  const precioTxt = g('precio');
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const estado = txt(g('estado'), 40);
  return {
    email,
    nombre,
    telefono: tel.replace(/\D/g, '').length >= 8 ? tel : '',
    plan: txt(g('plan'), 60) || 'Sin plan',
    precio: importeDe(precioTxt, !!mapa.centimos),
    intervalo: intervaloDe(g('intervalo'), typeof precioTxt === 'string' ? precioTxt : '') || (mapa.intervaloFijo === 'año' ? 'año' : 'mes'),
    ltv: importeDe(g('ltv'), !!mapa.centimos),
    alta: fechaDe(g('alta')),
    puntos: num(g('puntos')),
    nivelSkool: num(g('nivelSkool')),
    ultima: fechaDe(g('ultima')),
    baja: estado ? BAJA_RE.test(estado) : false,
  };
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
    } else if (plan0 && n.plan && plan0 !== n.plan) {
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
    if (!planes.has(p)) planes.set(p, { plan: p, activos: 0, mrr: 0, altas: 0, bajas: 0, mrrPerdido: 0, ltvSuma: 0, ltvN: 0, vidaSuma: 0, vidaN: 0 });
    return planes.get(p);
  };
  for (const a of lista) {
    const x = plan(a.plan || 'Sin plan');
    if (a.activo !== false) { x.activos++; x.mrr = r2(x.mrr + precioMes(a, precios)); }
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
      plan: x.plan, activos: x.activos, mrr: x.mrr, altas: x.altas, bajas: x.bajas, churn, mrrPerdido: x.mrrPerdido, arpu,
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
  return {
    activos: nActivos, total: lista.length, mrr, arr: r2(mrr * 12), arpu: nActivos ? r2(mrr / nActivos) : 0,
    altas: t('altas'), bajas, neto: t('altas') - bajas, churn: nActivos + bajas ? bajas / (nActivos + bajas) : 0,
    mrrPerdido: r2(t('mrrPerdido')),
    ltvMedio: (() => { const l = lista.map(ltvDe).filter((x) => x > 0); return l.length ? r2(l.reduce((s, x) => s + x, 0) / l.length) : 0; })(),
    ltvTotal: r2(lista.reduce((s, a) => s + ltvDe(a), 0)),
    filas, masActivos, enRiesgo, antiguedad, conActividad,
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
  { id: 'bajas', label: 'Bajas (para recuperar)', ico: '👋', f: (a) => a.activo === false, orden: (a, b) => (b.bajaEn || 0) - (a.bajaEn || 0) },
];

// Mensaje con {nombre} (nombre de pila) y {plan}.
export const rellenar = (plantilla, a = {}) => String(plantilla || '')
  .replace(/\{nombre\}/g, (a.nombre || '').split(' ')[0] || '')
  .replace(/\{plan\}/g, a.plan || '');

// Teléfono → número para wa.me (sin + ni espacios; sin prefijo, España).
export function waDe(tel = '') {
  const d = String(tel).replace(/\D/g, '');
  if (d.length < 8) return '';
  if (String(tel).trim().startsWith('+') || d.length > 10) return d.replace(/^00/, '');
  return d.length === 9 ? `34${d}` : d;
}
