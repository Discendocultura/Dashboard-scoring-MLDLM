// Variables de entorno. En Cloudflare llegan en cada petición (context.env) y las copiamos
// aquí con setEnv(); en local (Node) se rellenan desde process.env.
export const env = {};

export function setEnv(source) {
  for (const [k, v] of Object.entries(source || {})) if (typeof v === 'string') env[k] = v;
}
