// El catálogo de productos del cliente (Mi negocio → Productos) en el servidor.
//   cargarCatalogo() → catálogo limpio. La primera vez (si nunca se ha guardado), se rellena solo con los productos
//     que ya están puestos en sus embudos (catalogoDesdeConfig) y se guarda: así sale configurado sin hacer nada.
//   catalogoDesdeConfig(config) → { ivaPct, productos } a partir de lanzamientos, VSL, ventas directas y meteóricos.
//   fusionarCruzadas(catalogo, config) → { catalogo, cambios }: los productos de los embudos de ventas cruzadas
//     entran solos en el catálogo (los que faltan se crean; los que ya están, por etiqueta o nombre, se enlazan al
//     embudo y ganan las etiquetas que les falten). cargarCatalogo() lo aplica siempre y guarda si cambia algo.
import { getConfig } from './config-store.js';
import { leerJSON, guardarJSON } from './store.js';
import { sanitizeCatalogo, nuevoId } from '../public/js/productos.js';

export const CLAVE_PRODUCTOS = 'lsd_productos';
// En los embudos el IVA es 'incluido' | 'mas' | 'exento'; en el catálogo, 'incluido' | 'mas' | 'sin'.
const ivaDe = (m) => (m === 'mas' ? 'mas' : m === 'exento' ? 'sin' : 'incluido');
const tag = (t) => String(t || '').trim().toLowerCase();

export function catalogoDesdeConfig(config) {
  const productos = [];
  const porTag = new Map(); // etiqueta → producto (para no repetir y para enlazar)
  const anadir = (p) => {
    const prod = { id: nuevoId('p'), tipo: 'otro', precio: 0, iva: 'incluido', fechaCampo: '', embudos: [], siguiente: '', ofertas: [], ...p };
    productos.push(prod);
    for (const t of [prod.etiqueta, ...prod.ofertas.map((o) => o.etiqueta)]) if (t) porTag.set(t, prod);
    return prod;
  };
  const conEmbudo = (p, id) => { if (id && !p.embudos.includes(id)) p.embudos.push(id); };
  const embLanz = config.embudos?.find((e) => e.tipo === 'lanzamientos')?.id || '';

  // 1. El producto principal: el de los lanzamientos (el último con etiqueta de compra; los demás precios, ofertas).
  const lanzs = Object.entries(config.launches || {}).filter(([, l]) => tag(l.compraTag))
    .sort((a, b) => String(b[1].inicioCaptacion || '').localeCompare(String(a[1].inicioCaptacion || '')));
  if (lanzs.length) {
    const [, l] = lanzs[0];
    const principal = anadir({
      nombre: String(config.marca?.producto || '').trim() || l.name || 'Programa', tipo: 'principal',
      precio: Number(l.precioPrograma) || 0, iva: ivaDe(l.iva?.programa), etiqueta: tag(l.compraTag), fechaCampo: l.compraDateField || '',
    });
    for (const [, x] of lanzs) {
      conEmbudo(principal, x.embudo || embLanz);
      const t = tag(x.compraTag);
      if (porTag.has(t)) continue;
      principal.ofertas.push({ id: nuevoId('o'), nombre: x.name || 'Otro lanzamiento', precio: Number(x.precioPrograma) || principal.precio, etiqueta: t });
      porTag.set(t, principal);
    }
  }
  // 2. VSL: vende el programa. Si ya está el principal, su etiqueta va como otra forma de comprarlo; si no, producto propio.
  for (const [id, v] of Object.entries(config.vsls || {})) {
    const t = tag(v.compraTag);
    if (!t || !config.embudos?.some((e) => e.id === id)) continue;
    const ya = porTag.get(t) || productos.find((p) => p.tipo === 'principal');
    if (ya) {
      conEmbudo(ya, id);
      if (!porTag.has(t)) { ya.ofertas.push({ id: nuevoId('o'), nombre: v.name || 'VSL', precio: Number(v.precioPrograma) || ya.precio, etiqueta: t }); porTag.set(t, ya); }
    } else anadir({ nombre: v.name || 'Programa', tipo: 'principal', precio: Number(v.precioPrograma) || 0, etiqueta: t, fechaCampo: v.compraDateField || '', embudos: [id] });
  }
  // 3. Ventas directas: su propio producto (de entrada) y, si tiene «producto principal», a ese es al que lleva.
  for (const [id, d] of Object.entries(config.directas || {})) {
    const t = tag(d.compraTag);
    if (!t || porTag.has(t)) continue;
    const nombre = d.producto || config.embudos?.find((e) => e.id === id)?.nombre || 'Producto de entrada';
    const p = anadir({ nombre, tipo: 'entrada', precio: Number(d.precio) || 0, iva: ivaDe(d.iva?.producto), etiqueta: t, fechaCampo: d.compraDateField || '', embudos: [id] });
    const u = d.upsellPrincipal;
    if (u?.tags?.length) {
      let destino = u.tags.map(tag).map((x) => porTag.get(x)).find(Boolean);
      if (!destino) {
        const [primera, ...resto] = u.tags.map(tag);
        destino = anadir({
          nombre: u.nombre || 'Producto principal', tipo: 'principal', precio: Number(u.precios?.[primera]) || 0, etiqueta: primera,
          ofertas: resto.map((x) => ({ id: nuevoId('o'), nombre: x, precio: Number(u.precios?.[x]) || 0, etiqueta: x })),
        });
      }
      p.siguiente = destino.id;
    }
  }
  // 4. Meteóricos: cada uno, su producto (si dos usan la misma etiqueta, uno solo).
  for (const [, m] of Object.entries(config.meteoricos || {})) {
    const t = tag(m.compraTag);
    if (!t || porTag.has(t)) continue;
    const emb = m.embudo || config.launches?.[m.lanzamiento]?.embudo || '';
    anadir({ nombre: m.producto || m.name || 'Meteórico', precio: Number(m.precio) || 0, etiqueta: t, fechaCampo: m.compraDateField || '', embudos: emb ? [emb] : [] });
  }
  return sanitizeCatalogo({ productos });
}

export function fusionarCruzadas(catalogo, config) {
  const productos = catalogo.productos.map((p) => ({ ...p, ofertas: [...p.ofertas], embudos: [...p.embudos] }));
  const tagsDe = (p) => [p.etiqueta, ...p.ofertas.map((o) => o.etiqueta)].filter(Boolean);
  let cambios = 0;
  for (const [id, c] of Object.entries(config.cruzadas || {})) {
    if (!config.embudos?.some((e) => e.id === id)) continue;
    for (const x of c?.productos || []) {
      const nombre = String(x?.nombre || '').trim();
      const tags = [...new Set([x?.tag, ...(x?.otras || []).map((o) => o?.tag)].map(tag).filter(Boolean))];
      if (!nombre || !tags.length) continue;
      const p = productos.find((y) => tagsDe(y).some((t) => tags.includes(t))) || productos.find((y) => y.nombre.trim().toLowerCase() === nombre.toLowerCase());
      if (!p) {
        productos.push({ id: nuevoId('p'), nombre, tipo: 'otro', precio: 0, iva: 'incluido', etiqueta: tags[0], fechaCampo: '', embudos: [id], siguiente: '',
          ofertas: tags.slice(1).map((t) => ({ id: nuevoId('o'), nombre: `Etiqueta ${t}`, precio: 0, etiqueta: t })) });
        cambios++;
        continue;
      }
      const faltan = tags.filter((t) => !tagsDe(p).includes(t));
      if (faltan.length || !p.embudos.includes(id)) cambios++;
      if (!p.etiqueta && faltan.length) p.etiqueta = faltan.shift();
      for (const t of faltan) p.ofertas.push({ id: nuevoId('o'), nombre: `Etiqueta ${t}`, precio: 0, etiqueta: t });
      if (!p.embudos.includes(id)) p.embudos.push(id);
    }
  }
  return { catalogo: cambios ? sanitizeCatalogo({ ...catalogo, productos }) : catalogo, cambios };
}

export async function cargarCatalogo() {
  const guardado = await leerJSON(CLAVE_PRODUCTOS, () => null);
  const config = await getConfig();
  const base = guardado ? sanitizeCatalogo(guardado) : catalogoDesdeConfig(config);
  const { catalogo, cambios } = fusionarCruzadas(base, config);
  if (!catalogo.productos.length || (guardado && !cambios)) return catalogo;
  try { await guardarJSON(CLAVE_PRODUCTOS, catalogo, { motivo: guardado ? 'Productos (de ventas cruzadas)' : 'Productos (desde los embudos)', version: null }); } catch (e) { console.error('Productos desde los embudos', e.message); }
  return catalogo;
}
