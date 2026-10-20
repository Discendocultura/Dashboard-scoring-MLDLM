// Que AlquimIA no abrume a quien empieza con acceso completo (admin nuevo). Aquí va la lógica (sin pantalla), para
// el navegador (public/js/app.js) y las pruebas:
//   · Mostrar poco a poco: el primer día, su embudo con Comercial · Leads · Métricas y, en ⚙️ Configuración, Equipo y Marca.
//     El resto aparece cuando tiene sentido (DESBLOQUEOS), con «Nuevo ✨» y una burbuja. «Ver todo» lo enseña ya.
//   · «Tu siguiente paso»: una sola tarjeta en el Inicio con lo siguiente que le toca hacer.
//   · Nuevo embudo con 2 preguntas: ¿tiene fecha? ¿por llamada o directa? → el tipo que le encaja.
//   · El buscador «¿Qué quieres hacer?» de la cabecera.
//   · La primera semana, avisos dosificados (solo lo urgente, como mucho 2).
//   · Quién se ha atascado (para avisar a la agencia).
// El progreso va en su onboarding (pasos: «u-<id>» desbloqueado; tours: «vn-<id>» ya visto el «Nuevo»).

const DIA = 86_400_000;
export const diasDesde = (iso, ahora = Date.now()) => (iso ? Math.max(0, Math.floor((ahora - Date.parse(iso)) / DIA)) : 0);

// ---------- Mostrar poco a poco ----------
// vistas: las pestañas que aparecen · pp: los botones de ⚙️ Configuración y del menú lateral (atributo data-pp).
// cuando(c): con lo que ya tiene (c: { dias, configurado, leads, calendario, lanzamientos, ventas }).
export const DESBLOQUEOS = [
  { id: 'plan', ico: '🗓️', nombre: 'Plan', texto: 'Organiza tu embudo: las tareas del equipo, el calendario con todas las fechas y cada día del carrito.',
    vistas: ['objetivos', 'calendario', 'tareas', 'carrito'], cuando: (c) => c.configurado || c.dias >= 1 },
  { id: 'crear', ico: '✨', nombre: 'Crear con IA', texto: 'Tu embudo ya está configurado: aquí creas páginas, emails, imágenes, anuncios y los mensajes del grupo con IA, con tu marca dentro.',
    vistas: ['paginas', 'emailsia', 'imagenes', 'anuncios', 'grupowa', 'automatizaciones'], cuando: (c) => c.configurado || c.dias >= 3 },
  { id: 'anuncios', ico: '📣', nombre: 'Anuncios', texto: 'Ya tienes leads: aquí ves cómo van tus anuncios de Meta (CPM, CTR, CPL…), los ganadores y qué tipo de lead trae cada uno (UTMs).',
    vistas: ['publicidad', 'avatar', 'vanuncios', 'danuncios', 'utms'], cuando: (c) => c.leads || c.dias >= 3 },
  { id: 'llamadas', ico: '📞', nombre: 'Llamadas', texto: 'Ya tienes calendario de reservas: aquí ves cada llamada con la ficha del lead y anotas cómo fue.',
    vistas: ['llamadas'], cuando: (c) => c.calendario || c.dias >= 5 },
  { id: 'analisis', ico: '🔎', nombre: 'Análisis', texto: 'Compara tus lanzamientos, mira quién te compra y el rendimiento del equipo.',
    vistas: ['avatarc', 'comparar', 'rendimiento', 'claude'], cuando: (c) => c.lanzamientos >= 2 || c.dias >= 7 },
  { id: 'negocio', ico: '📈', nombre: 'Inteligencia de negocio y Productos', texto: 'Ya vendes: en «Inteligencia de negocio» ves tu LTV, tu ROAS y qué producto lleva al siguiente; en «Configuración → Productos», tus precios.',
    vistas: [], cuando: (c) => c.ventas || c.dias >= 3 },
  { id: 'herramientas', ico: '🧰', nombre: 'Más herramientas', texto: 'En el lateral ya tienes la Operativa (las tareas) y los Procesos; en ⚙️ Configuración, las Conexiones y atajos y tus plantillas de WhatsApp.',
    vistas: [], cuando: (c) => c.dias >= 2 || (c.configurado && c.leads) },
];
const VISTA_DE = Object.fromEntries(DESBLOQUEOS.flatMap((d) => d.vistas.map((v) => [v, d.id])));
export const desbloqueoDeVista = (v) => VISTA_DE[v] || '';

// Los ya desbloqueados (guardados) y los que se desbloquean ahora con lo que tiene.
export function desbloqueos(pasos = {}, c = {}) {
  const ya = new Set(DESBLOQUEOS.filter((d) => pasos[`u-${d.id}`]).map((d) => d.id));
  const nuevos = DESBLOQUEOS.filter((d) => !ya.has(d.id) && d.cuando({ dias: 0, ...c })).map((d) => d.id);
  return { ya, nuevos, todos: new Set([...ya, ...nuevos]) };
}
// Las pestañas que se ven: las de siempre menos las que aún no se han desbloqueado.
export const filtrarVistas = (vistas, abiertos) => vistas.filter((v) => !VISTA_DE[v] || abiertos.has(VISTA_DE[v]));

// ---------- Tu siguiente paso ----------
// e: { crm, implementa, embudos, configurado, nombreEmbudo, marca, leads, crear }
export function siguientePaso(e) {
  if (!e.crm) return { id: 'crm', ico: '🔌', titulo: 'Tu CRM aún no está conectado', texto: 'AlquimIA lee tus leads y ventas de tu GoHighLevel (GHL). La conexión la hace la agencia: no tienes que tocar nada técnico. Mientras tanto, curiosea el ejemplo con datos inventados.', boton: '👀 Ver el ejemplo', accion: 'ejemplo' };
  if (!e.embudos) {
    return e.implementa
      ? { id: 'montando', ico: '🛠️', titulo: 'La agencia está montando tus embudos', texto: 'En cuanto estén, los verás aquí listos para revisar. Mientras tanto, mira cómo será con el ejemplo.', boton: '👀 Ver el ejemplo', accion: 'ejemplo' }
      : { id: 'embudo', ico: '🚀', titulo: 'Crea tu primer embudo', texto: 'Dos preguntas y te recomendamos el tipo que te encaja (lanzamiento, VSL, llamadas…).', boton: 'Crear mi embudo', accion: 'crear' };
  }
  if (!e.configurado) {
    return e.implementa
      ? { id: 'revisar', ico: '✅', titulo: `Revisa «${e.nombreEmbudo}»`, texto: 'La agencia lo está dejando configurado: comprueba que las fechas y los precios están bien.', boton: 'Revisarlo', accion: 'configurar' }
      : { id: 'configurar', ico: '⚙️', titulo: `Termina de configurar «${e.nombreEmbudo}»`, texto: 'Las etiquetas de GHL, las fechas y los precios: con eso AlquimIA empieza a leer tus leads y tus ventas.', boton: 'Configurarlo', accion: 'configurar' };
  }
  if (!e.marca) return { id: 'marca', ico: '🎨', titulo: 'Cuéntanos tu marca', texto: 'Unas preguntas sobre tu marca y tu cliente ideal: es la base de todo lo que escribe la IA (páginas, emails, anuncios).', boton: 'Rellenar Marca y avatar', accion: 'marca' };
  if (!e.leads) return { id: 'leads', ico: '👥', titulo: 'Mira tus leads', texto: 'Cada persona registrada con su puntuación y su temperatura. Pulsa un nombre para ver su ficha.', boton: 'Ver mis leads', accion: 'leads' };
  if (!e.crear) return { id: 'crear', ico: '✨', titulo: 'Crea algo con IA', texto: 'En «Crear» copias un prompt que ya lleva tu marca y tu oferta (una página, tus emails, imágenes…) y lo pegas en Claude o ChatGPT.', boton: 'Ir a Crear', accion: 'crear-ia' };
  return null;
}

// ---------- Nuevo embudo con 2 preguntas ----------
// fecha: 'si' | 'no' (¿la venta tiene una fecha concreta?) · venta: 'llamada' | 'directa'.
export function recomendarTipo({ fecha, venta } = {}) {
  if (fecha === 'si') return venta === 'llamada'
    ? { tipo: 'reto', porque: 'Con fecha y cerrando por llamada, un reto de varios días calienta y luego llamas a los más interesados.' }
    : { tipo: 'webinar', porque: 'Con fecha y venta directa, lo clásico: captación → webinar en directo → carrito abierto unos días.' };
  if (fecha === 'no') return venta === 'llamada'
    ? { tipo: 'llamadas', porque: 'Evergreen y cerrando por llamada: formulario de aplicación → llamada de venta.' }
    : { tipo: 'vsl', porque: 'Evergreen y venta directa: registro → vídeo de venta → compra (también puede llevar a llamada).' };
  return null;
}

// ---------- Buscador «¿Qué quieres hacer?» ----------
export const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const VACIAS = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'mi', 'mis', 'un', 'una', 'a', 'al', 'en', 'y', 'o', 'que', 'quiero', 'ver', 'como', 'para', 'por', 'con', 'me', 'se', 'lo', 'su', 'sus', 'tu', 'tus']);
// indice: [{ id, titulo, sub, claves }] → los que mejor encajan (máximo `max`).
export function buscar(indice, q, max = 7) {
  const palabras = normalizar(q).split(' ').filter((p) => p && !VACIAS.has(p));
  if (!palabras.length) return [];
  const out = [];
  for (const it of indice) {
    const tit = normalizar(it.titulo);
    const resto = normalizar(`${it.sub || ''} ${it.claves || ''}`);
    const enTit = tit.split(' ');
    const enResto = resto.split(' ');
    let puntos = 0;
    let encajan = 0;
    for (const p of palabras) {
      const antes = puntos;
      if (enTit.some((w) => w.startsWith(p))) puntos += 3;
      else if (enResto.some((w) => w.startsWith(p))) puntos += 2;
      else if (p.length >= 4 && (tit.includes(p) || resto.includes(p))) puntos += 1;
      if (puntos > antes) encajan++;
    }
    // Vale si encaja al menos la mitad de lo escrito; si encaja todo, va antes.
    if (encajan && encajan * 2 >= palabras.length) out.push({ it, puntos: puntos + (encajan === palabras.length ? 2 : 0) });
  }
  return out.sort((a, b) => b.puntos - a.puntos).slice(0, max).map((x) => x.it);
}

// ---------- Avisos dosificados la primera semana ----------
// Solo lo urgente (te mencionan o se te pasó una tarea), como mucho 2. Después de la primera semana, todo.
export const TIPOS_URGENTES = ['mencion', 'vencida'];
export function dosificar(items, { dias, nuevo } = {}) {
  if (!nuevo || dias >= 7) return items;
  return items.filter((n) => TIPOS_URGENTES.includes(n.tipo)).slice(0, 2);
}

// ---------- Quién se ha atascado ----------
// users: los de los proyectos (con onboarding, createdAt, lastLogin, accesoEnviado). Atascado: no ha terminado sus
// primeros pasos y lleva 3 días o más sin avanzar (o sin entrar desde que le dimos acceso).
export function atascados(users, ahora = Date.now(), umbral = 3) {
  const out = [];
  for (const u of users || []) {
    const o = u.onboarding;
    if (!o || o.hecho || o.todo || o.pasos?.fiesta || u.activo === false) continue;
    const fechas = [o.inicio, ...Object.values(o.pasos || {}), ...Object.values(o.tours || {})].filter(Boolean).sort();
    const ultima = fechas.at(-1) || u.createdAt;
    const sinEntrar = !u.lastLogin;
    const desde = sinEntrar ? u.accesoEnviado || u.createdAt : ultima;
    const dias = diasDesde(desde, ahora);
    if (dias < umbral) continue;
    const hechos = Object.keys(o.pasos || {}).filter((k) => !k.startsWith('u-') && k !== 'primer-acceso').length;
    out.push({ id: u.id, nombre: u.nombre, email: u.email, dias, sinEntrar, hechos, desde });
  }
  return out.sort((a, b) => b.dias - a.dias);
}
