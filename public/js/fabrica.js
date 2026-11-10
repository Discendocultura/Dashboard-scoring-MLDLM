// Fábrica de anuncios (Crear → Anuncios → 🏭 Fábrica de variaciones): de los anuncios que VENDEN, variaciones nuevas.
//   1. Ganadores: los anuncios de Meta del embudo con sus ventas reales (Hotmart, ThriveCart, Skool) y su creatividad.
//   2. Lote: qué ganadores variar, cuántas variaciones y qué cambiar.
//   3. Prompt de cada uno según su formato (imagen o vídeo), con la marca y por qué ganó.
//   4-5. Claude (con los conectores de Magnific y Google Drive) lee el lote con la herramienta «lote_anuncios» del
//        conector de AlquimIA, crea las variaciones en Magnific (imágenes, vídeos con IA o de stock) y las guarda en Drive.
// AlquimIA no llama a ninguna IA de imagen ni de vídeo: se usan los créditos de Magnific y el Drive que ya se pagan.
// Lo usan el navegador (pestaña) y el servidor (handlers/fabrica.js, lib/mcp-tools.js).
import { ventasEnArbol } from './origen.js';
import { realesDeNodo } from './publicidad.js';

const txt = (v, max = 400) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max);
const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;

// Anuncios del árbol de Publicidad (campañas → conjuntos → anuncios), con sus ventas reales, de más a menos vendedor.
// `porUtm` (de registrosReales): registros reales (GHL) por anuncio según sus UTM → CPL real. Sin él, el CPL de Meta.
export function ganadoresDe(arbol, ventas = [], { desde = '', hasta = '9999', porUtm = null } = {}) {
  if (!arbol?.campanas) return [];
  ventasEnArbol(arbol, ventas, { desde, hasta });
  const out = [];
  for (const c of arbol.campanas) {
    for (const s of c.hijos || []) {
      for (const a of s.hijos || []) {
        const m = a.m || {};
        const real = a.real || {};
        const ingresos = r2(real.ingresos);
        const leads = porUtm ? realesDeNodo(porUtm, { ...a, nivel: 'ad' }) : null;
        const ventasR = real.ventas || 0;
        out.push({
          id: String(a.id), nombre: a.nombre || '', campana: c.nombre || '', conjunto: s.nombre || '', estado: a.estado || '',
          gasto: r2(m.gasto), ctr: m.ctrEnlace ?? m.ctr ?? null, cpl: m.cpl ?? null, registros: m.registros || 0, compras: m.compras || 0,
          ventas: ventasR, ingresos, roasReal: m.gasto ? r2(ingresos / m.gasto) : null, roasMeta: m.roas ?? null, hook: m.hook ?? null,
          leads, cplReal: leads && m.gasto ? r2(m.gasto / leads) : null, cac: ventasR && m.gasto ? r2(m.gasto / ventasR) : null,
        });
      }
    }
  }
  return out.filter((a) => a.gasto > 0 || a.ventas > 0)
    .sort((a, b) => (b.ventas - a.ventas) || (b.ingresos - a.ingresos) || (b.compras - a.compras) || ((b.leads ?? b.registros) - (a.leads ?? a.registros)) || ((b.ctr || 0) - (a.ctr || 0)));
}

// Qué se puede cambiar en una variación (se eligen varios).
export const CAMBIOS = [
  { id: 'gancho', label: 'Gancho / primera frase', ico: '🪝', imagen: 'el titular grande de la imagen (otro gancho, misma promesa)', video: 'los 3 primeros segundos: otro gancho distinto' },
  { id: 'angulo', label: 'Ángulo del mensaje', ico: '🎯', imagen: 'el ángulo: dolor, deseo, objeción, prueba social o curiosidad', video: 'el ángulo del guion: dolor, deseo, objeción, prueba social o historia' },
  { id: 'persona', label: 'Persona / protagonista', ico: '🧑', imagen: 'la persona que sale (otra edad o estilo dentro del avatar)', video: 'quién habla o sale (otra persona del avatar)' },
  { id: 'fondo', label: 'Fondo y escena', ico: '🏞️', imagen: 'el fondo y la escena', video: 'el lugar y los planos de apoyo (B-roll)' },
  { id: 'estilo', label: 'Estilo visual', ico: '🎨', imagen: 'el estilo: foto real, ilustración, captura tipo nota, collage…', video: 'el estilo: cámara en mano, a cámara, tipo noticia, texto en pantalla…' },
  { id: 'formato', label: 'Formato (9:16, 1:1, 4:5)', ico: '📐', imagen: 'el formato: versiones 9:16 (stories/reels), 1:1 y 4:5', video: 'el formato: 9:16 y 1:1' },
  { id: 'cta', label: 'Llamada a la acción', ico: '👉', imagen: 'la llamada a la acción del diseño', video: 'el cierre y la llamada a la acción' },
  { id: 'stock', label: 'Con vídeo de stock', ico: '🎞️', imagen: '', video: 'montarlo con clips de stock de Magnific en vez de grabar o generar' },
];
export const cambiosPara = (tipo) => CAMBIOS.filter((c) => (tipo === 'video' ? c.video : c.imagen));

const eur = (n) => (n == null ? '–' : `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`);
const porQueGano = (a) => [
  a.ventas ? `${a.ventas} ventas reales (${eur(a.ingresos)}, ROAS real ${a.roasReal != null ? `${a.roasReal}x` : '–'})` : '',
  a.cac != null ? `CAC ${eur(a.cac)} (inversión ÷ ventas reales)` : '',
  a.leads ? `${a.leads} registros reales${a.cplReal != null ? ` · CPL real ${eur(a.cplReal)}` : ''}` : a.registros ? `${a.registros} registros según Meta${a.cpl != null ? ` a ${eur(a.cpl)}` : ''}` : '',
  a.ctr != null ? `CTR de enlace ${(Number(a.ctr) * 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} %` : '',
  a.gasto ? `${eur(a.gasto)} invertidos` : '',
].filter(Boolean).join(' · ');

// Prompt de las variaciones de UN ganador, según su formato. `marca`: { nombre, producto, tono, avatar, colores } (lo
// que haya). `cambios`: ids de CAMBIOS; `n`: cuántas variaciones; `notas`: indicaciones extra.
export function promptVariacion(item = {}, { marca = {}, n = 3, cambios = [], notas = '' } = {}) {
  const tipo = item.tipo === 'video' ? 'video' : 'imagen';
  const lista = cambiosPara(tipo).filter((c) => cambios.includes(c.id));
  const que = (lista.length ? lista : cambiosPara(tipo).slice(0, 2)).map((c) => `- ${tipo === 'video' ? c.video : c.imagen}`).join('\n');
  const m = [marca.nombre && `Marca: ${marca.nombre}`, marca.producto && `Producto: ${marca.producto}`, marca.avatar && `Cliente ideal: ${marca.avatar}`, marca.tono && `Tono: ${marca.tono}`, marca.colores && `Colores: ${marca.colores}`].filter(Boolean).join('\n');
  const base = `ANUNCIO GANADOR: «${txt(item.nombre, 120)}» (${tipo === 'video' ? 'vídeo' : 'imagen'})
Por qué es ganador: ${porQueGano(item) || 'de los que más venden del embudo'}
Texto del anuncio: ${txt(item.texto, 1200) || '(sin texto)'}
Título: ${txt(item.titulo, 200) || '(sin título)'}
${tipo === 'video' ? `Vídeo original: ${item.video || '(Meta no deja descargarlo: usa la miniatura de referencia)'}\nMiniatura de referencia: ${item.imagen || item.miniatura || '(no hay)'}` : `Imagen original (referencia): ${item.imagen || item.miniatura || '(no hay)'}`}
${m ? `\n${m}\n` : ''}`;
  if (tipo === 'imagen') {
    return `${base}
Crea ${n} variaciones de esta imagen que conserven lo que la hace ganar (la promesa, la composición y la claridad del mensaje) y cambien:
${que}
Reglas: el texto de la imagen en español de España, corto y legible en el móvil; nada de letra pequeña; respeta la marca y sus colores; sin logotipos de otras marcas; cada variación con una diferencia clara (no casi iguales).${notas ? `\nIndicaciones: ${txt(notas, 600)}` : ''}
Para cada variación, el copy de Meta: texto principal (2-4 líneas), título (máx. 40 caracteres) y su gancho en una frase.`;
  }
  return `${base}
Crea ${n} variaciones de este vídeo que conserven lo que lo hace ganar (la promesa y el ritmo) y cambien:
${que}
Para cada variación:
1. Guion con tiempos: gancho (0-3 s), desarrollo y llamada a la acción; frases cortas, en español de España, para leerse en pantalla.
2. Plan de planos: qué sale en cada plano (generado con IA a partir de la miniatura, o clip de stock de Magnific si encaja mejor).
3. El vídeo en Magnific (vertical 9:16, 15-30 s) y, si hace falta, la versión 1:1.
4. El copy de Meta: texto principal (2-4 líneas) y título (máx. 40 caracteres).${notas ? `\nIndicaciones: ${txt(notas, 600)}` : ''}`;
}

// Carpeta de Drive del lote: «Anuncios / <cliente> / <embudo> / <fecha> - <nombre del lote>».
export const carpetaLote = (lote = {}) => ['Anuncios', lote.clienteNombre || lote.cliente || 'Cliente', lote.embudoNombre || lote.embudo || 'Embudo', `${String(lote.creado ? new Date(lote.creado).toISOString().slice(0, 10) : '')} - ${txt(lote.nombre, 60) || 'Lote'}`].map((x) => String(x).replace(/[\\/:*?"<>|]+/g, '-').trim());

// Lo que Claude tiene que hacer con el lote (lo devuelve la herramienta «lote_anuncios» y se copia desde la pestaña).
export function instruccionesLote(lote = {}) {
  const carpeta = carpetaLote(lote).join(' / ');
  return `Eres el equipo creativo de anuncios. Este lote de AlquimIA tiene ${lote.items?.length || 0} anuncios ganadores a variar. Usa los conectores de Magnific y Google Drive.
Antes de empezar, lee «marca_y_narrativa» de AlquimIA (el mismo embudo) para respetar la marca, el avatar y el tono.
Para cada anuncio del lote, en orden:
1. Lee su prompt y su creatividad original (imagen o vídeo y su miniatura).
2. IMAGEN: crea las variaciones en Magnific a partir de la imagen original como referencia (variaciones de imagen o generar con referencia), con los cambios pedidos y sus formatos.
   VÍDEO: escribe los guiones; genera los planos o el vídeo en Magnific con IA a partir de la miniatura, o busca clips de STOCK en Magnific cuando encajen mejor (en especial si se pidió «Con vídeo de stock»), y monta el vídeo.
3. Espera a que Magnific termine y enséñame cada variación con su copy antes de seguir con el siguiente anuncio si te lo pido; si no, sigue.
4. Guarda todo en Google Drive en la carpeta «${carpeta}» (créala si no existe), con una subcarpeta por anuncio ganador: los archivos de las variaciones y un documento «Copys y prompts» con el copy de Meta de cada una y el prompt usado.
5. Al acabar, dime el enlace de la carpeta de Drive y llama a «marcar_lote_anuncios» de AlquimIA con ese enlace para dejar el lote como hecho.
No publiques nada en Meta: solo crear y guardar.`;
}

// La frase para pegar en Claude.
export const fraseClaude = (lote = {}, clienteId = '') => `Crea las variaciones del lote de anuncios «${txt(lote.nombre, 80)}» de AlquimIA${clienteId ? ` (cliente «${clienteId}»)` : ''}: léelo con la herramienta «lote_anuncios» de AlquimIA (id ${lote.id}) y sigue sus instrucciones con Magnific y Google Drive.`;

// Lote limpio (lo que llega del navegador): campos conocidos, con su tamaño.
export function sanitizeLote(l = {}, { ahora = Date.now() } = {}) {
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const url = (v) => { const s = txt(v, 2000); return /^https:\/\//i.test(s) ? s : ''; };
  const items = (Array.isArray(l.items) ? l.items : []).slice(0, 12).map((it) => ({
    id: txt(it.id, 30), nombre: txt(it.nombre, 160), campana: txt(it.campana, 160), conjunto: txt(it.conjunto, 160),
    tipo: it.tipo === 'video' ? 'video' : it.tipo === 'carrusel' ? 'carrusel' : 'imagen',
    imagen: url(it.imagen), miniatura: url(it.miniatura), video: url(it.video), texto: txt(it.texto, 2000), titulo: txt(it.titulo, 200), enlace: url(it.enlace),
    gasto: num(it.gasto), ventas: num(it.ventas), ingresos: num(it.ingresos), roasReal: num(it.roasReal), ctr: num(it.ctr), registros: num(it.registros), cpl: num(it.cpl), leads: num(it.leads), cplReal: num(it.cplReal), cac: num(it.cac),
    n: Math.min(Math.max(Math.round(Number(it.n) || 3), 1), 10),
    cambios: (Array.isArray(it.cambios) ? it.cambios : []).filter((c) => CAMBIOS.some((x) => x.id === c)).slice(0, 8),
    prompt: txt(it.prompt, 8000),
  })).filter((it) => /^\d{1,25}$/.test(it.id));
  return {
    id: /^[a-z0-9]{6,24}$/.test(String(l.id || '')) ? l.id : `l${ahora.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    nombre: txt(l.nombre, 80) || 'Lote de variaciones',
    embudo: txt(l.embudo, 60), embudoNombre: txt(l.embudoNombre, 80), code: txt(l.code, 40), cliente: txt(l.cliente, 40), clienteNombre: txt(l.clienteNombre, 80),
    notas: txt(l.notas, 1000),
    creado: Number(l.creado) || ahora, por: txt(l.por, 60),
    estado: ['pendiente', 'hecho'].includes(l.estado) ? l.estado : 'pendiente',
    drive: url(l.drive),
    items,
  };
}
