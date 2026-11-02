// Revisor de páginas: antes de darte el HTML que ha hecho Claude, comprueba que lleva bien los códigos de AlquimIA
// y arregla lo que pueda. Lo usan «✨ Crear con Claude» (Crear → Páginas) y el botón «Revisar mi código».
//   · Cada código que tiene que llevar la página (los de «Códigos para GHL»): que estén sus marcas data-lsd-* y su
//     <script>. Si falta alguno, se añade al final (con un comentario para moverlo si hace falta).
//   · El script de AlquimIA con el cliente (?c=…) correcto, y una sola vez.
//   · Botones de WhatsApp sin enlace (href vacío o «#» y sin data-lsd-link): se les pone el enlace de AlquimIA.
//   · Bloques que AlquimIA enseña u oculta (fases de la barra, del lanzamiento…): si el CSS los fuerza a verse con
//     «!important», saldrían todos a la vez; se añade una regla que respeta lo que oculta AlquimIA.
// → { html, cambios: [texto], avisos: [texto], ok: bool }

const ATTR_RE = /data-lsd-[a-z0-9-]+(?:\s*=\s*"[^"]*")?/gi;
const SCRIPT_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const OCULTABLES = ['data-lsd-fase-venta', 'data-lsd-phase', 'data-lsd-if', 'data-lsd-bonus', 'data-lsd-bonus-cerrado', 'data-lsd-caja'];
const GUARDA = `<style data-lsd-guarda>${OCULTABLES.map((a) => `[${a}][style*="display: none"]`).join(',')}{display:none!important}</style>`;
const norm = (s) => String(s || '').replace(/\s*=\s*/g, '=').replace(/'/g, '"').toLowerCase();

// Las marcas que identifican un código: sus atributos data-lsd-* (con su valor) y los src de sus scripts.
export function firmasDe(codigo) {
  const c = String(codigo || '');
  const attrs = [...new Set((c.match(ATTR_RE) || []).map(norm))]
    // las que el tracker añade solas o son de estado no identifican el bloque
    .filter((a) => !/^data-lsd-(ready|fixed|playing|locked|medido|cal|embed-src|cd-seg)\b/.test(a));
  const scripts = [...c.matchAll(SCRIPT_RE)].map((m) => m[1]);
  return { attrs, scripts };
}

const nombreScript = (src) => String(src).split('?')[0].split('/').pop();
const clienteDe = (src) => (/[?&]c=([^&"']+)/.exec(String(src)) || [])[1] || '';

export function revisarHtmlPagina(html, codigos = []) {
  let out = String(html || '');
  const cambios = [];
  const avisos = [];
  // Botones de WhatsApp sin enlace.
  const linkWa = codigos.map(([, c]) => /data-lsd-link\s*=\s*\\?"(whatsapp[A-Za-z-]*)/i.exec(c)?.[1]).find(Boolean);
  let sinEnlace = 0;
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (todo, attrs, dentro) => {
    if (!/whats\s*app|wa\.me/i.test(attrs + dentro) || /data-lsd-link/i.test(attrs)) return todo;
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1];
    if (href && href !== '#' && !/^javascript:/i.test(href)) return todo;
    sinEnlace++;
    if (!linkWa) return todo;
    return `<a data-lsd-link="${linkWa}"${attrs.replace(/\s*\bhref\s*=\s*["'][^"']*["']/i, '')} href="#">${dentro}</a>`;
  });
  if (sinEnlace) (linkWa ? cambios : avisos).push(linkWa ? `${sinEnlace} botón${sinEnlace === 1 ? '' : 'es'} de WhatsApp sin enlace: ahora usa${sinEnlace === 1 ? '' : 'n'} el de AlquimIA.` : `${sinEnlace} botón${sinEnlace === 1 ? '' : 'es'} de WhatsApp sin enlace: pon el del grupo o el de dudas.`);
  const tiene = (attr) => norm(out).includes(attr);
  const faltan = [];
  const scriptsPedidos = new Map(); // nombre → src pedido
  for (const [titulo, codigo] of codigos) {
    const f = firmasDe(codigo);
    for (const s of f.scripts) scriptsPedidos.set(nombreScript(s), s);
    const sin = f.attrs.filter((a) => !tiene(a));
    // Falta si no aparece su marca principal (la primera): las demás pueden ir repartidas por el diseño.
    if (f.attrs.length && sin.includes(f.attrs[0])) faltan.push([titulo, codigo]);
    else if (sin.length) avisos.push(`«${titulo}»: le falta ${sin.slice(0, 3).join(', ')}${sin.length > 3 ? '…' : ''}. Revisa que esa parte esté.`);
  }
  // Scripts: el que falta, se añade; el que va sin el cliente correcto, se corrige.
  const presentes = [...out.matchAll(SCRIPT_RE)].map((m) => ({ tag: m[0], src: m[1] }));
  for (const [nombre, src] of scriptsPedidos) {
    const mios = presentes.filter((p) => nombreScript(p.src) === nombre);
    if (!mios.length) {
      out += `\n<!-- AlquimIA: faltaba el código ${nombre} -->\n<script src="${src}" defer></script>`;
      cambios.push(`Añadido el código de AlquimIA (${nombre}), que faltaba.`);
      continue;
    }
    for (const p of mios) {
      if (clienteDe(p.src) !== clienteDe(src) || p.src.split('?')[0] !== src.split('?')[0]) {
        out = out.replace(p.tag, p.tag.replace(p.src, src));
        cambios.push(`Corregido el enlace de ${nombre} (${clienteDe(src) ? `con el cliente «${clienteDe(src)}»` : 'el de tu AlquimIA'}).`);
      }
    }
    if (mios.length > 1) avisos.push(`El código ${nombre} está ${mios.length} veces: basta con una (AlquimIA solo usa la primera).`);
  }
  // Bloques que faltan: al final, con su comentario.
  for (const [titulo, codigo] of faltan) {
    const sinScripts = String(codigo).replace(SCRIPT_RE, '').trim();
    if (!sinScripts) continue;
    out += `\n<!-- AlquimIA: faltaba «${titulo}». Muévelo a su sitio si hace falta. -->\n${sinScripts}`;
    cambios.push(`Añadido «${titulo}», que faltaba (al final de la página: muévelo si va en otro sitio).`);
  }
  // Lo que AlquimIA oculta, que siga oculto aunque el CSS fuerce «display … !important».
  const ocultables = OCULTABLES.filter((a) => new RegExp(`${a}\\b`, 'i').test(out));
  if (ocultables.length && !/data-lsd-guarda/.test(out) && /display\s*:\s*(?!none)[a-z-]+\s*!important/i.test(out)) {
    out = `${GUARDA}\n${out}`;
    cambios.push('El diseño forzaba que se vieran bloques que AlquimIA enseña según el momento (fases de la barra, bonus…): añadida una regla para que salga solo el que toca.');
  }
  if (!codigos.length) avisos.push('Esta página no lleva códigos de AlquimIA: no hay nada que comprobar.');
  return { html: out, cambios, avisos, ok: !cambios.length && !avisos.length };
}

// El HTML de la respuesta de Claude: el bloque ```html … ``` (o todo el texto si no lo hay).
export function htmlDeRespuesta(texto) {
  const t = String(texto || '');
  const m = /```(?:html)?\s*\n([\s\S]*?)```/i.exec(t);
  return (m ? m[1] : t).trim();
}
