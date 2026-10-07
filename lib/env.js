// Variables de entorno. En Cloudflare llegan en cada petición (context.env) y las copiamos
// aquí con setEnv(); en local (Node) se rellenan desde process.env.
// Los «bindings» (p. ej. la base de datos D1 «DB») no son texto: van aparte, en `bindings`.
export const env = {};
export const bindings = {};

export function setEnv(source) {
  for (const [k, v] of Object.entries(source || {})) {
    if (typeof v === 'string') env[k] = v;
    else if (k === 'DB' && v && typeof v.prepare === 'function') bindings.DB = v;
  }
}
