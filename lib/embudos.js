// Embudos del dashboard: los lanzamientos (uno por código) y las VSL (siempre abiertas, una por id).
// Tareas, llamadas y seguimiento de vídeo usan el id de la VSL como código.
export const VSL = 'vsl';

export const esVsl = (config, code) => Boolean(code && config.vsls?.[code]);

export const esMeteorico = (config, code) => Boolean(code && config.meteoricos?.[code]);

export function embudoDe(config, code) {
  if (esVsl(config, code)) return { ...config.vsls[code], id: code, esVsl: true };
  if (esMeteorico(config, code)) return { ...config.meteoricos[code], id: code, esMeteorico: true };
  return config.launches?.[code] || null;
}

// VSL por defecto (páginas sin ?v=): la primera.
export const primeraVsl = (config) => Object.keys(config.vsls || {})[0] || '';
