// Nombre del producto que se vende en los lanzamientos de cada cliente (en MLDLM, «Raíces»).
// Los textos del dashboard están escritos con «Raíces»: con otro cliente se cambia al suyo.
export const PRODUCTO_MLDLM = 'Raíces';
export const PRODUCTO_DEF = 'el programa';
export const nombreProducto = (config) => String(config?.marca?.producto || '').trim() || PRODUCTO_DEF;
export const conProducto = (texto, nombre) => (nombre && nombre !== PRODUCTO_MLDLM ? String(texto ?? '').replaceAll(PRODUCTO_MLDLM, nombre) : String(texto ?? ''));
