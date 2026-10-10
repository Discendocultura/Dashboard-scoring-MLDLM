// Formulario de Marca y avatar: lo mismo en el dashboard (equipo) y en /marca.html (el cliente con su enlace).
//   pintarSecciones(secciones, respuestas, { ambito, productoId }) → HTML de las preguntas
//   valorCampo(el) → lo que hay escrito en una pregunta
//   autoguardado(raiz, guardar) → guarda cada pregunta al dejar de escribir (por campos: no pisa a nadie)
//   extraerTexto(file) → texto de un PDF, Word (.docx), TXT, MD o CSV (en el navegador)
import { DOC_EXT } from './marca.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function campo(q, v, base, filas = 0) {
  const name = `${base}:${q.id}`;
  const label = `${esc(q.label)}${q.opcional ? ' <small class="mq-opc">(opcional)</small>' : ''}`;
  const ej = q.ej ? ` placeholder="${esc(q.ej)}"` : '';
  const attrs = `data-mq="${esc(name)}" data-tipo="${q.tipo}"`;
  if (q.tipo === 'opciones' || q.tipo === 'varias') {
    const sel = new Set([].concat(v || []));
    const tipo = q.tipo === 'opciones' ? 'radio' : 'checkbox';
    return `<fieldset class="mq-chips" ${attrs}><legend>${label}</legend>${q.opciones.map((o) => `<label class="mq-chip"><input type="${tipo}" name="${esc(name)}" value="${esc(o)}"${sel.has(o) ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</fieldset>`;
  }
  if (q.tipo === 'color') {
    return `<label class="field mq-color"><span>${label}</span><span class="mq-color-fila"><input type="color" value="${esc(v || '#ffffff')}" data-mq-color aria-label="Elegir ${esc(q.label)}"><input type="text" ${attrs} value="${esc(v || '')}" placeholder="#RRGGBB" maxlength="7" spellcheck="false"></span></label>`;
  }
  if (q.tipo === 'largo' || q.tipo === 'urls') {
    const rows = filas || (q.tipo === 'urls' ? 3 : 4);
    return `<label class="field"><span>${label}</span><textarea ${attrs} rows="${rows}"${ej}>${esc(v || '')}</textarea></label>`;
  }
  return `<label class="field"><span>${label}</span><input type="${q.tipo === 'url' ? 'url' : 'text'}" ${attrs} value="${esc(v || '')}"${ej}></label>`;
}

// `base`: «marca» o «producto:<id>» (va en cada campo para saber dónde guardarlo).
export function pintarSecciones(secciones, respuestas, base, { abiertas = false } = {}) {
  return secciones.map((s) => {
    const hechas = s.preguntas.filter((q) => { const v = respuestas?.[q.id]; return Array.isArray(v) ? v.length : v; }).length;
    return `<details class="mq-sec"${abiertas ? ' open' : ''} data-mq-sec="${esc(s.id)}">
      <summary><span class="mq-sec-ico" aria-hidden="true">${s.icono}</span><strong>${esc(s.titulo)}</strong><span class="mq-sec-prog${hechas === s.preguntas.length ? ' ok' : ''}">${hechas}/${s.preguntas.length}</span></summary>
      ${s.intro ? `<p class="muted small">${esc(s.intro)}</p>` : ''}
      <div class="mq-campos">${s.preguntas.map((q) => campo(q, respuestas?.[q.id], base)).join('')}</div>
    </details>`;
  }).join('');
}

// Unas preguntas sueltas (el asistente: unas pocas por paso, sin secciones). `filas`: alto de los párrafos.
export function pintarCampos(preguntas, respuestas, base, { filas = 3 } = {}) {
  return `<div class="mq-campos as-campos">${preguntas.map((q) => `<div class="as-campo" data-as-q="${esc(q.id)}">${campo(q, respuestas?.[q.id], base, filas)}</div>`).join('')}</div>`;
}

export function valorCampo(el) {
  if (el.matches('fieldset')) {
    const marcados = [...el.querySelectorAll('input:checked')].map((i) => i.value);
    return el.dataset.tipo === 'opciones' ? marcados[0] || '' : marcados;
  }
  return el.value;
}

// Guarda al dejar de escribir (1,2 s) o al cambiar una opción. `guardar({ base, campos })` → promesa.
// `estado(texto)` enseña «Guardando…», «Guardado» o el error.
export function autoguardado(raiz, guardar, estado = () => {}) {
  const pendientes = new Map(); // base → { id: valor }
  let timer = null;
  let enCurso = Promise.resolve();
  const vaciar = () => {
    clearTimeout(timer);
    if (!pendientes.size) return enCurso;
    const lotes = [...pendientes.entries()];
    pendientes.clear();
    estado('Guardando…');
    enCurso = enCurso.then(async () => {
      try {
        for (const [base, campos] of lotes) await guardar({ base, campos });
        estado('✓ Guardado');
      } catch (e) {
        // Se vuelve a intentar con lo que no se guardó.
        for (const [base, campos] of lotes) pendientes.set(base, { ...campos, ...(pendientes.get(base) || {}) });
        estado(`No se ha podido guardar: ${e.message}. Se reintentará.`, true);
        timer = setTimeout(vaciar, 8000);
      }
    });
    return enCurso;
  };
  const apuntar = (el, ya = false) => {
    const [base, id] = splitName(el.dataset.mq);
    pendientes.set(base, { ...(pendientes.get(base) || {}), [id]: valorCampo(el) });
    estado('Sin guardar…');
    clearTimeout(timer);
    timer = setTimeout(vaciar, ya ? 50 : 1200);
  };
  raiz.addEventListener('input', (e) => {
    if (e.target.matches('[data-mq-color]')) {
      const txt = e.target.parentElement.querySelector('[data-mq]');
      txt.value = e.target.value;
      apuntar(txt);
      return;
    }
    const el = e.target.closest('[data-mq]');
    if (!el) return;
    if (el.dataset.tipo === 'color' && /^#[0-9a-f]{6}$/i.test(el.value)) el.parentElement.querySelector('[data-mq-color]').value = el.value;
    apuntar(el, el.matches('fieldset'));
  });
  raiz.addEventListener('focusout', (e) => { if (e.target.closest('[data-mq]') && pendientes.size) vaciar(); });
  window.addEventListener('beforeunload', (e) => { if (pendientes.size) { vaciar(); e.preventDefault(); } });
  return { vaciar, pendientes: () => pendientes.size };
}
// «producto:pabc:dolores» → ['producto:pabc', 'dolores']
function splitName(n) {
  const i = n.lastIndexOf(':');
  return [n.slice(0, i), n.slice(i + 1)];
}
export const destinoDeBase = (base) => (base.startsWith('producto:') ? { ambito: 'producto', productoId: base.slice(9) } : { ambito: 'marca', productoId: '' });

// ---- Documentos: el texto se saca en el navegador (al servidor solo va el texto) ----
const VENDOR = '/vendor';
const cargados = new Map();
function cargarScript(src) {
  if (!cargados.has(src)) {
    cargados.set(src, new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => { cargados.delete(src); ko(new Error('No se ha podido cargar el lector de documentos')); };
      document.head.append(s);
    }));
  }
  return cargados.get(src);
}

export const extDe = (nombre) => String(nombre || '').toLowerCase().split('.').pop();
export const ACCEPT_DOCS = DOC_EXT.map((e) => `.${e}`).join(',');

export async function extraerTexto(file) {
  const ext = extDe(file.name);
  if (!DOC_EXT.includes(ext)) throw new Error(`Formato no admitido (${ext}). Sube PDF, Word (.docx), TXT, MD o CSV.`);
  if (file.size > 25 * 1024 * 1024) throw new Error('El archivo pesa más de 25 MB.');
  if (ext === 'pdf') {
    await cargarScript(`${VENDOR}/pdfjs-3.11.174/pdf.min.js`);
    const pdfjs = window.pdfjsLib;
    pdfjs.GlobalWorkerOptions.workerSrc = `${VENDOR}/pdfjs-3.11.174/pdf.worker.min.js`;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      paginas.push(c.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').trim());
    }
    return paginas.join('\n\n');
  }
  if (ext === 'docx') {
    await cargarScript(`${VENDOR}/mammoth-1.6.0/mammoth.browser.min.js`);
    const r = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return r.value;
  }
  return file.text();
}
