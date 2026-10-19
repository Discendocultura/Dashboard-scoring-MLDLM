// Embudos del dashboard: los lanzamientos (uno por código) y las VSL (siempre abiertas, una por id).
// Tareas, llamadas y seguimiento de vídeo usan el id de la VSL como código.
export const VSL = 'vsl';

export const esVsl = (config, code) => Boolean(code && config.vsls?.[code]);

export const esMeteorico = (config, code) => Boolean(code && config.meteoricos?.[code]);

export const esDirecta = (config, code) => Boolean(code && config.directas && Object.hasOwn(config.directas, code));

export function embudoDe(config, code) {
  if (esVsl(config, code)) return { ...config.vsls[code], id: code, esVsl: true };
  if (esMeteorico(config, code)) return { ...config.meteoricos[code], id: code, esMeteorico: true };
  if (esDirecta(config, code)) return { ...config.directas[code], id: code, esDirecta: true };
  if (code && config.cruzadas && Object.hasOwn(config.cruzadas, code)) return { ...config.cruzadas[code], id: code, esCruzada: true };
  return config.launches?.[code] || null;
}

// VSL por defecto (páginas sin ?v=): la primera.
export const primeraVsl = (config) => Object.keys(config.vsls || {})[0] || '';

// Embudos asignados a cada persona («no me interesa este setter en este embudo»): `embudosEn` = { <cliente>: [ids] }.
// Sin lista (o vacía): todos. Admin y superadmin, siempre todos. null = sin límite.
export function embudosPermitidos(u, cid, rol) {
  if (!u || u.superadmin || rol === 'admin') return null;
  const l = u.embudosEn?.[cid];
  return Array.isArray(l) && l.length ? l : null;
}

// Embudo al que pertenece un código (lanzamiento, VSL, venta directa, meteórico o el propio embudo). '' si no se sabe.
export function embudoDeCodigo(config, code) {
  if (!code) return '';
  const l = config.launches?.[code];
  if (l) return l.embudo || '';
  if (config.vsls?.[code] || esDirecta(config, code) || config.cruzadas?.[code]) return code;
  const m = config.meteoricos?.[code];
  if (m) return m.embudo || (m.lanzamiento ? config.launches?.[m.lanzamiento]?.embudo || '' : '');
  return (config.embudos || []).some((e) => e.id === code) ? code : '';
}

// ¿Puede ver este código? (sin límite, o el código no es de ningún embudo conocido → sí).
export function puedeVerCodigo(config, code, permitidos) {
  if (!permitidos || !code) return true;
  const e = embudoDeCodigo(config, code);
  return !e || permitidos.includes(e);
}

// La configuración solo con sus embudos (y sus lanzamientos, VSL, ventas directas y meteóricos).
export function configDeEmbudos(config, permitidos) {
  if (!permitidos) return config;
  const ok = (code) => puedeVerCodigo(config, code, permitidos);
  const sel = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => ok(k)));
  return {
    ...config,
    embudos: (config.embudos || []).filter((e) => permitidos.includes(e.id)),
    launches: sel(config.launches), vsls: sel(config.vsls), directas: sel(config.directas), meteoricos: sel(config.meteoricos), cruzadas: sel(config.cruzadas),
    embudosLimitados: true,
  };
}
