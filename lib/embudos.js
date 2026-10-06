// Embudos del dashboard: los lanzamientos (uno por código) y la VSL, que está siempre abierta.
// Tareas, llamadas y seguimiento de vídeo usan el código «vsl» para la VSL.
export const VSL = 'vsl';

export function embudoDe(config, code) {
  if (code === VSL) return { ...config.vsl, esVsl: true };
  return config.launches?.[code] || null;
}
