// Cruce de los grupos de WhatsApp (SendFlow) con los leads de GHL.
// El CSV de SendFlow trae una fila por persona y grupo (Position;Group;Name;Number). Se compara por los
// últimos 9 dígitos del teléfono (así da igual si lleva +34, 0034 o nada) y se quitan las administradoras:
// quien está en todos los grupos (con 3 o más grupos). Lo usan el navegador y los tests.

// Clave de un teléfono para cruzar: sus últimos 9 dígitos ('' si tiene menos de 8).
export function claveTelefono(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-9) : '';
}

// Lee el CSV: separador ; o , (con comillas opcionales). Devuelve { claves: Set, personas, grupos, admins }.
export function leerMiembros(csv) {
  const lineas = String(csv || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lineas.length) return { claves: new Set(), personas: 0, grupos: 0, admins: 0 };
  const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';
  const celdas = (l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
  const cab = celdas(lineas[0]).map((c) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  let iNum = cab.findIndex((c) => /^(number|numero|telefone|telefono|phone|whatsapp)/.test(c));
  let iGrupo = cab.findIndex((c) => /^(group|grupo)/.test(c));
  const conCabecera = iNum >= 0;
  if (!conCabecera) { iNum = 3; iGrupo = 1; }
  const gruposDe = new Map(); // clave → Set de grupos
  const todos = new Set();
  for (const l of lineas.slice(conCabecera ? 1 : 0)) {
    const c = celdas(l);
    const k = claveTelefono(c[iNum]);
    if (!k) continue;
    const g = iGrupo >= 0 ? c[iGrupo] || '' : '';
    todos.add(g);
    if (!gruposDe.has(k)) gruposDe.set(k, new Set());
    gruposDe.get(k).add(g);
  }
  const nGrupos = todos.size;
  const claves = new Set();
  let admins = 0;
  for (const [k, gs] of gruposDe) {
    if (nGrupos >= 3 && gs.size === nGrupos) admins++;
    else claves.add(k);
  }
  return { claves, personas: claves.size, grupos: nGrupos, admins };
}
