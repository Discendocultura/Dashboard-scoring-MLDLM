// Onboarding para quien entra por primera vez: que no se agobie. Todo con «burbujas» (la pantalla se oscurece y solo
// queda iluminado lo que se explica), poco a poco y siempre con «Saltar»:
//   · Bienvenida (una pantalla) y el recorrido principal de su rol (4-6 burbujas).
//   · Mini-recorridos de 2-3 burbujas la primera vez que entra en cada pestaña (sustituyen a los avisos «Entendido»).
//   · «Primeros pasos»: una pastilla abajo con las tareas reales de su rol, que se marcan solas al hacerlas (confeti).
//   · Vista sencilla: hasta terminar los primeros pasos, las pestañas avanzadas no se ven («Ver todas» las enseña).
//   · El botón «?» de arriba: repetir el recorrido, la ayuda de esta pantalla y los primeros pasos.
//   · Superadmin: «🎓 Ver como usuario nuevo» (vista previa por rol, sin guardar nada).
// El progreso se guarda en el usuario (POST /api/usuarios { op: 'onboarding' }): vale en todos sus dispositivos.
// Quien ya usaba el dashboard antes tiene { hecho: true } y solo ve el botón «?».
import { lanzarConfeti } from './confeti.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const LS_PREVIEW = 'lsd_onb_preview';
export const ROLES_ONB = [
  { id: 'admin', nombre: 'Admin', desc: 'Lleva el cliente: embudos, configuración y crear con IA' },
  { id: 'setter', nombre: 'Setter', desc: 'Escribe a los leads y hace las llamadas' },
  { id: 'cliente', nombre: 'Cliente', desc: 'Solo ve sus resultados y sus procesos' },
  { id: 'operativa', nombre: 'Solo Operativa', desc: 'Solo sus tareas y los procesos' },
];

// ---------- Recorrido principal de cada rol ----------
const AYUDA = { sel: '#btn-onb-ayuda, #portal-ayuda', titulo: '¿Te pierdes? Aquí', texto: 'Con este botón repites el recorrido, ves la ayuda de la pantalla en la que estés y tus primeros pasos. No te preocupes por aprenderlo todo hoy.' };
export const TOURS = {
  admin: [
    { sel: '#sb-items', titulo: 'Tus embudos', texto: 'Cada embudo (lanzamientos con webinar, VSL, venta directa…) tiene aquí sus datos. Elige uno para verlo.' },
    { sel: '#ctx-bar', titulo: 'Dónde estás', texto: 'El embudo y el lanzamiento que estás viendo. Cámbialo en el desplegable; con «Configurar» pones fechas, precios y enlaces.' },
    { sel: 'nav.views, #nav-movil', titulo: 'Las pestañas van por momentos', texto: '«Hoy» es lo del día, «Leads» y «Métricas» cómo va, «Anuncios» y «Crear» lo que preparas con IA, y «Plan» la organización.' },
    { sel: '.views [data-view-grupo="crear"]', titulo: 'Crear con IA', texto: 'Páginas, emails, imágenes y mensajes del grupo: copias un prompt que ya lleva todo y lo pegas en Claude o en ChatGPT.' },
    { sel: '#tb-menu-ajustes', titulo: 'Mi negocio', texto: 'El equipo, la marca y el avatar (la base de todo lo que escribe la IA) y las conexiones.' },
    AYUDA,
  ],
  setter: [
    { sel: '[data-view-grupo="comercial"]', titulo: 'Empieza siempre por «Hoy»', texto: 'A quién escribir hoy, ya ordenado por prioridad y con su temperatura. Pulsa WhatsApp y el mensaje sale escrito.' },
    { sel: '.view-tab[data-view="leads"]:not([hidden]), .view-tab[data-view="vleads"]:not([hidden])', titulo: 'Todos tus leads', texto: 'Cada persona registrada con su puntuación. Pulsa su nombre para ver su ficha completa.' },
    { sel: '#ctx-bar', titulo: 'Qué lanzamiento ves', texto: 'Si hay varios, cámbialo en este desplegable.' },
    { sel: '#tb-menu-ajustes', titulo: 'Tus mensajes', texto: 'En «Mensajes de WhatsApp» están los textos de cada botón. Puedes ajustarlos a tu manera de escribir.' },
    AYUDA,
  ],
  cliente: [
    { sel: '#portal-nav', titulo: 'Tus embudos', texto: 'Elige qué quieres ver: un lanzamiento, tu embudo siempre abierto…' },
    { sel: '#portal-body > :first-child', titulo: 'Tus resultados', texto: 'Las cifras importantes y cómo van frente a los objetivos. Se actualizan solas.' },
    { sel: '#portal-procesos', titulo: 'Vuestros procesos', texto: 'Los que la agencia comparte contigo y los vuestros, paso a paso y en un solo sitio.' },
    { sel: '#portal-cuenta', titulo: 'Tu cuenta', texto: 'Tu contraseña y tus datos.' },
    AYUDA,
  ],
  operativa: [
    { sel: '#solo-op-operativa', titulo: 'Tus tareas', texto: 'Los tableros de tu proyecto: qué toca hoy, qué va con retraso y qué está bloqueado.' },
    { sel: '#solo-op-procesos', titulo: 'Cómo se hace cada cosa', texto: 'Los procesos con sus pasos, vídeos y enlaces. Si dudas, mira aquí antes de preguntar.' },
    AYUDA,
  ],
};

// ---------- Mini-recorridos de cada pestaña (la primera vez que se entra) ----------
const V = (view) => `#view-${view}`;
export const TOURS_VISTA = {
  hoy: [
    { sel: '#hoy-lists', titulo: 'A quién escribir hoy', texto: 'Ya ordenado: el número de la izquierda es la prioridad y el color, la temperatura (rojo, muy caliente; azul, frío).' },
    { sel: '#view-hoy [data-wa]', titulo: 'Un clic y listo', texto: 'Se abre tu WhatsApp con el mensaje ya escrito. Al volver, queda marcado como enviado.' },
  ],
  llamadas: [{ sel: V('llamadas'), titulo: 'Tus llamadas', texto: 'Las del calendario de GHL. Pulsa una para ver la ficha del lead antes de llamar y anota cómo fue al terminar.' }],
  leads: [
    { sel: '#kpis', titulo: 'El resumen', texto: 'Cuántos registrados hay y cómo se reparten por temperatura.' },
    { sel: '#view-leads .filters', titulo: 'Filtra', texto: 'Busca a alguien o quédate solo con los calientes, los que no has contactado…' },
    { sel: '#view-leads [data-ficha-lead]', titulo: 'Su ficha', texto: 'Pulsa el nombre para ver todo lo que ha hecho: clases, encuesta, compras y su WhatsApp.' },
  ],
  vleads: [{ sel: V('vleads'), titulo: 'Tus leads', texto: 'Cada persona con lo que ha visto y su WhatsApp según su estado.' }],
  metricas: [
    { sel: '#msub-metricas', titulo: 'Por categorías', texto: 'Resumen, ventas, captación, vídeos… Empieza por el resumen.' },
    { sel: '#metric-hero', titulo: 'Lo importante, arriba', texto: 'Las cifras clave. Pasa el ratón por el «?» de cada tarjeta para ver cómo se calcula.' },
  ],
  vmetricas: [{ sel: V('vmetricas'), titulo: 'Cómo va el embudo', texto: 'Registros, consumo, llamadas, ventas y ROAS. Elige el periodo arriba.' }],
  dmetricas: [{ sel: V('dmetricas'), titulo: 'Tus ventas', texto: 'Ventas, facturación, ticket medio y ROAS del periodo elegido arriba.' }],
  publicidad: [{ sel: V('publicidad'), titulo: 'Tus anuncios en Meta', texto: 'Como en el Administrador de anuncios: pulsa una campaña para ver sus conjuntos y anuncios. Arriba te avisa si toca preparar anuncios nuevos.' }],
  anuncios: [{ sel: '#anuncios-body .an-grid', titulo: 'Un objetivo, un prompt', texto: 'Elige el objetivo y copia su prompt: lleva tus anuncios ganadores y tu marca. Pégalo en Claude o en ChatGPT.' }],
  paginas: [{ sel: '#paginas-body .st-grid', titulo: 'Una página, un prompt', texto: 'Copia el de la página que necesites, pégalo en Claude (o en ChatGPT) y lo que te dé lo pegas en GHL.' }],
  emailsia: [{ sel: '#emailsia-body .em-panel', titulo: 'Tus emails, en 3 pasos', texto: 'Elige qué emails quieres, copia el prompt y pégalo en Claude o en ChatGPT. Las fechas ya salen solas.' }],
  imagenes: [{ sel: '#imagenes-body .ia-paso', titulo: 'Una imagen, un prompt', texto: 'Cada imagen trae su texto exacto y su estilo. Copia el prompt, pégalo en tu IA de imágenes y márcala como hecha.' }],
  grupowa: [{ sel: '#grupowa-body .st-paso', titulo: 'Los mensajes del grupo', texto: 'Copia el prompt, pega aquí la respuesta y prográmalos en SendFlow con un botón.' }],
  automatizaciones: [{ sel: V('automatizaciones'), titulo: 'Los workflows de GHL', texto: 'Cada uno con su prompt para crearlo. Marca su estado al terminar.' }],
  objetivos: [{ sel: V('objetivos'), titulo: 'El planificador', texto: 'Proyecta el lanzamiento con los anteriores: inversión, leads y ventas. Abajo ves cuánto llevas.' }],
  calendario: [{ sel: V('calendario'), titulo: 'Todas las fechas', texto: 'Los hitos de cada lanzamiento, las tareas y los eventos juntos.' }],
  tareas: [{ sel: V('tareas'), titulo: 'Las tareas del equipo', texto: 'Con responsable y fecha. «Cargar tareas habituales» crea la lista de siempre con las fechas calculadas.' }],
  carrito: [{ sel: V('carrito'), titulo: 'Cada día del carrito', texto: 'Qué pasa ese día, los emails y WhatsApps previstos y la estrategia.' }],
  avatarc: [{ sel: V('avatarc'), titulo: 'Quién compra', texto: 'El perfil de las compradoras sacado de la encuesta. Úsalo para anuncios, páginas y mensajes.' }],
  comparar: [{ sel: V('comparar'), titulo: 'Comparar', texto: 'Este lanzamiento frente a los anteriores: qué mejora y qué empeora.' }],
  rendimiento: [{ sel: V('rendimiento'), titulo: 'El equipo', texto: 'Por persona: WhatsApps, llamadas, cierres y tiempo de respuesta.' }],
  claude: [{ sel: V('claude'), titulo: 'Analizar con Claude', texto: 'Copia el prompt y Claude te dice qué funcionó y qué mejorar para el próximo.' }],
};

// ---------- Primeros pasos de cada rol ----------
// sel: un clic en algo que encaje lo marca · vistas: entrar en esa pestaña lo marca · ir: cómo llevar a la persona ahí.
const COPIAR = '#em-copiar, [data-em-gpt], #gw-copiar, [data-gw-gpt], [data-pag-copiar], [data-an-copiar], [data-copiar-img], #narr-copiar, #narr-copiar-gpt';
const RECORRIDO = { id: 'recorrido', txt: 'Haz el recorrido de 1 minuto', ir: 'recorrido' };
export const PASOS = {
  admin: [
    RECORRIDO,
    { id: 'marca', txt: 'Rellena Marca y avatar', sub: 'La base de todo lo que escribe la IA', sel: '#btn-marca, [data-proxy="#btn-marca"], [data-abrir-marca]', ir: 'marca' },
    { id: 'leads', txt: 'Mira los leads de un embudo', vistas: ['leads', 'vleads'], ir: 'leads' },
    { id: 'ficha', txt: 'Abre la ficha de un lead', sel: '[data-ficha-lead], [data-ll-card]', ir: 'leads' },
    { id: 'conexiones', txt: 'Revisa las conexiones', sub: 'SendFlow, setter IA…', sel: '#btn-conexiones, [data-proxy="#btn-conexiones"]', ir: 'conexiones' },
    { id: 'crear', txt: 'Crea algo con IA', sub: 'Copia un prompt de «Crear»', sel: COPIAR, ir: 'crear' },
  ],
  setter: [
    RECORRIDO,
    { id: 'hoy', txt: 'Mira a quién escribir hoy', vistas: ['hoy'], ir: 'hoy' },
    { id: 'ficha', txt: 'Abre la ficha de un lead', sel: '[data-ficha-lead], [data-ll-card]', ir: 'leads' },
    { id: 'wa', txt: 'Envía tu primer WhatsApp', sel: '[data-wa]', ir: 'hoy' },
    { id: 'llamadas', txt: 'Revisa tus llamadas', vistas: ['llamadas'], ir: 'llamadas' },
  ],
  cliente: [
    RECORRIDO,
    { id: 'resultados', txt: 'Mira tus resultados', auto: true },
    { id: 'procesos', txt: 'Echa un vistazo a los procesos', sel: '#portal-procesos', ir: 'procesos' },
    { id: 'cuenta', txt: 'Revisa tu cuenta', sel: '#portal-cuenta', ir: 'cuenta' },
  ],
  operativa: [
    RECORRIDO,
    { id: 'operativa', txt: 'Abre tus tareas', sel: '#solo-op-operativa, #btn-operativa', ver: '#solo-op-operativa, #tb-menu-ajustes', ir: 'operativa' },
    { id: 'procesos', txt: 'Consulta un proceso', sel: '#solo-op-procesos, #btn-procesos, [data-proxy="#btn-procesos"]', ver: '#solo-op-procesos, #tb-menu-ajustes', ir: 'procesos' },
  ],
};

export function progresoDe(onb, rol) {
  const pasos = PASOS[rol] || PASOS.setter;
  if (!onb || onb.hecho) return { hechos: pasos.length, total: pasos.length, hecho: true };
  const hechos = pasos.filter((p) => onb.pasos?.[p.id] || (p.id === 'recorrido' && onb.tours?.principal)).length;
  return { hechos, total: pasos.length, hecho: hechos >= pasos.length };
}

// ---------- Estado ----------
let ctx = null; // { api, rol, nombre, estado, preview, acciones, vista }
let actual = null; // tour en marcha

export const onbActivo = () => Boolean(ctx && ctx.estado && !ctx.estado.hecho);
const pasoHecho = (p) => Boolean(ctx.estado.pasos?.[p.id] || (p.id === 'recorrido' && ctx.estado.tours?.principal));

function guardar(cambio) {
  const e = ctx.estado;
  if (e.hecho) return;
  const ahora = new Date().toISOString();
  if (cambio.tour) e.tours[cambio.tour] ||= ahora;
  if (cambio.paso) e.pasos[cambio.paso] ||= ahora;
  if ('cerrado' in cambio) e.cerrado = Boolean(cambio.cerrado);
  if ('todo' in cambio) e.todo = Boolean(cambio.todo);
  if (cambio.reiniciarTours) e.tours = e.tours.principal ? { principal: e.tours.principal } : {};
  if (!ctx.preview) ctx.api('/api/usuarios', { method: 'POST', body: { op: 'onboarding', cambio } }).catch(() => { /* sin conexión: se vuelve a intentar con el siguiente cambio */ });
  pintarPastilla();
  aplicarSencilla();
}

// ---------- Arranque ----------
// opts: { api, rol, nombre, estado, preview, acciones: { marca, conexiones, irVista(v), crear, procesos, cuenta, operativa } }
export function iniciarOnboarding(opts) {
  ctx = { ...opts, estado: structuredClone(opts.estado || { hecho: true }) };
  if (!ctx.estado.hecho) { ctx.estado.tours ||= {}; ctx.estado.pasos ||= {}; }
  if (!document.body.dataset.onbClics) {
    document.body.dataset.onbClics = '1';
    document.addEventListener('click', alClicar, true);
    document.addEventListener('keydown', alTecla);
    window.addEventListener('resize', () => recolocar());
    window.addEventListener('scroll', () => recolocar(), true);
  }
  pintarPreview();
  pintarPastilla();
  aplicarSencilla();
  if (!onbActivo()) return;
  for (const p of PASOS[ctx.rol] || []) if (p.auto && !pasoHecho(p)) guardar({ paso: p.id });
  if (!ctx.estado.tours.principal) setTimeout(bienvenida, 600);
}

function bienvenida() {
  const nombre = String(ctx.nombre || '').trim().split(/\s+/)[0];
  mostrarBurbuja({
    centro: true,
    titulo: `¡Hola${nombre ? `, ${esc(nombre)}` : ''}! 👋`,
    html: '<p>Esto tiene muchas cosas, pero no hace falta aprenderlas todas hoy. Te enseño <strong>lo básico en 1 minuto</strong> y luego te guío paso a paso.</p>',
    botones: [{ txt: 'Ahora no', clase: 'ghost', fn: () => { cerrarBurbuja(); guardar({ tour: 'principal' }); } },
      { txt: 'Empezar →', clase: 'primary', fn: () => { cerrarBurbuja(); recorridoPrincipal(); } }],
  });
}

export async function recorridoPrincipal() {
  await ctx?.acciones?.antesDelTour?.(); // p. ej. dejar a la vista el embudo (si estaba en el Inicio)
  return tour(TOURS[ctx?.rol] || TOURS.setter, { id: 'principal' }).then(() => {
    if (onbActivo()) { guardar({ tour: 'principal', paso: 'recorrido' }); if (!ctx.estado.cerrado) abrirPastilla(); }
  });
}

// Al entrar en una pestaña: marca sus pasos y, la primera vez, su mini-recorrido. Devuelve true si se encarga él
// de la ayuda de esa pestaña (así no sale además el aviso «Entendido»).
export function onbVista(view) {
  if (!ctx) return false;
  ctx.vista = view;
  if (!onbActivo()) return false;
  for (const p of PASOS[ctx.rol] || []) if (p.vistas?.includes(view) && !pasoHecho(p)) guardar({ paso: p.id });
  if (!TOURS_VISTA[view]) return false;
  const clave = `v-${view}`;
  if (!ctx.estado.tours[clave] && ctx.estado.tours.principal && !actual) {
    setTimeout(() => { if (ctx.vista === view && !actual && !ctx.estado.tours[clave]) tour(TOURS_VISTA[view], { id: clave }).then(() => guardar({ tour: clave })); }, 700);
  }
  return true;
}
// «Volver a ver las ayudas» (menú de la cuenta): los mini-recorridos de cada pestaña vuelven a salir.
export const onbReiniciarAyudas = () => { if (onbActivo()) guardar({ reiniciarTours: true }); };
export const onbMarcar = (id) => { if (onbActivo() && !ctx.estado.pasos[id]) guardar({ paso: id }); };

function alClicar(e) {
  if (!onbActivo()) return;
  for (const p of PASOS[ctx.rol] || []) if (p.sel && !pasoHecho(p) && e.target.closest?.(p.sel)) guardar({ paso: p.id });
}

// ---------- Motor de burbujas ----------
function visible(sel) {
  if (!sel) return null;
  // Que se vea de verdad: con tamaño, sin ocultar y dentro de la pantalla (en el móvil, el menú lateral está fuera).
  return [...document.querySelectorAll(sel)].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth && getComputedStyle(el).visibility !== 'hidden';
  }) || null;
}

export function tour(pasos, { id = '' } = {}) {
  const lista = pasos.filter((p) => !p.sel || visible(p.ver || p.sel)); // `ver`: si el botón vive en un menú cerrado
  if (!lista.length) return Promise.resolve();
  cerrarBurbuja();
  document.getElementById('onb-pasos')?.classList.remove('abierto'); // que la lista no tape lo que se explica
  return new Promise((res) => { actual = { id, pasos: lista, i: 0, res }; pintarPaso(); });
}

function pintarPaso() {
  const t = actual;
  const p = t.pasos[t.i];
  const el = visible(p.sel);
  if (p.sel && !el) { siguiente(); return; } // desapareció (cambio de pantalla): al siguiente
  const n = t.pasos.length;
  mostrarBurbuja({
    el,
    contador: n > 1 ? `${t.i + 1} de ${n}` : '',
    titulo: esc(p.titulo),
    html: `<p>${esc(p.texto)}</p>`,
    botones: [
      ...(n > 1 && t.i < n - 1 ? [{ txt: 'Saltar', clase: 'link', fn: () => terminar() }] : []),
      ...(t.i > 0 ? [{ txt: '← Atrás', clase: 'ghost', fn: () => { t.i -= 1; pintarPaso(); } }] : []),
      { txt: t.i < n - 1 ? 'Siguiente →' : (n > 1 ? '¡Listo!' : 'Entendido'), clase: 'primary', fn: () => siguiente() },
    ],
  });
}
function siguiente() { if (!actual) return; if (actual.i < actual.pasos.length - 1) { actual.i += 1; pintarPaso(); } else terminar(); }
function terminar() { const t = actual; actual = null; cerrarBurbuja(); t?.res(); }

let capa = null;
function mostrarBurbuja({ el = null, centro = false, contador = '', titulo, html, botones }) {
  cerrarBurbuja(false);
  capa = document.createElement('div');
  capa.className = 'onb';
  capa.innerHTML = `<div class="onb-velo${el ? '' : ' lleno'}"></div>${el ? '<div class="onb-foco"></div>' : ''}
    <div class="onb-burbuja${centro || !el ? ' centro' : ''}" role="dialog" aria-modal="true" aria-labelledby="onb-tit">
      ${el ? '<span class="onb-flecha" aria-hidden="true"></span>' : ''}
      ${contador ? `<p class="onb-cont">${contador}</p>` : ''}
      <h3 id="onb-tit">${titulo}</h3>
      <div class="onb-txt">${html}</div>
      <footer class="onb-acc">${botones.map((b, i) => `<button type="button" class="btn ${b.clase === 'link' ? 'link onb-saltar' : b.clase}" data-onb-b="${i}">${esc(b.txt)}</button>`).join('')}</footer>
    </div>`;
  capa.addEventListener('click', (e) => { const b = e.target.closest('[data-onb-b]'); if (b) botones[Number(b.dataset.onbB)].fn(); });
  capa._el = el;
  document.body.append(capa);
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: 'center' });
  }
  recolocar();
  capa.querySelector('.onb-acc .primary')?.focus({ preventScroll: true });
}
function cerrarBurbuja() { capa?.remove(); capa = null; }

function recolocar() {
  if (!capa) return;
  const el = capa._el;
  const b = capa.querySelector('.onb-burbuja');
  if (!el) return;
  if (!el.isConnected) { if (actual) siguiente(); else cerrarBurbuja(); return; }
  const r = el.getBoundingClientRect();
  const pad = 6;
  const foco = capa.querySelector('.onb-foco');
  Object.assign(foco.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  // Móvil: la burbuja va como tarjeta abajo, o arriba si lo que se explica está en la mitad de abajo.
  const movil = window.innerWidth < 640;
  const arribaM = movil && r.top + r.height / 2 > window.innerHeight / 2;
  b.classList.toggle('abajo-fijo', movil && !arribaM);
  b.classList.toggle('arriba-fijo', arribaM);
  if (movil) return;
  const bw = b.offsetWidth; const bh = b.offsetHeight; const W = window.innerWidth; const H = window.innerHeight;
  const debajo = r.bottom + 16 + bh < H || r.top - 16 - bh < 0;
  const top = debajo ? Math.min(r.bottom + 16, H - bh - 12) : r.top - 16 - bh;
  const left = Math.max(12, Math.min(W - bw - 12, r.left + r.width / 2 - bw / 2));
  Object.assign(b.style, { top: `${Math.max(12, top)}px`, left: `${left}px` });
  b.classList.toggle('arriba', !debajo);
  const flecha = capa.querySelector('.onb-flecha');
  if (flecha) flecha.style.left = `${Math.max(18, Math.min(bw - 18, r.left + r.width / 2 - left))}px`;
}

function alTecla(e) {
  if (!capa) return;
  if (e.key === 'Escape') { e.preventDefault(); if (actual) terminar(); else capa.querySelector('.onb-acc .ghost, .onb-acc .primary')?.click(); }
  if (actual && e.key === 'ArrowRight') { e.preventDefault(); siguiente(); }
  if (actual && e.key === 'ArrowLeft' && actual.i > 0) { e.preventDefault(); actual.i -= 1; pintarPaso(); }
}

// ---------- Primeros pasos (pastilla abajo a la izquierda) ----------
function pintarPastilla() {
  let el = document.getElementById('onb-pasos');
  const pasos = PASOS[ctx?.rol] || [];
  if (!onbActivo() || ctx.estado.cerrado || !pasos.length || !ctx.estado.tours.principal) { el?.remove(); return; }
  const { hechos, total } = progresoDe(ctx.estado, ctx.rol);
  if (!el) {
    el = document.createElement('div');
    el.id = 'onb-pasos';
    el.className = 'onb-pasos';
    el.addEventListener('click', alClicarPasos);
    document.body.append(el);
  }
  const abierto = el.classList.contains('abierto');
  const pct = Math.round((hechos / total) * 100);
  el.innerHTML = `<button type="button" class="onb-pill" data-onb-pill aria-expanded="${abierto}"><span class="onb-pill-ico" aria-hidden="true">🚀</span> Primeros pasos <b>${hechos}/${total}</b><span class="onb-pill-barra"><i style="width:${pct}%"></i></span></button>
    <div class="onb-panel" role="region" aria-label="Primeros pasos">
      <header><strong>🚀 Tus primeros pasos</strong><span class="muted small">${hechos === total ? '¡Todo hecho! 🎉' : `${total - hechos} por hacer · se marcan solos`}</span></header>
      <ol>${pasos.map((p) => { const ok = pasoHecho(p); return `<li class="${ok ? 'ok' : ''}"><span class="onb-check" aria-hidden="true">${ok ? '✓' : ''}</span><span class="onb-p-txt">${esc(p.txt)}${p.sub ? `<small>${esc(p.sub)}</small>` : ''}</span>${!ok && p.ir ? `<button type="button" class="btn small" data-onb-ir="${esc(p.ir)}">Ir</button>` : ''}</li>`; }).join('')}</ol>
      <footer>${ctx.estado.todo || !sencillaActiva() ? '' : '<button type="button" class="link small" data-onb-todo>👀 Ver todas las pestañas</button>'}<button type="button" class="link small" data-onb-cerrar>Ocultar la lista</button></footer>
    </div>`;
  if (hechos === total && !ctx.estado.pasos.fiesta) {
    guardar({ paso: 'fiesta' });
    el.classList.add('abierto');
    fiesta();
  }
}
function abrirPastilla() { const el = document.getElementById('onb-pasos'); if (el) { el.classList.add('abierto'); el.querySelector('[data-onb-pill]')?.setAttribute('aria-expanded', 'true'); } }
function alClicarPasos(e) {
  const el = e.currentTarget;
  if (e.target.closest('[data-onb-pill]')) { el.classList.toggle('abierto'); e.target.closest('[data-onb-pill]').setAttribute('aria-expanded', el.classList.contains('abierto')); return; }
  const ir = e.target.closest('[data-onb-ir]');
  if (ir) { el.classList.remove('abierto'); irA(ir.dataset.onbIr); return; }
  if (e.target.closest('[data-onb-todo]')) { guardar({ todo: true }); return; }
  if (e.target.closest('[data-onb-cerrar]')) guardar({ cerrado: true });
}
function irA(ir) {
  if (ir === 'recorrido') { recorridoPrincipal(); return; }
  const a = ctx.acciones || {};
  if (['leads', 'hoy', 'llamadas'].includes(ir)) a.irVista?.(ir);
  else a[ir]?.();
}
function fiesta() {
  const c = document.createElement('canvas');
  c.className = 'onb-confeti';
  document.body.append(c);
  lanzarConfeti(c);
  setTimeout(() => c.remove(), 4000);
}

// ---------- Vista sencilla ----------
export const sencillaActiva = () => onbActivo() && ['admin', 'setter'].includes(ctx.rol) && !ctx.estado.todo && !progresoDe(ctx.estado, ctx.rol).hecho;
function aplicarSencilla() { document.body.classList.toggle('vista-sencilla', sencillaActiva()); }
export function verTodas() { if (onbActivo()) guardar({ todo: true }); }

// ---------- Botón «?» ----------
export function abrirAyuda(boton) {
  cerrarMenu();
  if (!ctx) return;
  const m = document.createElement('div');
  m.className = 'onb-menu';
  m.id = 'onb-menu';
  const vista = ctx.vista && TOURS_VISTA[ctx.vista] && visible(TOURS_VISTA[ctx.vista][0].sel);
  const opc = [
    ['recorrido', '🧭', 'Repetir el recorrido', 'Lo básico en 1 minuto'],
    ...(vista ? [['pantalla', '💡', 'Ayuda de esta pantalla', 'Qué hay aquí y para qué sirve']] : []),
    ...(onbActivo() ? [['pasos', '🚀', 'Mis primeros pasos', `${progresoDe(ctx.estado, ctx.rol).hechos} de ${progresoDe(ctx.estado, ctx.rol).total} hechos`]] : []),
    ...(sencillaActiva() ? [['todo', '👀', 'Ver todas las pestañas', 'Ahora estás en la vista sencilla']] : []),
    ...(ctx.superadmin ? [['preview', '🎓', ctx.preview ? 'Cambiar de rol en la vista previa' : 'Ver como usuario nuevo', 'El onboarding como lo ve alguien nuevo']] : []),
  ];
  m.innerHTML = `<p class="onb-menu-t">¿En qué te ayudo?</p>${opc.map(([id, ico, t, s]) => `<button type="button" data-onb-menu="${id}"><span aria-hidden="true">${ico}</span><span><strong>${t}</strong><small>${s}</small></span></button>`).join('')}`;
  document.body.append(m);
  const r = boton.getBoundingClientRect();
  m.style.top = `${r.bottom + 8}px`;
  m.style.left = `${Math.max(12, Math.min(window.innerWidth - m.offsetWidth - 12, r.right - m.offsetWidth))}px`;
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-onb-menu]');
    if (!b) return;
    cerrarMenu();
    const id = b.dataset.onbMenu;
    if (id === 'recorrido') recorridoPrincipal();
    if (id === 'pantalla') tour(TOURS_VISTA[ctx.vista]);
    if (id === 'pasos') { if (ctx.estado.cerrado) guardar({ cerrado: false }); pintarPastilla(); abrirPastilla(); }
    if (id === 'todo') verTodas();
    if (id === 'preview') elegirPreview();
  });
  setTimeout(() => document.addEventListener('click', cerrarMenuFuera, { once: true }), 0);
}
function cerrarMenuFuera(e) { if (!e.target.closest('#onb-menu')) cerrarMenu(); else document.addEventListener('click', cerrarMenuFuera, { once: true }); }
function cerrarMenu() { document.getElementById('onb-menu')?.remove(); }

// ---------- Superadmin: «Ver como usuario nuevo» ----------
export function elegirPreview() {
  mostrarBurbuja({
    centro: true,
    titulo: '🎓 Ver como usuario nuevo',
    html: `<p>Elige qué tipo de persona y verás el onboarding desde cero, exactamente como le saldrá. <strong>No se guarda nada</strong> y no cambia lo de nadie.</p>
      <div class="onb-roles">${ROLES_ONB.map((r) => `<button type="button" class="onb-rol" data-onb-rol="${r.id}"><strong>${esc(r.nombre)}</strong><small>${esc(r.desc)}</small></button>`).join('')}</div>`,
    botones: [{ txt: 'Cancelar', clase: 'ghost', fn: () => cerrarBurbuja() }],
  });
  capa.addEventListener('click', (e) => {
    const b = e.target.closest('[data-onb-rol]');
    if (!b) return;
    try { sessionStorage.setItem(LS_PREVIEW, b.dataset.onbRol); } catch { /* sin almacenamiento */ }
    location.reload();
  });
}
export function salirPreview() { try { sessionStorage.removeItem(LS_PREVIEW); } catch { /* sin almacenamiento */ } location.reload(); }
export function leerPreview() { try { return sessionStorage.getItem(LS_PREVIEW) || ''; } catch { return ''; } }
function pintarPreview() {
  let el = document.getElementById('onb-preview');
  if (!ctx.preview) { el?.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'onb-preview';
    el.className = 'onb-preview';
    document.body.append(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-onb-salir]')) salirPreview();
      if (e.target.closest('[data-onb-otra]')) location.reload();
      if (e.target.closest('[data-onb-rol-cambiar]')) elegirPreview();
    });
  }
  const r = ROLES_ONB.find((x) => x.id === ctx.rol);
  el.innerHTML = `<span>🎓 <strong>Vista previa:</strong> así lo ve ${r ? `un/a <strong>${esc(r.nombre)}</strong>` : 'alguien'} que entra por primera vez. No se guarda nada.</span>
    <button type="button" class="btn small" data-onb-otra>↺ Empezar de nuevo</button><button type="button" class="btn small" data-onb-rol-cambiar>Otro rol</button><button type="button" class="btn small primary" data-onb-salir>Salir de la vista previa</button>`;
}
