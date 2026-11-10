// Membresía de Skool (Configuración → 🎓 Membresía): los alumnos, sus planes, altas y bajas, y lo que se les manda.
//   GET  /api/membresia                                    → (equipo: Setting hoy o Métricas) { alumnos, eventos, cfg,
//        ltvExtra (lo que cada alumno ha pagado en Hotmart y ThriveCart), ultimaLectura }
//   POST /api/membresia { op: 'foto', alumnos, completa, confirmar, comunidad, url } → («config») lectura nueva de
//        Skool (del lector del navegador). Sin `confirmar`, solo dice qué cambiaría (altas, bajas, cambios de plan).
//        Con `completa: false` nadie se da de baja por no salir (la lectura podría estar a medias).
//   POST /api/membresia { op: 'cfg', cfg }                 → («config») planes: etiqueta de GHL y precio de cada uno,
//        etiqueta de baja, dirección de Miembros de Skool, mensajes por defecto.
//   POST /api/membresia { op: 'etiquetar', emails: [≤10] } → («config») pone a cada uno la etiqueta de su plan en GHL
//        (y quita la de otros planes y la de baja; a las bajas, la de baja). Así se disparan los flujos de GHL.
//   POST /api/membresia { op: 'contacto', emails: [≤10] }  → (Setting hoy) cruza cada alumno (por su email) con su ficha de
//        GHL: si está, su id, su móvil y sus etiquetas; si no, se apunta «no está en GHL».
//   POST /api/membresia { op: 'crear', emails: [≤10] }     → («config») crea en GHL la ficha de quien no la tiene (email,
//        nombre y móvil de Skool), para poder etiquetarlo y escribirle.
//   POST /api/membresia { op: 'email', email, asunto, texto } → (Setting hoy) le manda un email desde GHL.
//   POST /api/membresia { op: 'apuntar', email, canal }    → (Setting hoy) apunta que se le escribió por WhatsApp.
import { requireSession } from '../lib/auth.js';
import { clienteActual } from '../lib/cliente.js';
import { leerJSON, guardarJSON, reintentando, leerCompartida, guardarCompartida } from '../lib/store.js';
import { findContactByEmail, addTags, removeTags, sendEmail, upsertContact, setContactPhone } from '../lib/ghl.js';
import { json, readBody, errorResponse, mapLimit } from '../lib/http.js';
import { aplicarFoto, conMembresia, esCodigo, nombrePlan, tagDePlan, TAG_OK, EMAIL_RE, rellenar, intervaloDe, tocaAvisoSkool, MES_RE } from '../public/js/membresia.js';
import { dayInMadrid } from '../public/js/scoring.js';

const CLAVE = 'lsd_membresia';
const CLAVE_CFG = 'lsd_membresia_cfg';
const MAX_ALUMNOS = 6000;
const txt = (v, max = 160) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);
const PERMISO_VER = ['hoy', 'metricas', 'config'];

const vacio = () => ({ alumnos: {}, eventos: [] });
const leerEstado = async () => (await leerJSON(CLAVE, vacio)) || vacio();
const leerCfg = async () => (await leerJSON(CLAVE_CFG, () => ({}))) || {};

// Lo que llega del navegador (que lo leyó de Skool): solo los campos conocidos, con su tipo y tamaño.
function limpiarAlumno(a) {
  if (!a || typeof a !== 'object') return null;
  const email = txt(a.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return null;
  const num = (v, max = 1e7) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) && Math.abs(n) <= max ? Math.round(n * 100) / 100 : null; };
  const fecha = (v) => { const n = Number(v); return Number.isFinite(n) && n > 1e12 && n < 4.1e12 ? n : null; };
  const tel = txt(a.telefono, 30).replace(/[^\d+]/g, '');
  return {
    email,
    nombre: txt(a.nombre, 80),
    telefono: tel.replace(/\D/g, '').length >= 8 ? tel : '',
    plan: txt(a.plan, 60) || 'Sin plan',
    ...(esCodigo(a.planId) ? { planId: txt(a.planId, 80) } : {}),
    precio: num(a.precio, 1e6),
    intervalo: a.intervalo === 'año' ? 'año' : 'mes',
    ltv: num(a.ltv),
    alta: fecha(a.alta),
    puntos: num(a.puntos, 1e9),
    nivelSkool: num(a.nivelSkool, 1000),
    ultima: fecha(a.ultima),
    renueva: fecha(a.renueva),
    noRenueva: a.noRenueva === true,
    moneda: a.moneda === 'USD' ? 'USD' : a.moneda === 'EUR' ? 'EUR' : '',
    baja: a.baja === true,
  };
}

function limpiarCfg(c = {}, antes = {}) {
  const tag = (v) => { const t = txt(v, 80).toLowerCase(); return TAG_OK.test(t) ? t : ''; };
  const etiquetas = {};
  for (const [p, t] of Object.entries(c.etiquetas || {}).slice(0, 40)) { const v = tag(t); if (v) etiquetas[txt(p, 60)] = v; }
  const precios = {};
  for (const [p, x] of Object.entries(c.precios || {}).slice(0, 40)) {
    const n = Number(x?.importe);
    if (Number.isFinite(n) && n >= 0 && n < 1e6) precios[txt(p, 60)] = { importe: Math.round(n * 100) / 100, intervalo: intervaloDe(x?.intervalo) || 'mes' };
  }
  const mapa = {};
  for (const [k, v] of Object.entries(c.mapa || antes.mapa || {}).slice(0, 30)) if (/^[a-zA-Z]{2,20}$/.test(k)) mapa[k] = typeof v === 'boolean' ? v : txt(v, 200);
  const url = txt(c.urlSkool, 300);
  return {
    prefijo: txt(c.prefijo, 40) || 'alumno',
    etiquetas,
    tagBaja: tag(c.tagBaja),
    precios,
    // Nombre de cada código de plan de Skool («c852af…» → «VIP»). Varios códigos pueden ir al mismo plan.
    nombres: Object.fromEntries(Object.entries(c.nombres || {}).slice(0, 80).map(([k, v]) => [txt(k, 80), txt(v, 60)]).filter(([k, v]) => esCodigo(k) && v)),
    mapa,
    urlSkool: /^https:\/\/([a-z0-9-]+\.)*skool\.com\//i.test(url) ? url : '',
    mensajeWa: txt(c.mensajeWa, 1000),
    asunto: txt(c.asunto, 150),
    cuerpo: txt(c.cuerpo, 5000),
    // Mes en el que alguien pulsó «Ya lo he hecho» en el aviso de sincronizar Skool.
    ...(MES_RE.test(String(c.avisoSync || '')) ? { avisoSync: c.avisoSync } : {}),
  };
}

// Lo pagado en Hotmart y ThriveCart por cada alumno (Skool ya trae su LTV): cobros − reembolsos.
async function ltvOtras(emails) {
  const [hm, tc] = await Promise.all(['lsd_hotmart_ventas', 'lsd_thrivecart_ventas'].map((k) => leerJSON(k, () => ({ ventas: [] })).catch(() => ({ ventas: [] }))));
  const out = {};
  const vistos = new Set();
  for (const v of [...(hm?.ventas || []), ...(tc?.ventas || [])]) {
    const e = String(v.email || '').toLowerCase();
    if (!emails.has(e) || v.prueba || vistos.has(v.id)) continue;
    vistos.add(v.id);
    const imp = Math.abs(Number(v.importe) || 0);
    if (v.tipo === 'cobro') out[e] = (out[e] || 0) + imp;
    else if (v.tipo === 'reembolso') out[e] = (out[e] || 0) - imp;
  }
  for (const k of Object.keys(out)) out[k] = Math.max(0, Math.round(out[k] * 100) / 100);
  return out;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// Texto del email → HTML sencillo (párrafos y saltos de línea; los enlaces, clicables).
export const htmlDeTexto = (t) => String(t).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`).join('');

// Solo en el cliente de Discendo (el dueño de la membresía): en otro cliente, ni se lee ni se guarda nada.
const soloDiscendo = () => (conMembresia(clienteActual().id) ? null : json({ error: 'La membresía de Skool es de Discendo: entra en Discendo para verla' }, 403));

const hoyMadrid = () => dayInMadrid(new Date().toISOString());
const avisoToca = (estado, cfg) => tocaAvisoSkool({ hoy: hoyMadrid(), hecho: cfg?.avisoSync || '', mesLectura: estado?.ultimaLectura ? dayInMadrid(new Date(estado.ultimaLectura).toISOString()).slice(0, 7) : '' });

export async function GET(request) {
  try {
    await requireSession(request, { permiso: PERMISO_VER });
    const fuera = soloDiscendo();
    if (fuera) return fuera;
    // Datos que mandó el marcador de Skool con «Enviar a AlquimIA» (ver handlers/skool-entrada.js): de un solo uso.
    const entrada = new URL(request.url).searchParams.get('entrada');
    if (entrada) {
      await requireSession(request, { permiso: 'config' });
      if (!/^[a-f0-9]{32}$/.test(entrada)) return json({ error: 'Código no válido' }, 400);
      const clave = `skool-entrada|${entrada}`;
      const e = await leerCompartida(clave, 2 * 3600_000);
      if (!e?.datos) return json({ error: 'Esos datos de Skool ya se recogieron o han caducado: vuelve a pulsar el marcador en Skool.' }, 404);
      await guardarCompartida(clave, null);
      return json({ datos: e.datos });
    }
    const [estado, cfg] = await Promise.all([leerEstado(), leerCfg()]);
    // Aviso mensual de sincronizar Skool (lo pide la app al entrar en Discendo).
    if (new URL(request.url).searchParams.has('aviso')) return json({ toca: avisoToca(estado, cfg), ultimaLectura: estado.ultimaLectura || null });
    const emails = new Set(Object.keys(estado.alumnos || {}));
    return json({
      alumnos: Object.values(estado.alumnos || {}),
      eventos: (estado.eventos || []).slice(-1500),
      ultimaLectura: estado.ultimaLectura || null,
      lecturas: estado.lecturas || 0,
      comunidad: estado.comunidad || '',
      cfg: limpiarCfg(cfg, cfg),
      avisoSync: avisoToca(estado, cfg),
      ltvExtra: emails.size ? await ltvOtras(emails) : {},
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const body = await readBody(request);
    const op = body.op;
    // Antes de nada, una sesión válida (sin ella, 401 como en todo) y el cliente de Discendo.
    await requireSession(request, { permiso: PERMISO_VER });
    const fuera = soloDiscendo();
    if (fuera) return fuera;
    if (op === 'foto') {
      await requireSession(request, { permiso: 'config' });
      const foto = (Array.isArray(body.alumnos) ? body.alumnos : []).slice(0, MAX_ALUMNOS).map(limpiarAlumno).filter(Boolean);
      if (!foto.length) return json({ error: 'No llega ningún alumno con email válido' }, 400);
      const completa = body.completa !== false;
      const hacer = async () => {
        const estado = await leerEstado();
        const r = aplicarFoto(estado, foto, { ahora: Date.now(), completa });
        const resumen = {
          leidos: foto.length, altas: r.altas.length, bajas: r.bajas.length, cambios: r.cambios.length, vuelven: r.vuelven.length, iguales: r.iguales, primera: r.primera,
          activosAntes: Object.values(estado.alumnos || {}).filter((a) => a.activo !== false).length,
          muestra: { altas: r.altas.slice(0, 30), bajas: r.bajas.slice(0, 30), cambios: r.cambios.slice(0, 30), vuelven: r.vuelven.slice(0, 30) },
        };
        if (!body.confirmar) return resumen;
        const nuevo = { ...r.estado, comunidad: txt(body.comunidad, 80) || estado.comunidad || '' };
        // Tope de tamaño: si hubiera más, se quedan los activos y las bajas más recientes.
        const lista = Object.values(nuevo.alumnos);
        if (lista.length > MAX_ALUMNOS) {
          lista.sort((a, b) => (a.activo === false) - (b.activo === false) || (b.bajaEn || b.visto || 0) - (a.bajaEn || a.visto || 0));
          nuevo.alumnos = Object.fromEntries(lista.slice(0, MAX_ALUMNOS).map((a) => [a.email, a]));
        }
        await guardarJSON(CLAVE, nuevo, { motivo: `Membresía: ${r.altas.length} altas, ${r.bajas.length} bajas, ${r.cambios.length} cambios de plan` });
        return { ...resumen, guardado: true };
      };
      return json(body.confirmar ? await reintentando(hacer) : await hacer());
    }
    // «Ya lo he hecho» en el aviso de sincronizar Skool: no vuelve a salir (a nadie del equipo) hasta el mes que viene.
    if (op === 'aviso-hecho') {
      await requireSession(request, { permiso: 'config' });
      const mes = hoyMadrid().slice(0, 7);
      await reintentando(async () => {
        const antes = await leerCfg();
        await guardarJSON(CLAVE_CFG, limpiarCfg({ ...antes, avisoSync: mes }, antes), { motivo: `Membresía: aviso de sincronizar Skool hecho (${mes})` });
      });
      return json({ ok: true, mes });
    }
    if (op === 'cfg') {
      await requireSession(request, { permiso: 'config' });
      const antes = await leerCfg();
      const cfg = limpiarCfg({ ...antes, ...(body.cfg || {}) }, antes);
      await guardarJSON(CLAVE_CFG, cfg, { motivo: 'Membresía: configuración' });
      // Con nombres nuevos para los códigos de plan, lo ya guardado se renombra al momento (alumnos e historial).
      let renombrados = 0;
      if (body.cfg?.nombres && Object.keys(cfg.nombres).length) {
        await reintentando(async () => {
          const est = await leerEstado();
          renombrados = 0;
          for (const a of Object.values(est.alumnos || {})) {
            const cod = a.planId || (esCodigo(a.plan) ? a.plan : '');
            const nuevo = cod ? nombrePlan(cod, { nombres: cfg.nombres }) : a.plan;
            if (cod && nuevo !== cod && a.plan !== nuevo) { a.planId = cod; a.plan = nuevo; renombrados++; }
          }
          for (const e of est.eventos || []) {
            for (const k of ['plan', 'de']) if (e[k] && esCodigo(e[k]) && cfg.nombres[e[k]]) e[k] = cfg.nombres[e[k]];
          }
          if (renombrados) await guardarJSON(CLAVE, est, { motivo: `Membresía: nombre de los planes (${renombrados} alumnos)` });
        });
      }
      return json({ ok: true, cfg, renombrados });
    }
    if (op === 'etiquetar' || op === 'contacto' || op === 'crear') {
      await requireSession(request, { permiso: op === 'contacto' ? ['hoy', 'config'] : 'config' });
      const emails = [...new Set((Array.isArray(body.emails) ? body.emails : []).map((e) => txt(e, 200).toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
      if (!emails.length || emails.length > 10) return json({ error: 'Envía entre 1 y 10 alumnos por petición' }, 400);
      const [estado, cfg] = await Promise.all([leerEstado(), leerCfg()]);
      // Etiquetas que gestiona el panel (las de todos los planes y la de baja): solo esas se quitan.
      const planes = new Set(Object.values(estado.alumnos || {}).map((a) => a.plan));
      // (también las que se pusieron cuando el plan era un código: «alumno-c852af…», para quitarlas)
      const codigos = new Set(Object.values(estado.alumnos || {}).map((a) => a.planId).filter(Boolean));
      const gestionadas = new Set([...[...planes, ...codigos].map((p) => tagDePlan(cfg, p)), ...Object.values(cfg.etiquetas || {}), cfg.tagBaja].filter(Boolean));
      const ahora = Date.now();
      const cambios = {};
      const results = await mapLimit(emails, 4, async (email) => {
        const a = estado.alumnos?.[email];
        if (!a) return { email, ok: false, motivo: 'no es alumno' };
        try {
          let c = await findContactByEmail(email);
          // Crear su ficha en GHL (solo si se pide y no la tiene): con su email y nombre de Skool, y su móvil si lo hay.
          if (!c?.id && op === 'crear') {
            const [first, ...rest] = String(a.nombre || '').split(' ');
            c = await upsertContact({ email, firstName: first || '', lastName: rest.join(' '), source: 'AlquimIA · Membresía Skool' });
            if (c?.id && a.telefono) c = (await setContactPhone(c.id, a.telefono).catch(() => null)) || c;
          }
          // Cruce: si está en GHL, su id, su móvil (el de GHL si Skool no lo da) y sus etiquetas; si no, se apunta.
          if (!c?.id) { cambios[email] = { enGhl: false, cruzado: ahora }; return { email, ok: false, motivo: 'no está en GHL', enGhl: false }; }
          const tiene = (c.tags || []).map((t) => String(t).toLowerCase());
          const datos = { enGhl: true, cruzado: ahora, ghlId: c.id, ghlTags: tiene.slice(0, 60), ...(c.phone ? { telefonoGhl: c.phone } : {}), ...(c.phone && !a.telefono ? { telefono: c.phone } : {}) };
          if (op === 'etiquetar') {
            const quiere = a.activo === false ? [cfg.tagBaja].filter(Boolean) : [tagDePlan(cfg, a.plan)].filter(Boolean);
            const poner = quiere.filter((t) => !tiene.includes(t));
            const quitar = tiene.filter((t) => gestionadas.has(t) && !quiere.includes(t));
            if (poner.length) await addTags(c.id, poner);
            if (quitar.length) await removeTags(c.id, quitar);
            datos.tags = quiere;
            datos.ghlTags = [...tiene.filter((t) => !quitar.includes(t)), ...poner].slice(0, 60);
            cambios[email] = datos;
            return { email, ok: true, enGhl: true, poner, quitar, telefono: datos.telefono || a.telefono || '' };
          }
          cambios[email] = datos;
          return { email, ok: true, enGhl: true, creado: op === 'crear', telefono: datos.telefono || a.telefono || '', ghlTags: datos.ghlTags };
        } catch (e) {
          console.error('Membresía GHL', e.message);
          return { email, ok: false, motivo: 'error de GHL' };
        }
      });
      if (Object.keys(cambios).length) {
        await reintentando(async () => {
          const est = await leerEstado();
          for (const [email, d] of Object.entries(cambios)) if (est.alumnos?.[email]) Object.assign(est.alumnos[email], d);
          await guardarJSON(CLAVE, est, { motivo: op === 'etiquetar' ? 'Membresía: etiquetas de GHL' : op === 'crear' ? 'Membresía: alumnos creados en GHL' : 'Membresía: cruce con GHL' });
        });
      }
      return json({ results });
    }
    if (op === 'email' || op === 'apuntar') {
      const s = await requireSession(request, { permiso: ['hoy', 'config'] });
      const email = txt(body.email, 200).toLowerCase();
      const estado = await leerEstado();
      const a = estado.alumnos?.[email];
      if (!a) return json({ error: 'No es alumno de la membresía' }, 404);
      const canal = op === 'email' ? 'email' : body.canal === 'wa' ? 'wa' : '';
      if (!canal) return json({ error: 'Canal no válido' }, 400);
      if (op === 'email') {
        const asunto = rellenar(txt(body.asunto, 150), a);
        const texto = rellenar(txt(body.texto, 5000), a);
        if (!asunto || !texto) return json({ error: 'Falta el asunto o el texto' }, 400);
        const id = a.ghlId || (await findContactByEmail(email))?.id;
        if (!id) return json({ error: 'Este alumno no está en GHL: no se le puede mandar el email desde aquí' }, 404);
        await sendEmail(id, { subject: asunto, html: htmlDeTexto(texto) });
        a.ghlId = id;
      }
      a.contactos = [...(a.contactos || []), { t: Date.now(), canal, por: txt(s.user?.nombre || s.user?.email || s.role, 60) }].slice(-20);
      await reintentando(async () => {
        const est = await leerEstado();
        if (est.alumnos?.[email]) { est.alumnos[email].contactos = a.contactos; if (a.ghlId) est.alumnos[email].ghlId = a.ghlId; }
        await guardarJSON(CLAVE, est, { motivo: `Membresía: ${canal === 'email' ? 'email' : 'WhatsApp'} a un alumno` });
      });
      return json({ ok: true, contactos: a.contactos });
    }
    return json({ error: 'Operación desconocida' }, 400);
  } catch (e) {
    return errorResponse(e);
  }
}
