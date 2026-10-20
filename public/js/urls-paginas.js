// URLs propuestas para las páginas de un embudo nuevo que se crea de cero («＋ Nuevo embudo» → Páginas y WhatsApp):
// dominio + nombre del embudo + qué página es, p. ej. https://midominio.com/el-camino-registro-ads.
// Se guardan en el embudo (`urls: { dominio, nombre }`) y se usan en Crear → Páginas, en los lanzamientos
// nuevos (rellenan sus enlaces) y en el prompt del grupo de WhatsApp.

// «Webinar «El Camino»» → «el-camino» (sin tildes, eñes ni símbolos).
export const slugUrl = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/ñ/g, 'n')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .slice(0, 40).replace(/-+$/, '');

// «midominio.com/», «https://www.midominio.com/algo» → «https://www.midominio.com» ('' si no vale).
export function dominioValido(d) {
  let s = String(d || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname) ? `https://${u.hostname.toLowerCase()}` : '';
  } catch {
    return '';
  }
}

// Páginas de cada tipo de embudo: id, página de Crear → Páginas a la que corresponde, nombre y final de la URL.
// El registro va en dos páginas: una para el tráfico orgánico y otra para la publicidad (así se distinguen).
const ESQUEMA = {
  lanzamientos: [
    { id: 'registro', pagina: 'registro', nombre: 'Registro · orgánico (redes, bio, emails)', fin: 'registro' },
    { id: 'registro-ads', pagina: 'registro', nombre: 'Registro · publicidad (anuncios de Meta)', fin: 'registro-ads' },
    { id: 'gracias', pagina: 'gracias', nombre: 'Gracias por registrarte', fin: 'gracias' },
    { id: 'login', pagina: 'login', nombre: 'Acceso a las clases (login)', fin: 'acceso', preclase: true },
    { id: 'preclase', pagina: 'preclase', nombre: 'Preclase (clases y recursos)', fin: 'preclase', preclase: true },
    { id: 'grabacion', pagina: 'grabacion', nombre: 'Grabación del directo (replay)', fin: 'replay' },
    { id: 'venta', pagina: 'venta', nombre: 'Página de venta', fin: 'inscripcion' },
    { id: 'pago', pagina: 'pago', nombre: 'Página de pago', fin: 'pago' },
    { id: 'gracias-compra', pagina: 'gracias-compra', nombre: 'Gracias por comprar', fin: 'bienvenida' },
    { id: 'gracias-llamada', pagina: 'gracias-llamada', nombre: 'Gracias por agendar la llamada', fin: 'cita-confirmada', llamadas: true },
  ],
  vsl: [
    { id: 'registro', pagina: 'registro', nombre: 'Registro · orgánico (redes, bio, emails)', fin: 'registro' },
    { id: 'registro-ads', pagina: 'registro', nombre: 'Registro · publicidad (anuncios de Meta)', fin: 'registro-ads' },
    { id: 'gracias', pagina: 'gracias', nombre: 'Gracias por registrarte', fin: 'gracias' },
    { id: 'vsl', pagina: 'vsl', nombre: 'Página del contenido (VSL)', fin: 'video' },
    { id: 'gracias-llamada', pagina: 'gracias-llamada', nombre: 'Gracias por agendar la llamada', fin: 'cita-confirmada', llamadas: true },
    { id: 'gracias-compra', pagina: 'gracias-compra', nombre: 'Gracias por comprar', fin: 'bienvenida' },
  ],
  meteorico: [
    { id: 'oferta', pagina: 'oferta', nombre: 'Página de la oferta', fin: 'oferta' },
    { id: 'gracias-compra', pagina: 'gracias-compra', nombre: 'Gracias por comprar', fin: 'bienvenida' },
  ],
  directa: [
    { id: 'venta', pagina: 'venta', nombre: 'Página de venta', fin: '' },
    { id: 'checkout', pagina: 'checkout', nombre: 'Checkout (pago con bumps)', fin: 'pago' },
    { id: 'upsell', pagina: 'upsell', nombre: 'Upsell', fin: 'especial', parte: 'upsell' },
    { id: 'downsell', pagina: 'downsell', nombre: 'Downsell', fin: 'alternativa', parte: 'downsell' },
    { id: 'gracias', pagina: 'gracias', nombre: 'Gracias por comprar (acceso)', fin: 'gracias' },
  ],
};

// [{ id, pagina, nombre, url }] para el embudo. Sin dominio o sin nombre válidos: [].
//   opts: { preclase (false = sin área preclase), sinLlamadas, partes (venta directa) }
export function urlsPropuestas(tipo, { dominio = '', nombre = '' } = {}, { preclase = true, sinLlamadas = false, partes = null } = {}) {
  const dom = dominioValido(dominio);
  const slug = slugUrl(nombre);
  if (!dom || !slug) return [];
  return (ESQUEMA[tipo] || [])
    .filter((p) => !(p.preclase && preclase === false) && !(p.llamadas && sinLlamadas) && !(p.parte && partes && !partes[p.parte]))
    .map((p) => ({ id: p.id, pagina: p.pagina, nombre: p.nombre, url: `${dom}/${p.fin ? `${slug}-${p.fin}` : slug}` }));
}

// Campos de enlace de un lanzamiento que salen de las URLs propuestas (los rellenan al crearlo).
export const CAMPOS_LANZAMIENTO = { registro: 'registroUrl', 'registro-ads': 'registroAdsUrl', gracias: 'graciasUrl', login: 'loginUrl', preclase: 'recursosUrl', grabacion: 'replayUrl', venta: 'raicesUrl', pago: 'paginaPagoUrl' };
export function enlacesLanzamiento(propuestas = []) {
  const out = {};
  for (const p of propuestas) if (CAMPOS_LANZAMIENTO[p.id]) out[CAMPOS_LANZAMIENTO[p.id]] = p.url;
  return out;
}

// Un lanzamiento con sus enlaces vacíos completados con las URLs propuestas de su embudo (lo suyo manda).
export function conEnlacesPropuestos(launch, propuestas = []) {
  if (!launch || !propuestas.length) return launch;
  const out = { ...launch };
  for (const [k, u] of Object.entries(enlacesLanzamiento(propuestas))) if (!out[k]) out[k] = u;
  return out;
}

// Texto para copiar todas de una vez: «Nombre: URL» por línea.
export const urlsTexto = (propuestas = []) => propuestas.map((p) => `${p.nombre}: ${p.url}`).join('\n');

// Configuración → Accesos y enlaces: las páginas del lanzamiento (las URLs propuestas y las que ya tenga puestas),
// como accesos de tipo «página» con el nombre del lanzamiento delante. → [{ tipo: 'pagina', nombre, url }]
const NOMBRE_CAMPO = { registroUrl: 'Registro · orgánico', registroAdsUrl: 'Registro · publicidad', graciasUrl: 'Gracias por registrarte', loginUrl: 'Acceso a las clases (login)', recursosUrl: 'Preclase (clases y recursos)', replayUrl: 'Grabación del directo (replay)', raicesUrl: 'Página de venta', paginaPagoUrl: 'Página de pago' };
export function accesosDePaginas(launch = {}, propuestas = []) {
  const pre = String(launch.name || '').trim().slice(0, 24);
  const nombre = (n) => `${pre ? `${pre} · ` : ''}${n}`.slice(0, 60);
  const out = propuestas.map((p) => ({ tipo: 'pagina', nombre: nombre(p.nombre), url: p.url }));
  for (const [k, n] of Object.entries(NOMBRE_CAMPO)) {
    const u = String(launch[k] || '').trim();
    if (/^https:\/\//i.test(u) && !out.some((a) => a.url === u)) out.push({ tipo: 'pagina', nombre: nombre(n), url: u });
  }
  return out.filter((a) => /^https:\/\//i.test(a.url));
}
// Añade los accesos nuevos sin duplicar (misma URL o mismo nombre: manda el nuevo).
export const conAccesos = (accesos = [], nuevos = []) => [...accesos.filter((a) => !nuevos.some((n) => n.url === a.url || n.nombre === a.nombre)), ...nuevos].slice(-80);
